// win32 cases are MOCKED (path.win32 on this machine) — logic only, not real-Windows verification.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createPathGuard, canonicalize, resolveSpawn, maskEnv, redactText, deniedReason, SecurityError } from "../security/index.js";

const winGuard = (roots = ["C:\\Work\\Projects"]) =>
  createPathGuard({ allowedRoots: roots, platform: "win32", exists: () => true, realpath: (f) => f, cwd: "C:\\Work" });

test("win32: allows inside root (spaces, mixed slashes)", () => {
  const g = createPathGuard({ allowedRoots: ["C:\\My Work\\Projects"], platform: "win32", exists: () => true, realpath: (f) => f });
  assert.equal(g.check("C:/My Work/Projects/BE/core-service").ok, true);
});
test("win32: traversal, sibling-prefix, other drive rejected", () => {
  const g = winGuard();
  assert.equal(g.check("C:\\Work\\Projects\\..\\Secrets").code, "OUTSIDE_ROOT");
  assert.equal(g.check("C:\\Work\\Projects-evil\\x").code, "OUTSIDE_ROOT");
  assert.equal(g.check("D:\\Work\\Projects\\x").code, "OUTSIDE_ROOT");
});
test("win32: backslash .ssh / .env denied (old '/'-only deny-list bypass)", () => {
  const g = winGuard();
  assert.equal(g.check("C:\\Work\\Projects\\app\\.ssh\\id_rsa").code, "DENIED");
  assert.equal(g.check("C:\\Work\\Projects\\app\\.env").code, "DENIED");
  assert.equal(g.check("C:\\Work\\Projects\\app\\.env.example").ok, true);
});
test("win32: case-insensitive root match, device paths and ADS rejected", () => {
  const g = winGuard();
  assert.equal(g.check("c:\\work\\projects\\x").ok, true);
  assert.equal(g.check("\\\\?\\C:\\Work\\Projects\\x").code, "DEVICE_PATH");
  assert.equal(g.check("C:\\Work\\Projects\\a.txt::$DATA").code, "ADS");
});
test("NUL / empty / no roots / missing root", () => {
  assert.throws(() => canonicalize("a\0b"), SecurityError);
  assert.throws(() => createPathGuard({ allowedRoots: [] }), /no allowed roots/);
  assert.throws(() => createPathGuard({ allowedRoots: ["/definitely/not/here"] }), /does not exist/);
});

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "eap-sec-"));
const root = path.join(tmp, "projects");
const outside = path.join(tmp, "outside");
fs.mkdirSync(path.join(root, "app", ".git"), { recursive: true });
fs.mkdirSync(path.join(root, "app", ".ssh"), { recursive: true });
fs.mkdirSync(outside);
fs.symlinkSync(outside, path.join(root, "app", "link"));
fs.mkdirSync(path.join(tmp, "projects-evil"));

test("posix(real fs): symlink escape blocked, incl. not-yet-existing file under link", () => {
  const g = createPathGuard({ allowedRoots: [root] });
  assert.equal(g.check(path.join(root, "app", "link")).code, "OUTSIDE_ROOT");
  assert.equal(g.check(path.join(root, "app", "link", "new.txt")).code, "OUTSIDE_ROOT");
});
test("posix(real fs): inside ok, traversal, sibling prefix, denied dir", () => {
  const g = createPathGuard({ allowedRoots: [root] });
  assert.equal(g.check(path.join(root, "app")).ok, true);
  assert.equal(g.check(path.join(root, "app", "..", "..", "outside")).code, "OUTSIDE_ROOT");
  assert.equal(g.check(path.join(tmp, "projects-evil")).code, "OUTSIDE_ROOT");
  assert.equal(g.check(path.join(root, "app", ".ssh")).code, "DENIED");
});
test("root located under a denied dir name is not rejected wholesale", () => {
  const cfgRoot = path.join(tmp, ".config", "work");
  fs.mkdirSync(cfgRoot, { recursive: true });
  assert.equal(createPathGuard({ allowedRoots: [cfgRoot] }).check(cfgRoot).ok, true);
});
test("deniedReason", () => {
  assert.match(deniedReason([".aws"]), /sensitive directory/);
  assert.equal(deniedReason(["src", "main"]), null);
});

test("resolveSpawn: .cmd shim only for plain args (injection refused)", () => {
  const w = { platform: "win32", env: { ComSpec: "C:\\Windows\\System32\\cmd.exe" } };
  const ok = resolveSpawn("C:\\n\\opencode.cmd", ["--version"], w);
  assert.equal(ok.command, "C:\\Windows\\System32\\cmd.exe");
  assert.deepEqual(ok.args.slice(0, 3), ["/d", "/s", "/c"]);
  assert.throws(() => resolveSpawn("C:\\n\\opencode.cmd", ["run", "hi & calc.exe"], w), /CMD_SHIM|shim/);
  assert.throws(() => resolveSpawn("C:\\Program Files\\nodejs\\npm.cmd", ["install"], w), /spaces/);
  assert.deepEqual(resolveSpawn("C:\\n\\opencode.exe", ["run", "a & b"], w), { command: "C:\\n\\opencode.exe", args: ["run", "a & b"] });
  assert.deepEqual(resolveSpawn("/bin/x.cmd", ["a & b"], { platform: "linux" }), { command: "/bin/x.cmd", args: ["a & b"] });
});

test("secrets masked/redacted", () => {
  const env = { KAFKA_SASL_PASSWORD: "hunter2hunter2", PATH: "/bin", GITLAB_TOKEN: "glpat-abcdef" };
  assert.deepEqual(maskEnv(env), { KAFKA_SASL_PASSWORD: "***", PATH: "/bin", GITLAB_TOKEN: "***" });
  assert.equal(redactText("login hunter2hunter2 ok glpat-abcdef", env), "login *** ok ***");
});
