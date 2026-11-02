// Single OS-aware path/runtime resolver. Every MCP, installer and plugin
// adapter resolves paths through here — nothing else may hardcode a venv
// layout, binary location, config directory or personal path.
//
// All functions take a context (createContext) so Windows/macOS/Linux
// behaviour can be exercised with mocks: { platform, env, home, repoRoot,
// exists, readFile }. Mocked-platform tests prove logic only, NOT behaviour
// on a real Windows machine.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const SETTING_KEYS = [
  "PROJECTS_DIR",
  "CONTEXT_PATH",
  "KNOWLEDGE_GRAPH_PATH",
  "CODE_CORTEX_PATH",
  "PYTHON_PATH",
  "NODE_PATH",
  "KG_SOURCE", // auto (default) | legacy | in-repo — which Knowledge Graph unified-trace uses
];

// NODE_PATH is also Node's own module-search variable. To avoid silently
// changing module resolution (or misreading it as an executable) it is read
// ONLY from paths.env / paths.local.env, or from EAP_NODE_PATH in the
// environment — never from process.env.NODE_PATH.
const ENV_ALIASES = { NODE_PATH: "EAP_NODE_PATH" };

function defaultRepoRoot() {
  // shared/core/path-resolver/index.js -> repo root is 3 levels up
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
}

export function createContext(over = {}) {
  const platform = over.platform ?? process.platform;
  const env = over.env ?? process.env;
  const p = platform === "win32" ? path.win32 : path.posix;
  const home =
    over.home ??
    (platform === "win32" ? env.USERPROFILE || os.homedir() : env.HOME || os.homedir());
  return {
    platform,
    env,
    p,
    home,
    repoRoot: over.repoRoot ?? defaultRepoRoot(),
    exists: over.exists ?? ((f) => fs.existsSync(f)),
    readFile: over.readFile ?? ((f) => fs.readFileSync(f, "utf8")),
    nodeExe: over.nodeExe ?? process.execPath,
  };
}

// ---------------------------------------------------------------- settings
export function parseEnvFile(text) {
  const out = {};
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i < 1) continue;
    const key = line.slice(0, i).trim();
    let val = line.slice(i + 1).trim();
    if (/^(['"]).*\1$/.test(val)) val = val.slice(1, -1);
    if (val !== "") out[key] = val; // blank = unset
  }
  return out;
}

export function expandPath(value, ctx) {
  if (!value) return value;
  let v = value.replace(/%([A-Za-z_][A-Za-z0-9_]*)%/g, (m, k) => ctx.env[k] ?? m);
  v = v.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}|\$([A-Za-z_][A-Za-z0-9_]*)/g, (m, a, b) => ctx.env[a || b] ?? m);
  if (v === "~") return ctx.home;
  if (v.startsWith("~/") || v.startsWith("~\\")) return ctx.p.join(ctx.home, v.slice(2));
  return v;
}

function tryRead(ctx, file) {
  try {
    return ctx.exists(file) ? ctx.readFile(file) : "";
  } catch {
    return "";
  }
}

// Precedence: environment > paths.local.env > paths.env.
export function loadSettings(ctx) {
  const merged = {
    ...parseEnvFile(tryRead(ctx, ctx.p.join(ctx.repoRoot, "paths.env"))),
    ...parseEnvFile(tryRead(ctx, ctx.p.join(ctx.repoRoot, "paths.local.env"))),
  };
  for (const k of SETTING_KEYS) {
    const envKey = ENV_ALIASES[k] ?? k;
    if (ctx.env[envKey]) merged[k] = ctx.env[envKey];
  }
  const out = {};
  for (const k of SETTING_KEYS) if (merged[k]) out[k] = expandPath(merged[k], ctx);
  return out;
}

// ------------------------------------------------------------- executables
export function which(cmd, ctx) {
  const delim = ctx.platform === "win32" ? ";" : ":";
  const dirs = (ctx.env.PATH || ctx.env.Path || "").split(delim).filter(Boolean);
  const exts =
    ctx.platform === "win32"
      ? ["", ...(ctx.env.PATHEXT || ".COM;.EXE;.BAT;.CMD").split(";").filter(Boolean)]
      : [""];
  const tried = [];
  for (const d of dirs) {
    for (const e of exts) {
      const f = ctx.p.join(d, cmd + e);
      tried.push(f);
      if (ctx.exists(f)) return { path: f, tried };
    }
  }
  return { path: null, tried };
}

