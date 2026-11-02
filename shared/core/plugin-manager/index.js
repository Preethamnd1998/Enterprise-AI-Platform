// Plugin install / update / uninstall. DRY-RUN BY DEFAULT: nothing is written
// unless apply=true. `configRoot` relocates every client config dir under one
// folder (sandbox for tests / previews) — real user configs are only touched
// when apply=true AND configRoot is null.
//
// Never clobbers: files we did not install are backed up first
// (<file>.eap-backup-<ts>); an install manifest (.eap-install.json) records
// exactly what we wrote so uninstall removes only that.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { clientPaths } from "../path-resolver/index.js";
import { buildPlugins, CLIENTS } from "./build.js";

const MANIFEST = ".eap-install.json";

// Tolerant JSON/JSONC reader (comments + trailing commas); read-only use.
export function readJsonc(file) {
  let t;
  try { t = fs.readFileSync(file, "utf8"); } catch { return null; }
  let out = "", i = 0, str = false;
  while (i < t.length) {
    const c = t[i], n = t[i + 1];
    if (str) { out += c; if (c === "\\") { out += n ?? ""; i += 2; continue; } if (c === '"') str = false; i++; continue; }
    if (c === '"') { str = true; out += c; i++; continue; }
    if (c === "/" && n === "/") { while (i < t.length && t[i] !== "\n") i++; continue; }
    if (c === "/" && n === "*") { i += 2; while (i < t.length && !(t[i] === "*" && t[i + 1] === "/")) i++; i += 2; continue; }
    out += c; i++;
  }
  try { return JSON.parse(out.replace(/,(\s*[}\]])/g, "$1")); } catch { return null; }
}

// Which existing MCP entries (name -> stale?) a client config already holds. Read-only.
function existingMcp(client, ctx, configRoot) {
  const cp = clientPaths(ctx, configRoot);
  let map = {}, file = null;
  if (client === "opencode") {
    file = fs.existsSync(cp.opencode.configJsonc) ? cp.opencode.configJsonc : cp.opencode.configJson;
    map = readJsonc(file)?.mcp ?? {};
  } else if (client === "cursor") {
    file = cp.cursor.mcpJson;
    map = readJsonc(file)?.mcpServers ?? {};
  } else {
    file = cp.claude.userConfig;
    map = readJsonc(file)?.mcpServers ?? {};
  }
  const entries = Object.entries(map).map(([id, e]) => {
    const argv = Array.isArray(e.command) ? e.command : [e.command, ...(e.args ?? [])];
    const paths = argv.filter((a) => typeof a === "string" && (a.startsWith("/") || /^[A-Za-z]:[\\/]/.test(a)));
    const missing = paths.filter((a) => !fs.existsSync(a));
    return { id, remote: Boolean(e.url), stale: missing.length > 0, missing };
  });
  return { file, entries };
}
const sha = (f) => crypto.createHash("sha256").update(fs.readFileSync(f)).digest("hex");
const walk = (dir, base = dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(path.join(dir, e.name), base) : [path.relative(base, path.join(dir, e.name))]
  );

function readManifest(dir) {
  try { return JSON.parse(fs.readFileSync(path.join(dir, MANIFEST), "utf8")); } catch { return null; }
}

// Where each client's package gets installed.
export function targetFor(client, ctx, configRoot) {
  const cp = clientPaths(ctx, configRoot);
  if (client === "opencode") return { dir: cp.opencode.dir, verified: true, source: "pluginDir" };
  if (client === "cursor") {
    // Documented: cursor.com/docs/plugins "Test plugins locally" — copy (not symlink) the
    // plugin into ~/.cursor/plugins/local/<name>, then Developer: Reload Window.
    // Documented only; NOT exercised on a real Cursor install (none available here).
    return { dir: ctx.p.join(cp.cursor.dir, "plugins", "local", "enterprise-ai-platform"), verified: true, source: "pluginDir" };
  }
  return { dir: null, verified: true, source: "marketplace" }; // claude-code installs via its own CLI
}

function claudeCommands(root, ctx) {
  const q = (s) => (/\s/.test(s) ? `"${s}"` : s);
  return [
    `claude plugin marketplace add ${q(root)}`,
    "claude plugin install enterprise-ai-platform@eap-local",
  ];
}

function conflictsClaude(ctx, ids, configRoot) {
  const f = clientPaths(ctx, configRoot).claude.userConfig;
  try {
    const have = Object.keys(JSON.parse(fs.readFileSync(f, "utf8")).mcpServers ?? {});
    return ids.filter((i) => have.includes(i));
  } catch { return []; }
}

