#!/usr/bin/env node
// Client-independent MCP launcher:  node launcher.js <server-id>
// Resolves the server's runtime for THIS OS via the shared path-resolver and
// execs it with stdio inherited (MCP stdio transport passes straight through).
// All diagnostics go to stderr — stdout belongs to the MCP protocol.
import { spawn } from "node:child_process";
import { createContext, loadSettings } from "./path-resolver/index.js";
import { loadRegistry, launchSpec } from "./mcp-registry/index.js";
import { maskEnv, resolveSpawn } from "./security/index.js";

const id = process.argv[2];
if (!id) {
  console.error("usage: launcher.js <server-id>");
  process.exit(2);
}
try {
  const ctx = createContext();
  const spec = launchSpec(id, loadRegistry(ctx), ctx, loadSettings(ctx));
  const { command, args } = resolveSpawn(spec.command, spec.args);
  const child = spawn(command, args, { stdio: "inherit", cwd: spec.cwd, env: { ...process.env, ...spec.env } });
  for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => child.kill(sig));
  child.on("error", (e) => {
    console.error(`[eap-launcher] ${id}: ${e.message}`);
    process.exit(1);
  });
  child.on("exit", (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
} catch (e) {
  console.error(`[eap-launcher] ${id}: ${e.message}`);
  if (process.env.EAP_DEBUG) console.error(JSON.stringify(maskEnv(process.env)));
  process.exit(1);
}