const result = (found, source, tried, hint) => ({
  path: found ?? null,
  exists: Boolean(found),
  source: found ? source : null,
  tried,
  hint: found ? null : hint,
});

function firstExisting(cands, ctx) {
  const tried = [];
  for (const [file, source] of cands) {
    if (!file) continue;
    tried.push(file);
    if (ctx.exists(file)) return { file, source, tried };
  }
  return { file: null, source: null, tried };
}

// ------------------------------------------------------------------- paths
// The in-repo Knowledge Graph (or KNOWLEDGE_GRAPH_PATH). Installers target THIS,
// never the legacy fallback below.
// Where the Knowledge Graph Generator lives. It is its OWN repository (knowledge-graph-generator),
// not part of this one: KNOWLEDGE_GRAPH_PATH > an optional local copy under shared/mcp-tools/
// (gitignored) > the sibling clone next to this repo > the in-repo path where a clone would go.
// Installers target this directory.
export function inRepoKgDir(ctx, settings = loadSettings(ctx)) {
  if (settings.KNOWLEDGE_GRAPH_PATH) return settings.KNOWLEDGE_GRAPH_PATH;
  const local = ctx.p.join(ctx.repoRoot, "shared", "mcp-tools", "knowledge-graph-generator");
  const sibling = ctx.p.join(ctx.p.dirname(ctx.repoRoot), "knowledge-graph-generator");
  const has = (d) => ctx.exists(ctx.p.join(d, "mcp_server_main.py"));
  if (has(local)) return local;
  if (has(sibling)) return sibling;
  return local;
}

export function kgDir(ctx, settings = loadSettings(ctx)) {
  if (settings.KNOWLEDGE_GRAPH_PATH) return settings.KNOWLEDGE_GRAPH_PATH;
  const inRepo = inRepoKgDir(ctx, settings);
  // Migration bridge: until the in-repo copy has BOTH its own venv and a built index, keep using the
  // legacy sibling clone if THAT one is already runnable, so existing client
  // registrations don't break mid-migration. Remove once the in-repo venv and
  // index are built (`npm run platform:install`).
  const venv = (d) => ctx.p.join(d, ...venvPythonRel(ctx.platform));
  const db = (d) => ctx.p.join(d, "output", "knowledge_graph.db");
  const legacy = ctx.p.join(ctx.p.dirname(ctx.repoRoot), "knowledge-graph-generator");
  const mode = (settings.KG_SOURCE || "auto").toLowerCase();
  if (mode === "in-repo") return inRepo;
  if (mode === "legacy" && ctx.exists(venv(legacy))) return legacy;
  const inRepoReady = ctx.exists(venv(inRepo)) && ctx.exists(db(inRepo));
  if (!inRepoReady && ctx.exists(venv(legacy))) return legacy;
  return inRepo;
}

export function venvPythonRel(platform) {
  return platform === "win32" ? [".venv-mcp", "Scripts", "python.exe"] : [".venv-mcp", "bin", "python"];
}

// The runtime interpreter for the Knowledge Graph MCP: always the venv one
// (recreated locally per OS — venvs are never portable). PYTHON_PATH is the
// BASE interpreter used to create that venv (see resolveBasePython).
export function resolveVenvPython(ctx, settings = loadSettings(ctx)) {
  const f = ctx.p.join(kgDir(ctx, settings), ...venvPythonRel(ctx.platform));
  return result(ctx.exists(f) ? f : null, "venv", [f], "Run `npm run platform:install` to create .venv-mcp on this machine.");
}

export function resolveBasePython(ctx, settings = loadSettings(ctx)) {
  if (settings.PYTHON_PATH) {
    const ok = ctx.exists(settings.PYTHON_PATH);
    return result(ok ? settings.PYTHON_PATH : null, "PYTHON_PATH", [settings.PYTHON_PATH], "PYTHON_PATH is set but does not exist.");
  }
  const names = ctx.platform === "win32" ? ["python", "python3"] : ["python3", "python"];
  const tried = [];
  for (const n of names) {
    const w = which(n, ctx);
    tried.push(...w.tried);
    // Windows "Store" stubs live under WindowsApps and are not real interpreters.
    if (w.path && !/[\\/]WindowsApps[\\/]/i.test(w.path)) return result(w.path, "PATH", tried);
  }
  return result(null, null, tried, "Install Python >= 3.10 and/or set PYTHON_PATH in paths.local.env.");
}

