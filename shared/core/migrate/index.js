// migrate — bring an EXISTING user's machine to the plugin-only layout (v4.14+).
//
// Older installers copied commands, skills, standards, knowledge and the full contract into
// ~/.claude and registered MCP servers at user scope. With the plugins installed those copies
// are loaded a second time on every turn (duplicate skill/command descriptions, duplicate MCP
// servers, a 20 KB CLAUDE.md). This module removes ONLY what the platform itself would have
// installed, and only when the plugin that now provides it is installed AND enabled.
//
//   planMigration(ctx, opts)  → { items[], blocked[], notes[] }   (read-only)
//   applyMigration(plan, opts) → backs everything up, then applies   (idempotent)
//
// Never touched: Trail/graft/code-cortex skills and hooks, other plugins' skills, user-authored
// skills/commands/standards (anything whose name is not in shared/), monitoring or DB MCP
// servers, ~/.claude.json (MCP removal goes through `claude mcp remove -s user`).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { globalKernelText } from "../plugin-manager/build.js";
import { resolveSpawn } from "../security/index.js";

export const EAP_KEY = "enterprise-ai-platform@eap-local";
export const KG_KEY = "knowledge-graph@eap-local";
// MCP servers the plugins register themselves; a user/project copy would start them twice
// (Claude Code does not dedupe — verified).
export const PLUGIN_OWNED_MCP = { "unified-trace": EAP_KEY, "opencode-bridge": EAP_KEY, "knowledge-graph": KG_KEY };

const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return null; } };
const names = (dir) => { try { return fs.readdirSync(dir).filter((n) => n !== ".DS_Store"); } catch { return []; } };
const lexists = (p) => { try { fs.lstatSync(p); return true; } catch { return false; } };

function pluginState(claudeDir) {
  const installed = readJson(path.join(claudeDir, "plugins", "installed_plugins.json"))?.plugins ?? {};
  const enabled = readJson(path.join(claudeDir, "settings.json"))?.enabledPlugins ?? {};
  const active = (key) => key in installed && enabled[key] !== false;
  return { eap: active(EAP_KEY), kg: active(KG_KEY), installed: Object.keys(installed) };
}

function defaultRunner(command, args) {
  const r = resolveSpawn(command, args);
  const p = spawnSync(r.command, r.args, { encoding: "utf8" });
  return { status: p.status ?? 1, out: `${p.stdout ?? ""}${p.stderr ?? ""}`.trim() };
}

export function planMigration(ctx, { home = os.homedir(), projects = [], pluginRoot = null, runner = defaultRunner } = {}) {
  const claudeDir = path.join(home, ".claude");
  const shared = path.join(ctx.repoRoot, "shared");
  const st = pluginState(claudeDir);
  const plan = { home, claudeDir, items: [], blocked: [], notes: [], state: st };
  const add = (it) => plan.items.push(it);

  if (!st.eap) plan.blocked.push(`${EAP_KEY} is not installed/enabled — nothing it provides is removed (run: claude plugin install ${EAP_KEY})`);
  if (!st.kg) plan.blocked.push(`${KG_KEY} is not installed/enabled — its skill and MCP server are left alone (run: claude plugin install ${KG_KEY})`);

  // 1. Plugin-provided content copied into ~/.claude by pre-4.14 installers: remove by NAME only.
  const groups = [];
  if (st.eap) {
    const skillNames = new Set(names(path.join(shared, "skills")));
    groups.push({ kind: "skill", dir: "skills", owned: skillNames });
    groups.push({ kind: "command", dir: "commands", owned: new Set(names(path.join(shared, "commands"))) });
    for (const d of ["standards", "rules", "knowledge"]) groups.push({ kind: d, dir: d, owned: new Set(names(path.join(shared, d))) });
  }
  if (st.kg) {
    const kgSkills = new Set(names(path.join(shared, "plugins", "knowledge-graph", "skills")));
    const g = groups.find((x) => x.kind === "skill");
    if (g) kgSkills.forEach((n) => g.owned.add(n)); else groups.push({ kind: "skill", dir: "skills", owned: kgSkills });
  }
  for (const g of groups) {
    for (const n of names(path.join(claudeDir, g.dir))) {
      if (g.owned.has(n)) add({ op: "remove", kind: g.kind, path: path.join(claudeDir, g.dir, n), why: `provided by the plugin (shared/${g.dir}/${n})` });
    }
  }
  if (st.eap && lexists(path.join(claudeDir, "company-profile.md"))) add({ op: "remove", kind: "knowledge-index", path: path.join(claudeDir, "company-profile.md"), why: "bundled in the plugin (ai-platform/company-profile.md)" });

  // 2. usage-logger: the plugin registers its own hook; a user-level one logs every prompt twice.
  const settingsFile = path.join(claudeDir, "settings.json");
  const settings = readJson(settingsFile);
  if (st.eap && settings?.hooks) {
    const dup = [];
    for (const [ev, entries] of Object.entries(settings.hooks)) for (const e of entries ?? []) for (const h of e.hooks ?? []) {
      if (/usage-logger\.js/.test(h.command ?? "") && !/CLAUDE_PLUGIN_ROOT/.test(h.command)) dup.push(`${ev}: ${h.command}`);
    }
    if (dup.length) add({ op: "settings-hooks", kind: "hook", path: settingsFile, remove: dup, why: "plugin ships usage-logger; user-level hook would double-log" });
    const hookFile = path.join(claudeDir, "hooks", "usage-logger.js");
    if (lexists(hookFile)) add({ op: "remove", kind: "hook-file", path: hookFile, why: "plugin ships usage-logger" });
  }

  // 3. CLAUDE.md → kernel only.
  const root = pluginRoot ?? path.join(ctx.repoRoot, "dist", "plugins", "claude-code", "plugins", "enterprise-ai-platform");
  const mdFile = path.join(claudeDir, "CLAUDE.md");
  if (st.eap) {
    if (!fs.existsSync(root) && !pluginRoot) {
      plan.blocked.push(`plugin bundle not built at ${root} — run: npm run plugin:build`);
    } else {
      const existing = fs.existsSync(mdFile) ? fs.readFileSync(mdFile, "utf8") : "";
      const content = globalKernelText(ctx, root, existing);
      if (content !== existing) add({ op: "write", kind: "claude-md", path: mdFile, content, why: `kernel only (${existing.length} → ${content.length} bytes); text outside the kernel markers is kept` });
    }
  }

  // 4. Duplicate MCP registrations at user scope (via the claude CLI — ~/.claude.json is never edited here).
  const userMcp = Object.keys(readJson(path.join(home, ".claude.json"))?.mcpServers ?? {});
  for (const n of userMcp) {
    const owner = PLUGIN_OWNED_MCP[n];
    if (!owner) continue;
    if ((owner === EAP_KEY && st.eap) || (owner === KG_KEY && st.kg)) add({ op: "mcp-remove", kind: "mcp", name: n, scope: "user", why: `registered by ${owner}` });
  }
  if (userMcp.includes("code-cortex-mcp")) plan.notes.push("user-scope MCP 'code-cortex-mcp' left in place — unified-trace spawns Code Cortex itself, so a separate registration only adds tool schemas; remove it with `claude mcp remove code-cortex-mcp -s user` if you do not call it directly");

  // 5. Project .mcp.json files given with --project.
  for (const dir of projects) {
    const f = path.join(dir, ".mcp.json");
    const j = readJson(f);
    if (!j?.mcpServers) { plan.notes.push(`${f}: not found or has no mcpServers`); continue; }
    const dups = Object.keys(j.mcpServers).filter((n) => PLUGIN_OWNED_MCP[n] && ((PLUGIN_OWNED_MCP[n] === EAP_KEY && st.eap) || (PLUGIN_OWNED_MCP[n] === KG_KEY && st.kg)));
    if (dups.length) add({ op: "project-mcp", kind: "mcp", path: f, remove: dups, why: "registered by the plugins" });
  }
  plan.runner = runner;
  return plan;
}