export function planInstall(client, ctx, built, { configRoot = null } = {}) {
  const b = built[client];
  const t = targetFor(client, ctx, configRoot);
  const plan = { client, version: b.version, target: t.dir, verifiedLocation: t.verified, ops: [], manual: [], warnings: [] };
  const ex = existingMcp(client, ctx, configRoot);
  plan.existingConfig = ex;
  if (client === "claude-code") {
    plan.manual = claudeCommands(b.root, ctx);
    const mcp = JSON.parse(fs.readFileSync(path.join(b.pluginDir, ".mcp.json"), "utf8")).mcpServers;
    plan.mcpEntries = Object.keys(mcp);
    plan.preserved = b.skippedMcp ?? [];
    if (plan.preserved.length) plan.warnings.push(`duplicate avoided: ${plan.preserved.join(", ")} already registered at user scope — kept yours, NOT added by the plugin (Claude does not dedupe: both would start). To switch to the plugin copies: claude mcp remove -s user <id>, then npm run plugin:build -- --prefer-plugin`);
    plan.note = "Registered through Claude's own plugin CLI; this tool never edits ~/.claude.json.";
    return plan;
  }
  const prev = readManifest(t.dir);
  const owned = new Map((prev?.files ?? []).map((f) => [f.path, f.sha]));
  const skip = (rel) => rel === "eap-plugin.json";
  for (const rel of walk(b.pluginDir).filter((r) => !skip(r))) {
    const src = path.join(b.pluginDir, rel);
    const dst = path.join(t.dir, rel);
    let action = "create";
    if (fs.existsSync(dst)) {
      if (sha(dst) === sha(src)) action = "same";
      else action = owned.has(rel.split(path.sep).join("/")) ? "update" : "backup+overwrite";
    }
    plan.ops.push({ rel: rel.split(path.sep).join("/"), src, dst, action });
  }
  if (client === "opencode") {
    const mine = Object.keys(JSON.parse(fs.readFileSync(path.join(b.pluginDir, "eap-plugin.json"), "utf8")).mcp);
    plan.mcpEntries = mine;
    const dup = ex.entries.filter((e) => mine.includes(e.id));
    plan.duplicates = dup.map((e) => e.id);
    for (const e of dup) plan.warnings.push(`MCP "${e.id}" already defined in ${path.basename(ex.file)}${e.stale ? ` and STALE (missing: ${e.missing.join(", ")})` : ""} — your entry wins; the plugin will not override it${e.stale ? ". Fix or remove that entry (global change, needs your approval) or the stale one stays active" : ""}`);
    plan.note = "No edit to opencode.json(c): MCP is injected at runtime by the plugin's config hook; commands/skills/agents are plain files.";
  }
  if (client === "cursor") {
    plan.mcpEntries = Object.keys(JSON.parse(fs.readFileSync(path.join(b.pluginDir, "mcp.json"), "utf8")).mcpServers);
    plan.duplicates = ex.entries.filter((e) => plan.mcpEntries.includes(e.id)).map((e) => e.id);
    plan.note = "No edit to ~/.cursor/mcp.json; the plugin ships its own mcp.json (servers show as plugin-enterprise-ai-platform-<id>).";
    plan.manual = ["Restart Cursor or run: Developer: Reload Window", "Cursor > Customize: confirm rules, skills, commands and MCP (plugin-enterprise-ai-platform-*) appear"];
    plan.warnings.push("Cursor local install is documented but untested on a real Cursor. Enterprise teams need admin setting 'Allow Local Plugin Imports'. A same-named marketplace plugin takes precedence. Copy only — symlinks to outside the folder are skipped by Cursor.");
  }
  return plan;
}

export function applyInstall(plan, { apply = false, now = () => Date.now() } = {}) {
  if (!apply || plan.client === "claude-code") return plan;
  fs.mkdirSync(plan.target, { recursive: true });
  const files = [];
  for (const op of plan.ops) {
    if (op.action === "backup+overwrite") fs.cpSync(op.dst, `${op.dst}.eap-backup-${now()}`);
    if (op.action !== "same") {
      fs.mkdirSync(path.dirname(op.dst), { recursive: true });
      fs.copyFileSync(op.src, op.dst);
    }
    files.push({ path: op.rel, sha: sha(op.dst) });
  }
  fs.writeFileSync(path.join(plan.target, MANIFEST), JSON.stringify({ name: "enterprise-ai-platform", version: plan.version, files }, null, 2) + "\n");
  return plan;
}

export function planUninstall(client, ctx, { configRoot = null } = {}) {
  const t = targetFor(client, ctx, configRoot);
  if (client === "claude-code") {
    return { client, ops: [], manual: ["claude plugin uninstall enterprise-ai-platform@eap-local", "claude plugin marketplace remove eap-local"] };
  }
  const m = readManifest(t.dir);
  if (!m) return { client, target: t.dir, ops: [], warnings: ["not installed (no manifest)"] };
  const ops = m.files.map((f) => {
    const dst = path.join(t.dir, ...f.path.split("/"));
    const action = !fs.existsSync(dst) ? "missing" : sha(dst) === f.sha ? "remove" : "keep-modified";
    return { rel: f.path, dst, action };
  });
  return { client, target: t.dir, ops };
}

export function applyUninstall(plan, { apply = false } = {}) {
  if (!apply || !plan.target) return plan;
  for (const op of plan.ops) if (op.action === "remove") fs.rmSync(op.dst, { force: true });
  fs.rmSync(path.join(plan.target, MANIFEST), { force: true });
  // prune now-empty dirs we created
  for (const op of plan.ops) {
    for (let d = path.dirname(op.dst); d.startsWith(plan.target) && d !== plan.target; d = path.dirname(d)) {
      try { fs.rmdirSync(d); } catch { break; }
    }
  }
  return plan;
}

export function selectClients(arg) {
  if (!arg || arg === "all") return CLIENTS;
  const list = arg.split(",").map((s) => s.trim());
  const bad = list.filter((c) => !CLIENTS.includes(c));
  if (bad.length) throw new Error(`unknown client(s): ${bad.join(", ")} (valid: ${CLIENTS.join(", ")}, all)`);
  return list;
}

export { buildPlugins, CLIENTS };