export function resolveNode(ctx, settings = loadSettings(ctx)) {
  const f = settings.NODE_PATH || ctx.nodeExe;
  return result(f && ctx.exists(f) ? f : null, settings.NODE_PATH ? "NODE_PATH" : "process.execPath", [f], "Install Node >= 20 or set NODE_PATH in paths.local.env.");
}

export function codeCortexBinName(platform) {
  return platform === "win32" ? "code-cortex-mcp.exe" : "code-cortex-mcp";
}

export function resolveCodeCortex(ctx, settings = loadSettings(ctx)) {
  const bin = codeCortexBinName(ctx.platform);
  const cands = [
    [ctx.env.UT_CODE_CORTEX_BIN, "UT_CODE_CORTEX_BIN"],
    [settings.CODE_CORTEX_PATH, "CODE_CORTEX_PATH"],
    ctx.platform === "win32"
      ? [ctx.env.LOCALAPPDATA && ctx.p.join(ctx.env.LOCALAPPDATA, "Programs", "code-cortex-mcp", bin), "installer-default"]
      : [ctx.p.join(ctx.home, ".local", "bin", bin), "installer-default"],
    [ctx.p.join(kgDir(ctx, settings), "code-cortex", "build", "c", bin), "local-build"],
  ];
  const hit = firstExisting(cands, ctx);
  if (hit.file) return result(hit.file, hit.source, hit.tried);
  const w = which(bin, ctx);
  if (w.path) return result(w.path, "PATH", [...hit.tried, ...w.tried]);
  return result(
    null,
    null,
    [...hit.tried, ...w.tried],
    ctx.platform === "win32"
      ? "Install: powershell -File shared/mcp-tools/knowledge-graph-generator/code-cortex/install.ps1, or set CODE_CORTEX_PATH."
      : "Install: bash shared/mcp-tools/knowledge-graph-generator/code-cortex/install.sh, or set CODE_CORTEX_PATH."
  );
}

export function resolveProjectsDir(ctx, settings = loadSettings(ctx)) {
  const f = settings.PROJECTS_DIR;
  return result(f && ctx.exists(f) ? f : null, "PROJECTS_DIR", [f], "Set PROJECTS_DIR in paths.local.env (folder containing BE/ and UI/).");
}

export function resolveKgDb(ctx, settings = loadSettings(ctx)) {
  const f = ctx.env.UT_KG_DB_PATH || ctx.p.join(kgDir(ctx, settings), "output", "knowledge_graph.db");
  return result(ctx.exists(f) ? f : null, "kg-output", [f], "Index not built yet: run sync-projects (sync-projects.sh / sync-projects.ps1).");
}

// Client config locations (user scope). `configRoot` relocates ALL of them
// under one directory — used for sandboxed tests and dry-runs.
export function clientPaths(ctx, configRoot = null) {
  const j = ctx.p.join;
  const home = configRoot ?? ctx.home;
  const appData =
    ctx.platform === "win32"
      ? ctx.env.APPDATA || j(home, "AppData", "Roaming")
      : ctx.platform === "darwin"
        ? j(home, "Library", "Application Support")
        : ctx.env.XDG_CONFIG_HOME || j(home, ".config");
  const xdg = configRoot ? j(home, ".config") : ctx.env.XDG_CONFIG_HOME || j(home, ".config");
  return {
    claude: {
      dir: j(home, ".claude"),
      userConfig: j(home, ".claude.json"),
      desktopConfig: j(appData, "Claude", "claude_desktop_config.json"),
    },
    cursor: { dir: j(home, ".cursor"), mcpJson: j(home, ".cursor", "mcp.json") },
    opencode: {
      dir: j(xdg, "opencode"),
      configJson: j(xdg, "opencode", "opencode.json"),
      configJsonc: j(xdg, "opencode", "opencode.jsonc"),
    },
  };
}

export function describePlatform(ctx) {
  return { platform: ctx.platform, home: ctx.home, repoRoot: ctx.repoRoot, node: process.version, separator: ctx.p.sep };
}
