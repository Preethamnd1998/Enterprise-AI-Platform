// Central MCP registry: ONE definition per server. Client adapters only render
// launch specs from here; they never contain server logic or OS paths.
import { loadSettings, resolveNode, resolveVenvPython, resolveCodeCortex, inRepoKgDir } from "../path-resolver/index.js";

const CLIENTS = new Set(["claude-code", "cursor", "opencode"]);
const RUNTIMES = new Set(["node", "python", "binary"]);
const PLATFORMS = new Set(["darwin", "win32", "linux"]);

export function loadRegistry(ctx) {
  return JSON.parse(ctx.readFile(ctx.p.join(ctx.repoRoot, "shared", "core", "mcp-registry", "registry.json")));
}

// Returns a list of error strings (empty = valid).
export function validateRegistry(reg, ctx) {
  const errs = [];
  if (reg.version !== 1) errs.push("registry.version must be 1");
  for (const [id, s] of Object.entries(reg.servers ?? {})) {
    const at = (m) => errs.push(`${id}: ${m}`);
    if (!s.description) at("missing description");
    if (!RUNTIMES.has(s.runtime)) at(`bad runtime ${s.runtime}`);
    if (!s.entry) at("missing entry");
    else if (s.entryBase === "kg") { /* lives in the separate knowledge-graph-generator repo; checked by doctor */ }
    else if (!ctx.exists(ctx.p.join(ctx.repoRoot, ...s.entry.split("/")))) at(`entry not found: ${s.entry}`);
    if (!Array.isArray(s.platforms) || !s.platforms.every((x) => PLATFORMS.has(x))) at("bad platforms");
    if (!s.healthcheck?.type) at("missing healthcheck.type");
    if (!Array.isArray(s.permissions)) at("missing permissions[]");
    if (typeof s.expose !== "boolean") at("expose must be boolean");
    if (!Array.isArray(s.clients) || !s.clients.every((c) => CLIENTS.has(c))) at("bad clients");
    for (const dep of s.dependencies?.requires ?? []) if (!reg.servers[dep]) at(`requires unknown server ${dep}`);
  }
  return errs;
}

export function serversForClient(reg, client, platform) {
  return Object.entries(reg.servers)
    .filter(([, s]) => s.expose && s.clients.includes(client) && s.platforms.includes(platform))
    .map(([id]) => id);
}

// Concrete launch spec for the CURRENT machine: absolute paths, no shell.
export function launchSpec(id, reg, ctx, settings = loadSettings(ctx)) {
  const s = reg.servers[id];
  if (!s) throw new Error(`unknown MCP server: ${id}`);
  const base = s.entryBase === "kg" ? inRepoKgDir(ctx, settings) : ctx.repoRoot;
  const entry = ctx.p.join(base, ...s.entry.split("/"));
  if (s.runtime === "node") {
    const node = resolveNode(ctx, settings);
    if (!node.exists) throw new Error(`${id}: node not found. ${node.hint}`);
    return { command: node.path, args: [entry], env: {}, cwd: ctx.repoRoot };
  }
  if (s.runtime === "python") {
    const py = resolveVenvPython(ctx, settings);
    if (!py.exists) throw new Error(`${id}: venv python not found (tried ${py.tried.join(", ")}). ${py.hint}`);
    return { command: py.path, args: [entry], env: {}, cwd: ctx.repoRoot };
  }
  const bin = resolveCodeCortex(ctx, settings);
  if (!bin.exists) throw new Error(`${id}: binary not found. ${bin.hint}`);
  return { command: bin.path, args: [], env: {}, cwd: ctx.repoRoot };
}

// Client-facing entry: ALWAYS goes through the launcher so clients hold no
// python/binary paths — those are resolved at start-up, per OS.
export function clientLaunch(id, ctx, settings = loadSettings(ctx)) {
  const node = resolveNode(ctx, settings);
  return {
    command: node.path ?? ctx.nodeExe,
    args: [ctx.p.join(ctx.repoRoot, "shared", "core", "launcher.js"), id],
  };
}