function backupPath(plan, stamp, p) {
  return path.join(plan.claudeDir, "backups", `eap-migrate-${stamp}`, path.relative(plan.home, p).replace(/^(\.\.[\\/])+/, ""));
}

function backup(plan, stamp, p) {
  const dst = backupPath(plan, stamp, p);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.cpSync(p, dst, { recursive: true, verbatimSymlinks: true });
}

export function applyMigration(plan, { apply = false, now = () => new Date() } = {}) {
  const stamp = now().toISOString().replace(/[:.]/g, "-");
  const report = [];
  const backupDir = path.join(plan.claudeDir, "backups", `eap-migrate-${stamp}`);
  for (const it of plan.items) {
    const line = { ...it, content: undefined, status: "dry-run" };
    try {
      if (!apply) { report.push(line); continue; }
      if (it.op === "remove") {
        backup(plan, stamp, it.path);
        fs.rmSync(it.path, { recursive: true, force: true });
      } else if (it.op === "write") {
        if (lexists(it.path)) backup(plan, stamp, it.path);
        fs.mkdirSync(path.dirname(it.path), { recursive: true });
        fs.writeFileSync(it.path, it.content);
      } else if (it.op === "settings-hooks") {
        backup(plan, stamp, it.path);
        const j = readJson(it.path);
        for (const [ev, entries] of Object.entries(j.hooks)) {
          j.hooks[ev] = entries.map((e) => ({ ...e, hooks: (e.hooks ?? []).filter((h) => !(/usage-logger\.js/.test(h.command ?? "") && !/CLAUDE_PLUGIN_ROOT/.test(h.command))) })).filter((e) => e.hooks.length);
          if (!j.hooks[ev].length) delete j.hooks[ev];
        }
        fs.writeFileSync(it.path, JSON.stringify(j, null, 2) + "\n");
      } else if (it.op === "project-mcp") {
        backup(plan, stamp, it.path);
        const j = readJson(it.path);
        for (const n of it.remove) delete j.mcpServers[n];
        fs.writeFileSync(it.path, JSON.stringify(j, null, 2) + "\n");
      } else if (it.op === "mcp-remove") {
        const r = plan.runner("claude", ["mcp", "remove", it.name, "-s", it.scope]);
        if (r.status !== 0) throw new Error(r.out || `claude mcp remove exited ${r.status}`);
      }
      line.status = "done";
    } catch (e) {
      line.status = "fail";
      line.error = e.message;
    }
    report.push(line);
  }
  if (apply && fs.existsSync(backupDir)) {
    fs.writeFileSync(path.join(backupDir, "MANIFEST.json"), JSON.stringify({ at: now().toISOString(), home: plan.home, items: report.map(({ op, kind, path: p, name, status, why }) => ({ op, kind, path: p, name, status, why })) }, null, 2) + "\n");
    plan.backupDir = backupDir;
  }
  // Empty directories left behind by removals (skills/, commands/, standards/ ...).
  if (apply) for (const d of ["skills", "commands", "standards", "rules", "knowledge"]) {
    const p = path.join(plan.claudeDir, d);
    if (fs.existsSync(p) && names(p).length === 0) { try { fs.rmdirSync(p); } catch { /* has dotfiles — keep */ } }
  }
  return report;
}
