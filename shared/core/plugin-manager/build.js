// Builds per-client plugin packages from the SHARED sources into dist/plugins/.
// dist/ is a per-machine, gitignored artifact: MCP entries embed absolute
// paths of THIS checkout (resolved via path-resolver), so never copy dist/
// between machines — rebuild with `npm run plugin:build`.
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { loadSettings, clientPaths, inRepoKgDir } from "../path-resolver/index.js";
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
  return `---\ndescription: ${desc}\ndisable-model-invocation: true\n---\n\n${md}`; // slash commands are user-typed: no always-on description cost
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

// Vendored MCP servers + the Knowledge Graph Generator, so the package carries
// the code its MCP entries run. Machine-local state is never shipped: venvs,
// built indexes (output*/, *.db), caches, generated code-cortex/build, env
// files (kg-config.env / mcp-config.env hold credentials), and the ~1 GB of
// vendored tree-sitter grammar sources + benchmark evidence logs (too large
// for a plugin payload; the rest of code-cortex source is kept). Matched on the
// path RELATIVE to mcp-tools/ so an ancestor dir named e.g. "output" cannot exclude all.
const MCP_TOOLS_SKIP = /(^|[\\/])(\.venv[^\\/]*|\.cache|\.git|\.pytest_cache|__pycache__|node_modules|output[^\\/]*|\.DS_Store)([\\/]|$)|(^|[\\/])code-cortex[\\/](build|internal[\\/]cbm[\\/]vendored[\\/]grammars|docs[\\/]benchmarks)([\\/]|$)|\.db$|\.env$/;
function copyMcpTools(ctx, out, { only = null, exclude = [] } = {}) {
  const src = path.join(ctx.repoRoot, "shared", "mcp-tools");
  if (!fs.existsSync(src)) return;
  const top = (rel) => rel.split(/[\\/]/)[0];
  fs.cpSync(src, path.join(out, "mcp-tools"), {
    recursive: true,
    filter: (s) => {
      const rel = path.relative(src, s);
      if (!rel) return true;
      if (MCP_TOOLS_SKIP.test(rel)) return false;
      if (only && !only.includes(top(rel)) && !/^MIGRATION\.md$/.test(rel)) return false;
      if (exclude.includes(top(rel))) return false;
      return true;
    },
  });
}

// The generator is its OWN repo (knowledge-graph-generator): ship it from wherever the
// path-resolver finds it (KNOWLEDGE_GRAPH_PATH > local copy > sibling clone), so a fresh
// machine with only the sibling clone still gets a complete knowledge-graph plugin.
function copyKnowledgeGraphGenerator(ctx, out, settings) {
  const src = inRepoKgDir(ctx, settings);
  if (!fs.existsSync(path.join(src, "mcp_server_main.py"))) return false;
  fs.cpSync(src, path.join(out, "mcp-tools", "knowledge-graph-generator"), {
    recursive: true,
    filter: (s) => !MCP_TOOLS_SKIP.test(path.join("knowledge-graph-generator", path.relative(src, s))),
  });
  return true;
}

