// platform:migrate — existing (pre-4.14) user → plugin-only layout, in a sandbox HOME.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createContext } from "../path-resolver/index.js";
import { planMigration, applyMigration, EAP_KEY, KG_KEY } from "../migrate/index.js";

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const ctx = createContext({ repoRoot });
const w = (f, c = "x") => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, c); };
const j = (f) => JSON.parse(fs.readFileSync(f, "utf8"));
const OLD_CLAUDE_MD = [
  "# My own notes", "keep this line", "",
  "<!-- SHARED CONTRACT v3\n     Claude Code (global): installed by install-claude.ps1 -->", "",
  "<!-- enterprise-ai-platform:contract:start -->", "OLD KERNEL TEXT", "<!-- enterprise-ai-platform:contract:end -->", "",
  "# Enterprise AI Platform — Shared Execution Contract (v3)", "full contract text ".repeat(50),
].join("\n");

function sandbox({ plugins = true, enabled = true } = {}) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "mig-"));
  const c = path.join(home, ".claude");
  // platform-installed copies (must go)
  w(path.join(c, "skills", "running-locally-skill", "SKILL.md"));
  w(path.join(c, "skills", "audit-skill", "SKILL.md"));
  w(path.join(c, "skills", "README.md"));
  w(path.join(c, "commands", "bug-fix.md"));
  w(path.join(c, "commands", "registry.yml"));
  w(path.join(c, "standards", "coding-standards.md"));
  w(path.join(c, "knowledge", "architecture", "x.md"));
  w(path.join(c, "company-profile.md"));
  w(path.join(c, "hooks", "usage-logger.js"));
  // user-owned / third-party (must stay)
  w(path.join(c, "skills", "trail", "SKILL.md"));
  w(path.join(c, "skills", "my-own-skill", "SKILL.md"));
  w(path.join(c, "commands", "my-command.md"));
  w(path.join(c, "standards", "my-team-standard.md"));
  w(path.join(c, "hooks", "other-tool-hooks.cjs"));
  w(path.join(c, "CLAUDE.md"), OLD_CLAUDE_MD);
  w(path.join(c, "settings.json"), JSON.stringify({
    enabledPlugins: { [EAP_KEY]: enabled, [KG_KEY]: true },
    hooks: {
      UserPromptSubmit: [{ hooks: [{ type: "command", command: "node ~/.claude/hooks/usage-logger.js" }, { type: "command", command: "node other-tool-hooks.cjs prompt" }] }],
      Stop: [{ hooks: [{ type: "command", command: 'node "${CLAUDE_PLUGIN_ROOT}/hooks/scripts/ctx-meter.cjs" --event Stop' }] }],
    },
  }));
  if (plugins) w(path.join(c, "plugins", "installed_plugins.json"), JSON.stringify({ version: 2, plugins: { [EAP_KEY]: [{}], [KG_KEY]: [{}] } }));
  w(path.join(home, ".claude.json"), JSON.stringify({ mcpServers: { "unified-trace": {}, "opencode-bridge": {}, "knowledge-graph": {}, "code-cortex-mcp": {}, "canary-signoz-reader": {} } }));
  const proj = path.join(home, "proj");
  w(path.join(proj, ".mcp.json"), JSON.stringify({ mcpServers: { "unified-trace": {}, "gitlab-reader": {}, "v2qa-grafana-reader": {} } }));
  return { home, c, proj };
}

test("dry-run changes nothing and lists the plan", () => {
  const { home, c, proj } = sandbox();
  const plan = planMigration(ctx, { home, projects: [proj], pluginRoot: "/p/eap" });
  const before = fs.readFileSync(path.join(c, "CLAUDE.md"), "utf8");
  const rep = applyMigration(plan, { apply: false });
  assert.ok(rep.length >= 10 && rep.every((r) => r.status === "dry-run"));
  assert.equal(fs.readFileSync(path.join(c, "CLAUDE.md"), "utf8"), before);
  assert.ok(fs.existsSync(path.join(c, "skills", "running-locally-skill")));
  assert.ok(!fs.existsSync(path.join(c, "backups")));
});

