// Plugin build/config generation + sandboxed install. Never touches real client configs.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { createContext } from "../path-resolver/index.js";
import { loadRegistry, serversForClient } from "../mcp-registry/index.js";
import { buildPlugins, planInstall, applyInstall, planUninstall, applyUninstall, selectClients } from "../plugin-manager/index.js";

const ctx = createContext();
const reg = loadRegistry(ctx);
const dist = fs.mkdtempSync(path.join(os.tmpdir(), "eap-dist-"));
const emptyCfg = fs.mkdtempSync(path.join(os.tmpdir(), "eap-cfg-"));
const built = buildPlugins(ctx, { outDir: dist, configRoot: emptyCfg });
const J = (...p) => JSON.parse(fs.readFileSync(path.join(...p), "utf8"));
const version = fs.readFileSync(path.join(ctx.repoRoot, "VERSION"), "utf8").trim();

test("claude-code plugin structure, manifest, MCP, hooks", () => {
  const p = built["claude-code"].pluginDir;
  assert.equal(J(p, ".claude-plugin/plugin.json").version, version);
  assert.equal(J(built["claude-code"].root, ".claude-plugin/marketplace.json").plugins[0].name, "enterprise-ai-platform");
  assert.deepEqual(Object.keys(J(p, ".mcp.json").mcpServers).sort(), serversForClient(reg, "claude-code", ctx.platform).sort());
  for (const s of Object.values(J(p, ".mcp.json").mcpServers)) assert.match(s.args[0], /launcher\.js$/);
  assert.ok(!fs.existsSync(path.join(p, "hooks")), "hooks are opt-in (audit.js writes into every project's .claude/)");
  const hb = buildPlugins(ctx, { clients: ["claude-code"], outDir: fs.mkdtempSync(path.join(os.tmpdir(), "eap-dist5-")), configRoot: emptyCfg, withHooks: true })["claude-code"].pluginDir;
  assert.deepEqual(Object.keys(J(hb, "hooks/hooks.json").hooks).sort(), ["PostToolUse", "Stop", "UserPromptSubmit"]);
  assert.ok(fs.existsSync(path.join(hb, "hooks/scripts/audit.js")));
  assert.ok(fs.existsSync(path.join(p, "commands/planning.md")) && fs.existsSync(path.join(p, "skills/audit-skill/SKILL.md")));
});

test("cursor plugin structure: manifest, rules(.mdc frontmatter), commands, skills, mcp.json", () => {
  const p = built.cursor.pluginDir;
  const m = J(p, ".cursor-plugin/plugin.json");
  assert.match(m.name, /^[a-z0-9][a-z0-9.-]*[a-z0-9]$/);
  assert.equal(m.version, version);
  const contract = fs.readFileSync(path.join(p, "rules/eap-contract.mdc"), "utf8");
  assert.match(contract, /^---\ndescription: .+\nalwaysApply: true\n---/);
  assert.ok(fs.readdirSync(path.join(p, "rules")).filter((f) => f.endsWith(".mdc")).length >= 5);
  assert.deepEqual(Object.keys(J(p, "mcp.json").mcpServers).sort(), serversForClient(reg, "cursor", ctx.platform).sort());
  assert.ok(fs.existsSync(path.join(p, "commands/bug-fix.md")) && fs.existsSync(path.join(p, "skills")));
  assert.ok(!fs.existsSync(path.join(p, "commands/README.md")));
  // manifest paths must be relative, no ".."
  assert.ok(!/\.\./.test(JSON.stringify(m)));
});

