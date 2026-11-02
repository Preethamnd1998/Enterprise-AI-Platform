// MOCK-PLATFORM tests: prove resolver logic for win32/darwin/linux layouts.
// They do NOT prove behaviour on a real Windows machine.
import test from "node:test";
import assert from "node:assert/strict";
import {
  createContext, loadSettings, parseEnvFile, resolveVenvPython, resolveCodeCortex, resolveBasePython,
  resolveNode, clientPaths, kgDir, expandPath,
} from "../path-resolver/index.js";

const WIN_ROOT = "C:\\Users\\Dev User\\My Repos\\enterprise-ai-platform";
const winCtx = (files = [], env = {}, extra = {}) => {
  const set = new Set(files);
  return createContext({
    platform: "win32", home: "C:\\Users\\Dev User", repoRoot: WIN_ROOT, nodeExe: "C:\\Program Files\\nodejs\\node.exe",
    env: { LOCALAPPDATA: "C:\\Users\\Dev User\\AppData\\Local", APPDATA: "C:\\Users\\Dev User\\AppData\\Roaming", PATH: "", ...env },
    exists: (f) => set.has(f), readFile: (f) => extra.files?.[f] ?? "", ...extra,
  });
};
const macCtx = (files = [], env = {}, extra = {}) => {
  const set = new Set(files);
  return createContext({ platform: "darwin", home: "/Users/dev", repoRoot: "/Users/dev/eap", nodeExe: "/usr/local/bin/node", env: { PATH: "/usr/bin:/opt/homebrew/bin", ...env }, exists: (f) => set.has(f), readFile: (f) => extra.files?.[f] ?? "", ...extra });
};

test("venv python path per OS, paths with spaces", () => {
  const kg = `${WIN_ROOT}\\shared\\mcp-tools\\knowledge-graph-generator`;
  const w = winCtx([`${kg}\\.venv-mcp\\Scripts\\python.exe`]);
  assert.equal(resolveVenvPython(w).path, `${kg}\\.venv-mcp\\Scripts\\python.exe`);
  const m = macCtx(["/Users/dev/eap/shared/mcp-tools/knowledge-graph-generator/.venv-mcp/bin/python"]);
  assert.equal(resolveVenvPython(m).path, "/Users/dev/eap/shared/mcp-tools/knowledge-graph-generator/.venv-mcp/bin/python");
});

test("missing venv gives diagnostic, not a throw", () => {
  const r = resolveVenvPython(macCtx());
  assert.equal(r.exists, false);
  assert.match(r.hint, /platform:install/);
});

test("legacy sibling KG used until in-repo venv AND index exist", () => {
  const legacyVenv = "/Users/dev/knowledge-graph-generator/.venv-mcp/bin/python";
  assert.equal(kgDir(macCtx([legacyVenv])), "/Users/dev/knowledge-graph-generator");
  const kg = "/Users/dev/eap/shared/mcp-tools/knowledge-graph-generator";
  const venvOnly = macCtx([legacyVenv, `${kg}/.venv-mcp/bin/python`]);
  assert.equal(kgDir(venvOnly), "/Users/dev/knowledge-graph-generator", "venv without index must not switch yet");
  const ready = macCtx([legacyVenv, `${kg}/.venv-mcp/bin/python`, `${kg}/output/knowledge_graph.db`]);
  assert.equal(kgDir(ready), kg);
});

test("KG_SOURCE pins legacy / in-repo regardless of readiness", () => {
  const kg = "/Users/dev/eap/shared/mcp-tools/knowledge-graph-generator";
  const files = ["/Users/dev/knowledge-graph-generator/.venv-mcp/bin/python", `${kg}/.venv-mcp/bin/python`, `${kg}/output/knowledge_graph.db`];
  assert.equal(kgDir(macCtx(files, { KG_SOURCE: "legacy" })), "/Users/dev/knowledge-graph-generator");
  assert.equal(kgDir(macCtx(files, { KG_SOURCE: "in-repo" })), kg);
  assert.equal(kgDir(macCtx(files)), kg);
});

