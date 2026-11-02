// MOCKED Windows: logic + script hygiene only. NOT verification on a real Windows machine.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createContext } from "../path-resolver/index.js";
import { planRuntime, runRuntime, npmInvocation } from "../runtime-manager/index.js";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..", "..");
const REPO = "C:\\Users\\Dev User\\My Repos\\eap";
const files = new Set([
  "C:\\Program Files\\nodejs\\node.exe",
  "C:\\Program Files\\nodejs\\node_modules\\npm\\bin\\npm-cli.js",
  "C:\\Py\\python.exe",
]);
const winCtx = () => {
  const real = createContext();
  return createContext({
    platform: "win32", home: "C:\\Users\\Dev User", repoRoot: REPO, nodeExe: "C:\\Program Files\\nodejs\\node.exe",
    env: { PATH: "C:\\Py", PATHEXT: ".EXE;.CMD", LOCALAPPDATA: "C:\\Users\\Dev User\\AppData\\Local" },
    exists: (f) => files.has(f), readFile: (f) => (f.endsWith("registry.json") ? fs.readFileSync(path.join(real.repoRoot, "shared/core/mcp-registry/registry.json"), "utf8") : ""),
  });
};

test("npm runs via node + npm-cli.js (no .cmd shim; spaces safe)", () => {
  const n = npmInvocation(winCtx());
  assert.equal(n.command, "C:\\Program Files\\nodejs\\node.exe");
  assert.equal(n.prefix[0], "C:\\Program Files\\nodejs\\node_modules\\npm\\bin\\npm-cli.js");
});

test("windows runtime plan: venv Scripts\\python.exe, pip via venv python, cortex via powershell -File install.ps1", () => {
  const c = winCtx();
  const plan = planRuntime(c, {});
  const byId = Object.fromEntries(plan.map((s) => [s.id, s]));
  assert.ok(byId["venv:knowledge-graph"].args.includes("C:\\Users\\Dev User\\My Repos\\eap\\shared\\mcp-tools\\knowledge-graph-generator\\.venv-mcp"));
  assert.equal(byId["pip:knowledge-graph"].command, "C:\\Users\\Dev User\\My Repos\\eap\\shared\\mcp-tools\\knowledge-graph-generator\\.venv-mcp\\Scripts\\python.exe");
  assert.equal(byId["code-cortex:binary"].command, "powershell");
  assert.match(byId["code-cortex:binary"].args.at(-1), /install\.ps1$/);
});

test("windows run: dry-run never executes; apply passes plain argv (no shell string)", () => {
  const c = winCtx();
  const plan = planRuntime(c, { withCortex: true }).filter((s) => s.id.startsWith("npm:") && !s.done).slice(0, 1);
  const calls = [];
  const r = runRuntime(c, plan, { apply: true, exec: (cmd, args, o) => { calls.push([cmd, args, o]); return { status: 0 }; } });
  assert.equal(r[0].status, "ok");
  assert.equal(calls[0][0], "C:\\Program Files\\nodejs\\node.exe");
  assert.match(calls[0][1][0], /npm-cli\.js$/);
  const dry = runRuntime(c, plan, { apply: false, exec: () => { throw new Error("must not run"); } });
  assert.equal(dry[0].status, "dry-run");
});

test("install scripts: no personal/absolute paths; windows script anchors on $PSScriptRoot and defaults to dry-run", () => {
  const ps1 = fs.readFileSync(path.join(ROOT, "install/windows/install-all.ps1"), "utf8");
  assert.match(ps1, /\$PSScriptRoot/);
  assert.doesNotMatch(ps1, /[A-Za-z]:\\\\Users|\/Users\//);
  assert.match(ps1, /param\(\[switch\]\$Apply/);
  for (const f of ["install/macos/install-all.sh", "install/linux/install-all.sh", "shared/mcp-tools/knowledge-graph-generator/sync-projects.sh"]) {
    assert.doesNotMatch(fs.readFileSync(path.join(ROOT, f), "utf8"), /\/Users\/[a-z]+/i, f);
  }
  assert.doesNotMatch(fs.readFileSync(path.join(ROOT, "shared/mcp-tools/knowledge-graph-generator/sync-projects.ps1"), "utf8"), /[A-Za-z]:\\|\/Users\//);
});