test("opencode plugin: valid JS, config hook adds MCP without overriding user entries, guard blocks .env", async () => {
  const f = path.join(built.opencode.pluginDir, "plugins/eap.js");
  assert.equal(spawnSync(ctx.nodeExe, ["--check", f]).status, 0);
  const mod = await import(pathToFileURL(f).href);
  const hooks = await mod.EnterpriseAIPlatform({});
  const cfg = { mcp: { "unified-trace": { type: "local", command: ["user-defined"] } } };
  await hooks.config(cfg);
  assert.deepEqual(cfg.mcp["unified-trace"].command, ["user-defined"]); // user wins
  await assert.rejects(hooks["tool.execute.before"]({ tool: "read" }, { args: { filePath: "/p/app/.env" } }), /EAP security/);
  await assert.rejects(hooks["tool.execute.before"]({ tool: "write" }, { args: { filePath: "C:\\p\\.ssh\\id_rsa" } }), /EAP security/);
  await hooks["tool.execute.before"]({ tool: "read" }, { args: { filePath: "/p/app/src/a.ts" } });
  const fresh = {};
  await hooks.config(fresh);
  assert.deepEqual(Object.keys(fresh.mcp), serversForClient(reg, "opencode", ctx.platform));
  assert.equal(fresh.mcp["unified-trace"].type, "local");
  for (const d of ["commands", "skills"]) assert.ok(fs.existsSync(path.join(built.opencode.pluginDir, d)));
});

test("sandboxed install: dry-run writes nothing; apply creates; rerun idempotent; uninstall removes only ours", () => {
  const sb = fs.mkdtempSync(path.join(os.tmpdir(), "eap-sb-"));
  const plan0 = planInstall("opencode", ctx, built, { configRoot: sb });
  applyInstall(plan0, { apply: false });
  assert.ok(!fs.existsSync(path.join(sb, ".config")), "dry-run must not write");
  assert.ok(plan0.target.startsWith(sb));

  // pre-existing user file with same path as one of ours + an unrelated user file
  const t = plan0.target;
  fs.mkdirSync(path.join(t, "commands"), { recursive: true });
  fs.writeFileSync(path.join(t, "commands/planning.md"), "USER VERSION");
  fs.writeFileSync(path.join(t, "agents-user.md"), "keep me");
  const plan1 = planInstall("opencode", ctx, built, { configRoot: sb });
  assert.equal(plan1.ops.find((o) => o.rel === "commands/planning.md").action, "backup+overwrite");
  applyInstall(plan1, { apply: true, now: () => 111 });
  assert.equal(fs.readFileSync(path.join(t, "commands/planning.md.eap-backup-111"), "utf8"), "USER VERSION");
  assert.ok(fs.existsSync(path.join(t, "plugins/eap.js")));

  const plan2 = planInstall("opencode", ctx, built, { configRoot: sb });
  assert.ok(plan2.ops.every((o) => o.action === "same"), "second run is a no-op");

  fs.appendFileSync(path.join(t, "commands/bug-fix.md"), "\nuser edit");
  const un = planUninstall("opencode", ctx, { configRoot: sb });
  assert.equal(un.ops.find((o) => o.rel === "commands/bug-fix.md").action, "keep-modified");
  applyUninstall(un, { apply: true });
  assert.ok(!fs.existsSync(path.join(t, "plugins/eap.js")));
  assert.ok(fs.existsSync(path.join(t, "agents-user.md")), "unrelated user file untouched");
  assert.ok(fs.existsSync(path.join(t, "commands/bug-fix.md")), "modified file kept");
  assert.ok(fs.existsSync(path.join(t, "commands/planning.md.eap-backup-111")), "backup kept");
});

test("claude-code: duplicate user-scope servers are NOT added by the plugin; install never edits ~/.claude.json", () => {
  const sb = fs.mkdtempSync(path.join(os.tmpdir(), "eap-sb-"));
  fs.writeFileSync(path.join(sb, ".claude.json"), JSON.stringify({ mcpServers: { "unified-trace": {} } }));
  const before = fs.readFileSync(path.join(sb, ".claude.json"), "utf8");
  const b2 = buildPlugins(ctx, { clients: ["claude-code"], outDir: fs.mkdtempSync(path.join(os.tmpdir(), "eap-dist3-")), configRoot: sb });
  assert.deepEqual(b2["claude-code"].skippedMcp, ["unified-trace"]);
  assert.deepEqual(Object.keys(J(b2["claude-code"].pluginDir, ".mcp.json").mcpServers), ["opencode-bridge"]);
  const plan = planInstall("claude-code", ctx, b2, { configRoot: sb });
  applyInstall(plan, { apply: true });
  assert.match(plan.manual[0], /^claude plugin marketplace add /);
  assert.match(plan.warnings[0], /duplicate avoided: unified-trace/);
  assert.equal(fs.readFileSync(path.join(sb, ".claude.json"), "utf8"), before);
  const b3 = buildPlugins(ctx, { clients: ["claude-code"], outDir: fs.mkdtempSync(path.join(os.tmpdir(), "eap-dist4-")), configRoot: sb, preferPlugin: true });
  assert.deepEqual(b3["claude-code"].skippedMcp, []);
});