test("code-cortex: windows .exe + LOCALAPPDATA default, mac ~/.local/bin, env override wins", () => {
  const exe = "C:\\Users\\Dev User\\AppData\\Local\\Programs\\code-cortex-mcp\\code-cortex-mcp.exe";
  assert.equal(resolveCodeCortex(winCtx([exe])).path, exe);
  assert.equal(resolveCodeCortex(macCtx(["/Users/dev/.local/bin/code-cortex-mcp"])).path, "/Users/dev/.local/bin/code-cortex-mcp");
  const o = macCtx(["/opt/cc", "/Users/dev/.local/bin/code-cortex-mcp"], { UT_CODE_CORTEX_BIN: "/opt/cc" });
  assert.equal(resolveCodeCortex(o).source, "UT_CODE_CORTEX_BIN");
});

test("code-cortex missing -> OS-specific install hint", () => {
  assert.match(resolveCodeCortex(winCtx()).hint, /install\.ps1/);
  assert.match(resolveCodeCortex(macCtx()).hint, /install\.sh/);
});

test("PATH lookup honours PATHEXT on windows", () => {
  const exe = "C:\\Tools\\python.EXE";
  const c = winCtx([exe], { PATH: "C:\\Tools", PATHEXT: ".COM;.EXE" });
  assert.equal(resolveBasePython(c).path, exe);
});

test("WindowsApps python stub is ignored", () => {
  const stub = "C:\\Users\\Dev User\\AppData\\Local\\Microsoft\\WindowsApps\\python.exe";
  const c = winCtx([stub], { PATH: "C:\\Users\\Dev User\\AppData\\Local\\Microsoft\\WindowsApps", PATHEXT: ".EXE" });
  assert.equal(resolveBasePython(c).exists, false);
});

test("settings precedence env > paths.local.env > paths.env; blank = unset", () => {
  const files = { [`${"/Users/dev/eap"}/paths.env`]: "PROJECTS_DIR=/a\nPYTHON_PATH=\nCONTEXT_PATH=/ctx\n", "/Users/dev/eap/paths.local.env": "PROJECTS_DIR=/b\nCODE_CORTEX_PATH=/cc\n" };
  const c = macCtx(["/Users/dev/eap/paths.env", "/Users/dev/eap/paths.local.env"], { PROJECTS_DIR: "/c" }, { files });
  const s = loadSettings(c);
  assert.equal(s.PROJECTS_DIR, "/c");
  assert.equal(s.CODE_CORTEX_PATH, "/cc");
  assert.equal(s.CONTEXT_PATH, "/ctx");
  assert.equal(s.PYTHON_PATH, undefined);
});

test("process NODE_PATH (module search path) is NOT treated as node executable", () => {
  const c = macCtx([], { NODE_PATH: "/some/modules" });
  assert.equal(loadSettings(c).NODE_PATH, undefined);
  const c2 = macCtx(["/n/node"], { EAP_NODE_PATH: "/n/node" });
  assert.equal(resolveNode(c2).path, "/n/node");
});

test("expandPath: ~, %VAR%, $VAR, windows separators kept", () => {
  const w = winCtx([], { LOCALAPPDATA: "C:\\L" });
  assert.equal(expandPath("%LOCALAPPDATA%\\x", w), "C:\\L\\x");
  assert.equal(expandPath("~/p", macCtx()), "/Users/dev/p");
  assert.equal(expandPath("~\\p", w), "C:\\Users\\Dev User\\p");
});

test("client config paths per OS; configRoot relocates everything (sandbox)", () => {
  const w = clientPaths(winCtx());
  assert.equal(w.claude.desktopConfig, "C:\\Users\\Dev User\\AppData\\Roaming\\Claude\\claude_desktop_config.json");
  assert.equal(w.cursor.mcpJson, "C:\\Users\\Dev User\\.cursor\\mcp.json");
  const m = clientPaths(macCtx());
  assert.equal(m.claude.desktopConfig, "/Users/dev/Library/Application Support/Claude/claude_desktop_config.json");
  assert.equal(m.opencode.configJsonc, "/Users/dev/.config/opencode/opencode.jsonc");
  const sb = clientPaths(macCtx(), "/tmp/sb");
  for (const v of [sb.claude.userConfig, sb.cursor.dir, sb.opencode.dir]) assert.ok(v.startsWith("/tmp/sb"), v);
});

test("parseEnvFile ignores comments/blank/quotes", () => {
  assert.deepEqual(parseEnvFile('# c\nA=1\nB="x y"\nC=\n'), { A: "1", B: "x y" });
});
