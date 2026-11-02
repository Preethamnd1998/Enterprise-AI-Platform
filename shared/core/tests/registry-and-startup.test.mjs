import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createContext } from "../path-resolver/index.js";
import { loadRegistry, validateRegistry, serversForClient, launchSpec, clientLaunch } from "../mcp-registry/index.js";
import { selftest } from "../selftest.js";

const ctx = createContext();
const reg = loadRegistry(ctx);
const sdk = fs.existsSync(path.join(ctx.repoRoot, "shared/mcp-tools/unified-trace-mcp/node_modules/@modelcontextprotocol"));

test("registry valid; every entry exists", () => assert.deepEqual(validateRegistry(reg, ctx), []));

test("validator catches bad entries", () => {
  const bad = structuredClone(reg);
  bad.servers["unified-trace"].entry = "nope.js";
  bad.servers["unified-trace"].clients = ["vim"];
  const e = validateRegistry(bad, ctx);
  assert.ok(e.some((x) => /entry not found/.test(x)) && e.some((x) => /bad clients/.test(x)));
});

test("exposure: internal servers hidden, kafka not auto-exposed, bridge not offered to opencode itself", () => {
  assert.deepEqual(serversForClient(reg, "opencode", "darwin"), ["unified-trace"]);
  assert.deepEqual(serversForClient(reg, "claude-code", "linux").sort(), ["opencode-bridge", "unified-trace"]);
  assert.ok(!serversForClient(reg, "cursor", "win32").includes("knowledge-graph"));
});

test("launchSpec fails with actionable message when venv/binary absent (mock ctx)", () => {
  const c = createContext({ repoRoot: ctx.repoRoot, platform: "win32", env: { PATH: "" }, exists: () => false, home: "C:\\u" });
  assert.throws(() => launchSpec("knowledge-graph", reg, c), /venv python not found.*Scripts/s);
  assert.throws(() => launchSpec("code-cortex", reg, c), /binary not found.*install\.ps1/s);
});

test("clientLaunch always goes through launcher (no python/binary paths in client config)", () => {
  const l = clientLaunch("unified-trace", ctx);
  assert.equal(path.basename(l.args[0]), "launcher.js");
  assert.equal(l.args[1], "unified-trace");
});

test("no hardcoded personal paths in shared core or migrated MCPs", () => {
  const files = [];
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).forEach((e) => {
    if (e.name === "node_modules" || e.name === "tests") return;
    const p = path.join(d, e.name);
    e.isDirectory() ? walk(p) : /\.(js|mjs|json)$/.test(e.name) && !/package-lock/.test(e.name) && files.push(p);
  });
  ["shared/core", "shared/mcp-tools/unified-trace-mcp", "shared/mcp-tools/opencode-mcp-bridge", "shared/mcp-tools/kafka-mcp"].forEach((d) => walk(path.join(ctx.repoRoot, d)));
  const hits = files.filter((f) => /\/Users\/[a-z]+\/|[A-Z]:\\\\Users|D:\\\\GitLab/i.test(fs.readFileSync(f, "utf8")));
  assert.deepEqual(hits, []);
});

test("MCP startup via launcher, independent of any client (real processes)", { skip: !sdk && "MCP SDK not installed", timeout: 90000 }, async () => {
  const res = await selftest(ctx);
  for (const r of res) assert.equal(r.status, "ok", `${r.name}: ${r.detail}`);
  assert.ok(res.some((r) => r.name.includes("unified-trace")) && res.some((r) => r.name.includes("opencode-bridge")));
});

test("bridge starts without PROJECTS_DIR and reports missing roots instead of crashing", { skip: !sdk && "SDK missing", timeout: 30000 }, async () => {
  const { spawnSync } = await import("node:child_process");
  const r = spawnSync(ctx.nodeExe, [path.join(ctx.repoRoot, "shared/mcp-tools/opencode-mcp-bridge/index.js")], {
    input: "", encoding: "utf8", timeout: 10000,
    env: { PATH: process.env.PATH, HOME: fs.mkdtempSync(path.join(os.tmpdir(), "eap-h-")) },
  });
  assert.doesNotMatch(r.stderr, /ENOENT|realpath|Error: no/i);
});