test("standards/knowledge references are rewritten to the bundled copy (no ~/.claude/standards, no repo-relative shared/)", () => {
  const read = (f) => fs.readFileSync(f, "utf8");
  const walkMd = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walkMd(path.join(d, e.name)) : /\.md$/.test(e.name) ? [path.join(d, e.name)] : []);
  for (const c of ["claude-code", "cursor", "opencode"]) {
    for (const f of walkMd(path.join(built[c].pluginDir, "commands"))) {
      const t = read(f);
      assert.ok(!/~\/\.claude\/(standards|commands|skills)\//.test(t), `${c}:${path.basename(f)} still has ~/.claude/ ref`);
      assert.ok(!/(^|[^-/a-z])shared\/(standards|rules|prompts|commands|knowledge|templates)\//.test(t), `${c}:${path.basename(f)} still has shared/ ref`);
    }
  }
  assert.match(read(path.join(built["claude-code"].pluginDir, "commands/planning.md")), /\$\{CLAUDE_PLUGIN_ROOT\}\/ai-platform\//);
  assert.ok(fs.existsSync(path.join(built["claude-code"].pluginDir, "ai-platform/standards/coding-standards.md")));
  // every bundled path a command references actually exists in the package
  const root = built["claude-code"].pluginDir;
  const missing = [];
  for (const f of walkMd(path.join(root, "commands"))) {
    for (const m of read(f).matchAll(/\$\{CLAUDE_PLUGIN_ROOT\}\/(ai-platform\/[\w./-]+\.(?:md|yml))/g)) {
      if (!fs.existsSync(path.join(root, m[1]))) missing.push(`${path.basename(f)} -> ${m[1]}`);
    }
  }
  assert.deepEqual([...new Set(missing)].slice(0, 10), []);
});

test("every command has frontmatter; opencode package carries both agents", () => {
  for (const c of ["claude-code", "cursor", "opencode"]) {
    for (const f of fs.readdirSync(path.join(built[c].pluginDir, "commands"))) {
      assert.match(fs.readFileSync(path.join(built[c].pluginDir, "commands", f), "utf8"), /^---\r?\n/, `${c}/${f}`);
    }
  }
  assert.deepEqual(fs.readdirSync(path.join(built.opencode.pluginDir, "agents")).sort(), ["bug-investigator.md", "code-implementer.md"]);
});

test("cursor install: documented local path, honest untested warning; client selection", () => {
  const sb = fs.mkdtempSync(path.join(os.tmpdir(), "eap-sb-"));
  const plan = planInstall("cursor", ctx, built, { configRoot: sb });
  assert.ok(plan.target.endsWith(path.join(".cursor", "plugins", "local", "enterprise-ai-platform")));
  assert.ok(plan.warnings.some((w) => /untested on a real Cursor/i.test(w)));
  assert.deepEqual(selectClients("all"), ["claude-code", "cursor", "opencode"]);
  assert.deepEqual(selectClients("cursor,opencode"), ["cursor", "opencode"]);
  assert.throws(() => selectClients("vim"), /unknown client/);
});

test("build is deterministic across rebuilds (idempotent)", () => {
  const again = buildPlugins(ctx, { outDir: fs.mkdtempSync(path.join(os.tmpdir(), "eap-dist2-")) });
  assert.equal(fs.readFileSync(path.join(again.cursor.pluginDir, "mcp.json"), "utf8"), fs.readFileSync(path.join(built.cursor.pluginDir, "mcp.json"), "utf8"));
});