// Context Manager tools shipped under <plugin>/bin (eap-run, mcp-env, ctx-report, ctx-meter).
function copyContextTools(ctx, out) {
  const src = path.join(ctx.repoRoot, "shared", "core", "context");
  if (!fs.existsSync(src)) return;
  for (const f of fs.readdirSync(src)) {
    const name = f.replace(/\.sh$/, "");
    fs.cpSync(path.join(src, f), path.join(out, "bin", name));
    try { fs.chmodSync(path.join(out, "bin", name), 0o755); } catch { /* windows */ }
  }
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

export function kernelOf(ctx, root = "${CLAUDE_PLUGIN_ROOT}") {
  const t = read(path.join(ctx.repoRoot, "shared", "contract.md"));
  const m = /<!-- enterprise-ai-platform:kernel:start -->([\s\S]*?)<!-- enterprise-ai-platform:kernel:end -->/.exec(t);
  return (m ? m[1] : t).trim().replace(/\{\{EAP_ROOT\}\}/g, root);
}

// Claude Code reads ~/.claude/CLAUDE.md on EVERY turn: it must hold the kernel
// only (prompt-cache prefix), never the full contract. Content outside the
// markers is the user's own and is preserved.
export function globalKernelText(ctx, pluginRoot, existing = "") {
  const block = `<!-- enterprise-ai-platform:kernel:start -->\n${kernelOf(ctx, pluginRoot)}\n<!-- enterprise-ai-platform:kernel:end -->`;
  const KERNEL_RE = /<!-- enterprise-ai-platform:kernel:start -->[\s\S]*?<!-- enterprise-ai-platform:kernel:end -->/;
  const HOLD = "\u0000EAP_KERNEL\u0000";
  // 1. park the current kernel block (keeps its position), 2. drop legacy (pre-4.14) text:
  //    contract:start/end block, the "SHARED CONTRACT v3" header comment, and a FULL v3 contract
  //    that followed the kernel; 3. put the fresh kernel back (or append it).
  let base = existing.replace(KERNEL_RE, HOLD);
  base = base.replace(/<!-- enterprise-ai-platform:contract:start -->[\s\S]*?<!-- enterprise-ai-platform:contract:end -->\s*/g, "");
  base = base.replace(/<!-- SHARED CONTRACT v3[\s\S]*?-->\s*/g, "");
  base = base.replace(/\n# Enterprise AI Platform — Shared Execution Contract \(v3\)[\s\S]*$/, "\n");
  const out = base.includes(HOLD) ? base.replace(HOLD, () => block) : (base.trim() ? base.trimEnd() + "\n\n" + block + "\n" : block + "\n");
  return out.replace(/^\s+/, "");
}

const authorOf = { name: "Lifetrenz Engineering" };
const DESC = "Enterprise AI Platform: shared commands, skills, standards and code-intelligence MCPs (unified-trace, knowledge graph, code cortex).";

const KG_DESC = "Knowledge Graph plugin: cross-stack UI<->API<->service<->DB graph MCP (token-budgeted get_context_pack, search_knowledge, resolve_ui_api) + indexing skill. Used internally by enterprise-ai-platform's unified-trace.";

function buildClaude(ctx, root, ver, reg, settings, refRoot, info) {
  const plugin = path.join(root, "plugins", "enterprise-ai-platform");
  writeJson(path.join(root, ".claude-plugin", "marketplace.json"), {
    name: "eap-local",
    owner: authorOf,
    metadata: { description: "Local build of the Enterprise AI Platform plugins", version: ver },
    plugins: [
      { name: "enterprise-ai-platform", source: "./plugins/enterprise-ai-platform", description: DESC, version: ver },
      { name: "knowledge-graph", source: "./plugins/knowledge-graph", description: KG_DESC, version: ver },
    ],
  });
  buildClaudeKnowledgeGraph(ctx, root, ver, reg, settings);
  writeJson(path.join(plugin, ".claude-plugin", "plugin.json"), {
    name: "enterprise-ai-platform", version: ver, description: DESC, author: authorOf, license: "UNLICENSED",
    keywords: ["enterprise", "mcp", "knowledge-graph"],
  });
  copyShared(ctx, plugin);
  copyBundle(ctx, plugin);
  rewriteTree(plugin, "${CLAUDE_PLUGIN_ROOT}");
  copyMcpTools(ctx, plugin, { exclude: ["knowledge-graph-generator"] }); // after rewriteTree: vendored MCP docs ship verbatim; KG ships in its own plugin
  copyContextTools(ctx, plugin);
  const mcp = {};
  for (const id of serversForClient(reg, "claude-code", ctx.platform).filter((i) => (reg.servers[i].plugin ?? "enterprise-ai-platform") === "enterprise-ai-platform")) {
    // Claude does NOT dedupe: a plugin server and a same-named user-scope server
    // both start (verified). Skip ids the user already registered unless asked.
    if (info.userScope.includes(id)) { info.skipped.push(id); continue; }
    const l = clientLaunch(id, ctx, settings);
    mcp[id] = { command: l.command, args: l.args };
  }
  writeJson(path.join(plugin, ".mcp.json"), { mcpServers: mcp });
  // Context Manager hooks ship by default (lightweight, global log files only):
  //   usage-logger.js  UserPromptSubmit  → ~/.claude/usage-logs/<day>.jsonl (prompt log)
  //   ctx-meter.cjs     UserPromptSubmit  → one advisory line only when context > CTX_BUDGET
  //   ctx-meter.cjs     Stop              → tokens-<day>.jsonl record + <project>/.claude/checkpoints/current.md
  // audit.js (per-repo PostToolUse telemetry in EVERY project) stays OPT-IN via --with-hooks.
  const hooksSrc = path.join(ctx.repoRoot, "adapters", "claude", "hooks");
  fs.cpSync(path.join(hooksSrc, "usage-logger.js"), path.join(plugin, "hooks", "scripts", "usage-logger.js"));
  fs.cpSync(path.join(ctx.repoRoot, "shared", "core", "context", "ctx-meter.cjs"), path.join(plugin, "hooks", "scripts", "ctx-meter.cjs"));
  const cmd = (f, extra = "") => `node "\${CLAUDE_PLUGIN_ROOT}/hooks/scripts/${f}"${extra}`;
  const hooks = {
    UserPromptSubmit: [{ hooks: [
      { type: "command", command: cmd("usage-logger.js"), timeout: 5 },
      { type: "command", command: cmd("ctx-meter.cjs", " --event UserPromptSubmit"), timeout: 5 },
    ] }],
    Stop: [{ matcher: "", hooks: [{ type: "command", command: cmd("ctx-meter.cjs", " --event Stop"), timeout: 10 }] }],
  };
  if (info.withHooks) {
    fs.cpSync(path.join(hooksSrc, "audit.js"), path.join(plugin, "hooks", "scripts", "audit.js"));
    hooks.PostToolUse = [{ matcher: "", hooks: [{ type: "command", command: cmd("audit.js", " --event PostToolUse"), timeout: 5 }] }];
    hooks.Stop[0].hooks.push({ type: "command", command: cmd("audit.js", " --event Stop"), timeout: 10 });
  }
  writeJson(path.join(plugin, "hooks", "hooks.json"), { hooks });
  return plugin;
}

// The Knowledge Graph as its own Claude plugin: the generator + MCP server code,
// one skill (how/when to query and re-index), and the `knowledge-graph` MCP
// entry. unified-trace (enterprise-ai-platform plugin) keeps spawning the same
// server through path-resolver's kgDir(), so the two plugins share one index.
function buildClaudeKnowledgeGraph(ctx, root, ver, reg, settings) {
  const plugin = path.join(root, "plugins", "knowledge-graph");
  writeJson(path.join(plugin, ".claude-plugin", "plugin.json"), {
    name: "knowledge-graph", version: ver, description: KG_DESC, author: authorOf, license: "UNLICENSED",
    keywords: ["knowledge-graph", "mcp", "code-intelligence"],
  });
  const skillsSrc = path.join(ctx.repoRoot, "shared", "plugins", "knowledge-graph", "skills");
  if (fs.existsSync(skillsSrc)) copyDir(skillsSrc, path.join(plugin, "skills"));
  rewriteTree(plugin, "${CLAUDE_PLUGIN_ROOT}");
  copyKnowledgeGraphGenerator(ctx, plugin, settings);
  const mcp = {};
  for (const id of serversForClient(reg, "claude-code", ctx.platform).filter((i) => reg.servers[i].plugin === "knowledge-graph")) {
    const l = clientLaunch(id, ctx, settings);
    mcp[id] = { command: l.command, args: l.args };
  }
  writeJson(path.join(plugin, ".mcp.json"), { mcpServers: mcp });
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

