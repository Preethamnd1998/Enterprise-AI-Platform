// mcp:selftest — actually starts each exposed MCP through the launcher and
// lists its tools over stdio. Proves the shared implementation runs
// independently of any AI client (no client config involved).
import path from "node:path";
import { pathToFileURL } from "node:url";
import { loadRegistry } from "./mcp-registry/index.js";
import { spawnSync } from "node:child_process";
import { resolveSpawn } from "./security/index.js";
import { resolveCodeCortex } from "./path-resolver/index.js";

// The MCP SDK is a dependency of the servers (unified-trace), not of core/:
// load it from there so core/ stays dependency-free.
async function loadSdk(ctx) {
  const base = path.join(ctx.repoRoot, "shared", "mcp-tools", "unified-trace-mcp", "node_modules", "@modelcontextprotocol", "sdk", "dist", "esm", "client");
  const [c, t] = await Promise.all([import(pathToFileURL(path.join(base, "index.js")).href), import(pathToFileURL(path.join(base, "stdio.js")).href)]);
  return { Client: c.Client, StdioClientTransport: t.StdioClientTransport };
}

async function probe(id, spec, ctx, { Client, StdioClientTransport }) {
  const launcher = path.join(ctx.repoRoot, "shared", "core", "launcher.js");
  const sp = resolveSpawn(ctx.nodeExe, [launcher, id]);
  const transport = new StdioClientTransport({ command: sp.command, args: sp.args, cwd: ctx.repoRoot, stderr: "pipe", env: spec.healthcheck.env });
  const client = new Client({ name: "eap-selftest", version: "1.0.0" });
  const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error(`timeout after ${spec.healthcheck.timeoutMs}ms`)), spec.healthcheck.timeoutMs));
  try {
    await Promise.race([client.connect(transport), timeout]);
    const { tools } = await Promise.race([client.listTools(), timeout]);
    return tools.map((t) => t.name);
  } finally {
    await client.close().catch(() => {});
  }
}

export async function selftest(ctx) {
  const reg = loadRegistry(ctx);
  const out = [];
  let sdk;
  try { sdk = await loadSdk(ctx); } catch (e) {
    return [{ name: "mcp sdk", status: "fail", detail: `MCP SDK not installed (run npm run platform:install): ${e.message}` }];
  }
  for (const [id, s] of Object.entries(reg.servers)) {
    if (s.healthcheck.type === "binary-version") {
      const cc = resolveCodeCortex(ctx);
      const r = cc.exists ? spawnSync(cc.path, ["--version"], { encoding: "utf8", timeout: 10000 }) : null;
      out.push({ name: `binary: ${id}`, status: r?.status === 0 ? "ok" : "fail", detail: r?.status === 0 ? `${r.stdout.trim()} [${cc.source}]` : cc.hint ?? "--version failed" });
      continue;
    }
    if (s.healthcheck.type !== "mcp-list-tools" || !s.platforms.includes(ctx.platform)) continue;
    try {
      const names = await probe(id, s, ctx, sdk);
      const missing = s.healthcheck.expectTools.filter((t) => !names.includes(t));
      out.push({ name: `mcp start: ${id}`, status: missing.length ? "fail" : "ok", detail: missing.length ? `missing tools: ${missing.join(", ")}` : `${names.length} tools via launcher` });
    } catch (e) {
      out.push({ name: `mcp start: ${id}`, status: "fail", detail: e.message });
    }
  }
  return out;
}
