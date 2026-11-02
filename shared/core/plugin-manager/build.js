// Builds per-client plugin packages from the SHARED sources into dist/plugins/.
// dist/ is a per-machine, gitignored artifact: MCP entries embed absolute
// paths of THIS checkout (resolved via path-resolver), so never copy dist/
// between machines — rebuild with `npm run plugin:build`.
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { loadSettings, clientPaths } from "../path-resolver/index.js";
import { loadRegistry, serversForClient, clientLaunch } from "../mcp-registry/index.js";

export const CLIENTS = ["claude-code", "cursor", "opencode"];
const NON_COMMANDS = new Set(["README.md", "registry.yml", "migration-intelligence.md", "planning-engine.md"]);

const read = (f) => fs.readFileSync(f, "utf8");
const write = (f, c) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, c); };
const copyDir = (a, b) => fs.cpSync(a, b, { recursive: true, filter: (s) => !/(^|[\\/])(\.DS_Store|node_modules)$/.test(s) });
const writeJson = (f, o) => write(f, JSON.stringify(o, null, 2) + "\n");

export function platformVersion(ctx) {
  return read(path.join(ctx.repoRoot, "VERSION")).trim();
}

// Commands without YAML frontmatter get a minimal one (Claude validates it;
// Cursor/OpenCode use it for the command description).
function withFrontmatter(md, file) {
  if (/^---\r?\n/.test(md)) return md;
  const h1 = /^#\s+(.+)$/m.exec(md);
  const desc = (h1 ? h1[1] : file.replace(/\.md$/, "")).replace(/["\n]/g, " ").trim();
  return `---\ndescription: ${desc}\n---\n\n${md}`;
}

function copyShared(ctx, out, { commands = true, skills = true } = {}) {
  const sh = path.join(ctx.repoRoot, "shared");
  if (commands) {
    for (const f of fs.readdirSync(path.join(sh, "commands"))) {
      if (f.endsWith(".md") && !NON_COMMANDS.has(f)) write(path.join(out, "commands", f), withFrontmatter(read(path.join(sh, "commands", f)), f));
    }
  }
  if (skills) copyDir(path.join(sh, "skills"), path.join(out, "skills"));
}

// The shared "ai-platform" bundle commands/rules refer to (contract, engines,
// standards, rules, prompts) — shipped inside every package.
function copyBundle(ctx, out) {
  const sh = path.join(ctx.repoRoot, "shared");
  const b = path.join(out, "ai-platform");
  for (const d of ["standards", "rules", "prompts", "knowledge", "templates", "schemas"]) {
    if (fs.existsSync(path.join(sh, d))) copyDir(path.join(sh, d), path.join(b, d));
  }
  copyDir(path.join(sh, "commands"), path.join(b, "commands")); // engines + every command, for cross-references
  for (const f of ["contract.md", "company-profile.md"]) if (fs.existsSync(path.join(sh, f))) fs.cpSync(path.join(sh, f), path.join(b, f));
}

// Repo-/user-relative references in command/skill/standards text -> the
// package's own bundle. `root` is where the package lives on the target:
// Claude: ${CLAUDE_PLUGIN_ROOT} (substituted inline by Claude Code in
// command/skill content — documented); Cursor/OpenCode: the absolute install
// dir (known per machine at build time). `~/.claude/CLAUDE.md` (global
// contract) and ~/.claude usage-logs/paths.env are runtime user files, left alone.
const REF_RULES = [
  [/~\/\.claude\/standards\//g, "ai-platform/standards/"],
  [/\.github\/ai-platform\/shared\//g, "ai-platform/"],
  [/\.github\/ai-platform\/(standards|rules|prompts|commands|knowledge|templates|schemas)(?=[\/\s`'")]|$)/g, "ai-platform/$1"],
  [/\.opencode\/ai-platform\/shared\/commands\//g, "ai-platform/commands/"],
  [/\.opencode\/ai-platform\/standards\//g, "ai-platform/standards/"],
  [/\.opencode\/ai-platform\/shared\/prompts\//g, "ai-platform/prompts/"],
  [/\.opencode\/ai-platform\/shared\/contract\.md/g, "ai-platform/contract.md"],
  [/~\/\.claude\/skills\//g, "skills/"],
  [/~\/\.claude\/commands\//g, "commands/"],
  [/shared\/(standards|rules|prompts|commands|knowledge|templates|schemas)(?=[\/\s`'")]|$)/g, "ai-platform/$1"],
  [/shared\/contract\.md/g, "ai-platform/contract.md"],
  [/shared\/company-profile\.md/g, "ai-platform/company-profile.md"],
  [/shared\/skills\//g, "skills/"],
];

export function rewriteRefs(text, root) {
  const r = root.endsWith("/") ? root : root + "/";
  let t = text;
  for (const [re, to] of REF_RULES) t = t.replace(re, (...m) => r + to.replace("$1", m[1]));
  return t;
}

function rewriteTree(dir, root) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const f = path.join(dir, e.name);
    if (e.isDirectory()) rewriteTree(f, root);
    else if (/\.(md|mdc)$/.test(e.name)) {
      const t = read(f), n = rewriteRefs(t, root);
      if (n !== t) fs.writeFileSync(f, n);
    }
  }
}

function kernelOf(ctx) {
  const t = read(path.join(ctx.repoRoot, "shared", "contract.md"));
  const m = /<!-- enterprise-ai-platform:kernel:start -->([\s\S]*?)<!-- enterprise-ai-platform:kernel:end -->/.exec(t);
  return (m ? m[1] : t).trim();
}

const authorOf = { name: "Lifetrenz Engineering" };
const DESC = "Enterprise AI Platform: shared commands, skills, standards and code-intelligence MCPs (unified-trace, knowledge graph, code cortex).";

function buildClaude(ctx, root, ver, reg, settings, refRoot, info) {
  const plugin = path.join(root, "plugins", "enterprise-ai-platform");
  writeJson(path.join(root, ".claude-plugin", "marketplace.json"), {
    name: "eap-local",
    owner: authorOf,
    metadata: { description: "Local build of the Enterprise AI Platform plugin", version: ver },
    plugins: [{ name: "enterprise-ai-platform", source: "./plugins/enterprise-ai-platform", description: DESC, version: ver }],
  });
  writeJson(path.join(plugin, ".claude-plugin", "plugin.json"), {
    name: "enterprise-ai-platform", version: ver, description: DESC, author: authorOf, license: "UNLICENSED",
    keywords: ["enterprise", "mcp", "knowledge-graph"],
  });
  copyShared(ctx, plugin);
  copyBundle(ctx, plugin);
  rewriteTree(plugin, "${CLAUDE_PLUGIN_ROOT}");
  const mcp = {};
  for (const id of serversForClient(reg, "claude-code", ctx.platform)) {
    // Claude does NOT dedupe: a plugin server and a same-named user-scope server
    // both start (verified). Skip ids the user already registered unless asked.
    if (info.userScope.includes(id)) { info.skipped.push(id); continue; }
    const l = clientLaunch(id, ctx, settings);
    mcp[id] = { command: l.command, args: l.args };
  }
  writeJson(path.join(plugin, ".mcp.json"), { mcpServers: mcp });
  // Hooks are OPT-IN (--with-hooks): audit.js writes <cwd>/.claude/audit/log.jsonl in EVERY project
  // once a plugin is enabled globally, and usage-logger logs every prompt to ~/.claude/usage-logs.
  if (info.withHooks) {
      const hooksSrc = path.join(ctx.repoRoot, "adapters", "claude", "hooks");
    for (const f of ["audit.js", "usage-logger.js"]) fs.cpSync(path.join(hooksSrc, f), path.join(plugin, "hooks", "scripts", f));
    const cmd = (f, extra = "") => `node "\${CLAUDE_PLUGIN_ROOT}/hooks/scripts/${f}"${extra}`;
    writeJson(path.join(plugin, "hooks", "hooks.json"), {
      hooks: {
        PostToolUse: [{ matcher: "", hooks: [{ type: "command", command: cmd("audit.js", " --event PostToolUse"), timeout: 5 }] }],
        Stop: [{ matcher: "", hooks: [{ type: "command", command: cmd("audit.js", " --event Stop"), timeout: 10 }] }],
        UserPromptSubmit: [{ hooks: [{ type: "command", command: cmd("usage-logger.js"), timeout: 5 }] }],
      },
    });
  }
  return plugin;
}

function buildCursor(ctx, root, ver, reg, settings, refRoot) {
  const plugin = path.join(root, "enterprise-ai-platform");
  writeJson(path.join(plugin, ".cursor-plugin", "plugin.json"), {
    name: "enterprise-ai-platform", version: ver, description: DESC, author: authorOf, license: "UNLICENSED",
    keywords: ["enterprise", "mcp", "knowledge-graph"],
  });
  writeJson(path.join(root, ".cursor-plugin", "marketplace.json"), {
    name: "eap-local", owner: authorOf,
    metadata: { description: "Local build of the Enterprise AI Platform plugin" },
    plugins: [{ name: "enterprise-ai-platform", source: "enterprise-ai-platform", description: DESC, version: ver }],
  });
  copyShared(ctx, plugin);
  copyBundle(ctx, plugin);
  // Rules (.mdc): contract kernel always-on; shared rules agent-requestable.
  write(path.join(plugin, "rules", "eap-contract.mdc"),
    `---\ndescription: Enterprise AI Platform execution contract (kernel)\nalwaysApply: true\n---\n\n${kernelOf(ctx)}\n`);
  const rulesDir = path.join(ctx.repoRoot, "shared", "rules");
  rewriteTree(plugin, refRoot);
  for (const f of fs.readdirSync(rulesDir).filter((x) => x.endsWith(".md"))) {
    const title = f.replace(/\.md$/, "");
    write(path.join(plugin, "rules", `eap-${title}.mdc`),
      `---\ndescription: Enterprise AI Platform rule: ${title}\nalwaysApply: false\n---\n\n${read(path.join(rulesDir, f))}`);
  }
  const mcp = {};
  for (const id of serversForClient(reg, "cursor", ctx.platform)) {
    const l = clientLaunch(id, ctx, settings);
    mcp[id] = { command: l.command, args: l.args };
  }
  writeJson(path.join(plugin, "mcp.json"), { mcpServers: mcp });
  // No hooks: Claude hook scripts speak Claude's stdin schema; a Cursor-schema
  // port is future work (see docs/PLUGIN_INTEGRATIONS.md).
  return plugin;
}

function buildOpenCode(ctx, root, ver, reg, settings, refRoot) {
  const plugin = path.join(root, "enterprise-ai-platform"); // mirrors ~/.config/opencode layout
  copyShared(ctx, plugin);
  copyBundle(ctx, plugin);
  const agentsSrc = path.join(ctx.repoRoot, "integrations", "opencode", "agents");
  if (fs.existsSync(agentsSrc)) copyDir(agentsSrc, path.join(plugin, "agents"));
  rewriteTree(plugin, refRoot);
  const mcp = {};
  for (const id of serversForClient(reg, "opencode", ctx.platform)) {
    const l = clientLaunch(id, ctx, settings);
    mcp[id] = { type: "local", command: [l.command, ...l.args], enabled: true };
  }
  const secUrl = pathToFileURL(path.join(ctx.repoRoot, "shared", "core", "security", "index.js")).href;
  write(path.join(plugin, "plugins", "eap.js"), openCodePluginSource(ver, mcp, secUrl));
  writeJson(path.join(plugin, "eap-plugin.json"), { name: "enterprise-ai-platform", version: ver, mcp });
  return plugin;
}

// Plugin entry point for OpenCode (loaded from <config>/plugins/). Uses the
// documented `config` hook to add MCP servers WITHOUT editing the user's
// opencode.json (never overrides an entry the user already defined), and
// `tool.execute.before` for the shared sensitive-file deny-list.
function openCodePluginSource(ver, mcp, secUrl) {
  return `// Generated by enterprise-ai-platform plugin:build v${ver} — do not edit.
import { deniedReason } from ${JSON.stringify(secUrl)};

const MCP = ${JSON.stringify(mcp, null, 2)};

export const EnterpriseAIPlatform = async () => ({
  config: async (cfg) => {
    cfg.mcp = cfg.mcp ?? {};
    for (const [id, entry] of Object.entries(MCP)) if (!(id in cfg.mcp)) cfg.mcp[id] = entry;
  },
  "tool.execute.before": async (input, output) => {
    const p = output?.args?.filePath ?? output?.args?.path;
    if (!["read", "edit", "write"].includes(input?.tool) || typeof p !== "string") return;
    const why = deniedReason(p.split(/[\\\\/]+/).filter(Boolean));
    if (why) throw new Error(\`EAP security: blocked \${input.tool} of \${why}\`);
  },
});
`;
}

const BUILDERS = { "claude-code": buildClaude, cursor: buildCursor, opencode: buildOpenCode };

// Read-only: ids already registered at Claude user scope.
export function userScopeServers(ctx, configRoot = null) {
  try {
    const f = clientPaths(ctx, configRoot).claude.userConfig;
    return Object.keys(JSON.parse(fs.readFileSync(f, "utf8")).mcpServers ?? {});
  } catch { return []; }
}

export function buildPlugins(ctx, { clients = CLIENTS, outDir, configRoot = null, preferPlugin = false, withHooks = false } = {}) {
  const ver = platformVersion(ctx);
  const reg = loadRegistry(ctx);
  const settings = loadSettings(ctx);
  const dist = outDir ?? path.join(ctx.repoRoot, "dist", "plugins");
  const built = {};
  for (const c of clients) {
    if (!BUILDERS[c]) throw new Error(`unknown client: ${c}`);
    const root = path.join(dist, c);
    fs.rmSync(root, { recursive: true, force: true });
    const cp = clientPaths(ctx, configRoot);
    const refRoot = c === "opencode" ? cp.opencode.dir : ctx.p.join(cp.cursor.dir, "plugins", "local", "enterprise-ai-platform");
    const info = { withHooks, skipped: [], userScope: c === "claude-code" && !preferPlugin ? userScopeServers(ctx, configRoot) : [] };
    const pluginDir = BUILDERS[c](ctx, root, ver, reg, settings, refRoot, info);
    built[c] = { root, pluginDir, version: ver, skippedMcp: info.skipped };
  }
  return built;
}