test("apply removes only platform-provided copies, keeps everything else, backs up, is idempotent", () => {
  const { home, c, proj } = sandbox();
  const calls = [];
  const runner = (cmd, args) => { calls.push([cmd, ...args].join(" ")); return { status: 0, out: "" }; };
  const plan = planMigration(ctx, { home, projects: [proj], pluginRoot: "/p/eap", runner });
  const rep = applyMigration(plan, { apply: true });
  assert.equal(rep.filter((r) => r.status === "fail").length, 0, JSON.stringify(rep.filter((r) => r.status === "fail")));
  for (const p of ["skills/running-locally-skill", "skills/audit-skill", "skills/README.md", "commands/bug-fix.md", "commands/registry.yml", "standards/coding-standards.md", "knowledge", "company-profile.md", "hooks/usage-logger.js"]) {
    assert.ok(!fs.existsSync(path.join(c, p)), `${p} should be removed`);
  }
  for (const p of ["skills/trail/SKILL.md", "skills/my-own-skill/SKILL.md", "commands/my-command.md", "standards/my-team-standard.md", "hooks/other-tool-hooks.cjs"]) {
    assert.ok(fs.existsSync(path.join(c, p)), `${p} must be kept`);
  }
  const md = fs.readFileSync(path.join(c, "CLAUDE.md"), "utf8");
  assert.match(md, /keep this line/);
  assert.match(md, /enterprise-ai-platform:kernel:start/);
  assert.match(md, /Plugin root `\/p\/eap`/);
  assert.doesNotMatch(md, /OLD KERNEL TEXT|SHARED CONTRACT v3|Shared Execution Contract \(v3\)|contract:start/);
  assert.ok(md.length < 6000, `CLAUDE.md still ${md.length} bytes`);
  const s = j(path.join(c, "settings.json"));
  assert.equal(s.hooks.UserPromptSubmit[0].hooks.length, 1);
  assert.match(s.hooks.UserPromptSubmit[0].hooks[0].command, /other-tool-hooks/);
  assert.ok(s.hooks.Stop);
  assert.deepEqual(calls.sort(), ["claude mcp remove knowledge-graph -s user", "claude mcp remove opencode-bridge -s user", "claude mcp remove unified-trace -s user"]);
  assert.ok(plan.notes.some((n) => /code-cortex-mcp/.test(n)));
  assert.deepEqual(Object.keys(j(path.join(proj, ".mcp.json")).mcpServers).sort(), ["gitlab-reader", "v2qa-grafana-reader"]);
  assert.ok(plan.backupDir && fs.existsSync(path.join(plan.backupDir, "MANIFEST.json")));
  assert.ok(fs.existsSync(path.join(plan.backupDir, ".claude", "skills", "running-locally-skill", "SKILL.md")));
  const again = planMigration(ctx, { home, projects: [proj], pluginRoot: "/p/eap", runner });
  assert.equal(again.items.filter((i) => i.op !== "mcp-remove").length, 0, JSON.stringify(again.items.map((i) => i.path)));
});

test("blocked while the plugins are not installed or the EAP plugin is disabled", () => {
  const a = sandbox({ plugins: false });
  const pa = planMigration(ctx, { home: a.home, pluginRoot: "/p/eap" });
  assert.equal(pa.items.length, 0);
  assert.equal(pa.blocked.length, 2);
  const b = sandbox({ enabled: false });
  const pb = planMigration(ctx, { home: b.home, pluginRoot: "/p/eap" });
  assert.ok(pb.blocked.some((x) => /enterprise-ai-platform/.test(x)));
  assert.ok(!pb.items.some((i) => i.kind === "command" || i.kind === "claude-md"), "nothing the disabled plugin provides may be removed");
});

test("new user (empty home): only the kernel file is created", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "mig-new-"));
  w(path.join(home, ".claude", "plugins", "installed_plugins.json"), JSON.stringify({ plugins: { [EAP_KEY]: [{}], [KG_KEY]: [{}] } }));
  const plan = planMigration(ctx, { home, pluginRoot: "/p/eap" });
  assert.deepEqual(plan.items.map((i) => i.kind), ["claude-md"]);
});
