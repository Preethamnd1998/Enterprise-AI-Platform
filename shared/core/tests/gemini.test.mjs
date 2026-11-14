// NOTE: "disabled" cases pin GEMINI_ENABLED=false in the environment (an empty value would fall through to the
// developer's own paths.local.env, which may have the integration enabled).
// Optional Gemini integration — platform side: key handling, setup flows, registry gating and
// package contents. Disabled-by-default is the contract: nothing changes unless GEMINI_ENABLED.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createContext } from "../path-resolver/index.js";
import { loadRegistry, validateRegistry, serversForClient, isEnabled } from "../mcp-registry/index.js";
import { planRuntime } from "../runtime-manager/index.js";
import { buildPlugins } from "../plugin-manager/index.js";
import { PassThrough } from "node:stream";
import { parseDotenv, detectKey, envFilePath, saveKey, forgetKey, setSetting, geminiStatus, describeKey, validateBaseUrl, promptHidden, normalizeKeyInput, explainKeyProblem, checkApi, candidateModels, DEFAULT_MODEL } from "../gemini/index.js";
import http from "node:http";
import { runSetup } from "../gemini/setup.js";

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const KEY = ["AIza", "SyCORETEST-0123456789abcdefghijklmnopq"].join(""); // assembled at runtime: no key-shaped literal for secret scanners
const tmp = (p = "gcore-") => fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), p));
// A sandbox "repo root" so setting/key files never touch the real checkout.
function sandbox(env = {}) {
  const root = tmp();
  fs.writeFileSync(path.join(root, "paths.env"), "PROJECTS_DIR=\n");
  const ctx = createContext({ repoRoot: root, env: { ...process.env, GEMINI_API_KEY: "", GOOGLE_API_KEY: "", GEMINI_ENABLED: "", ...env } });
  return { root, ctx, local: path.join(root, "paths.local.env"), envFile: path.join(root, ".env") };
}
const collect = () => { const lines = []; return { lines, log: (l) => lines.push(l) }; };

test("parseDotenv: comments, export, quotes", () => {
  assert.deepEqual(parseDotenv('# c\nA=1\nexport B="two"\nC=\'three\'\n\nbad line\nD = spaced '), { A: "1", B: "two", C: "three", D: "spaced" });
});

test("detectKey: GEMINI_API_KEY, then GOOGLE_API_KEY, then the env file; none → null", () => {
  const s = sandbox();
  assert.deepEqual(detectKey(s.ctx), { key: null, source: null });
  fs.writeFileSync(s.envFile, `GOOGLE_API_KEY=file-google-key-0000000000\nGEMINI_API_KEY=${KEY}\n`);
  assert.deepEqual(detectKey(s.ctx), { key: KEY, source: `file:${s.envFile}` });
  const g = sandbox({ GOOGLE_API_KEY: "env-google-key-00000000000" });
  fs.writeFileSync(g.envFile, `GEMINI_API_KEY=${KEY}\n`);
  assert.equal(detectKey(g.ctx).source, "env:GOOGLE_API_KEY", "environment wins over the file");
  const both = sandbox({ GEMINI_API_KEY: "env-gemini-key-00000000000", GOOGLE_API_KEY: "env-google-key-00000000000" });
  assert.equal(detectKey(both.ctx).source, "env:GEMINI_API_KEY");
  const custom = sandbox({ GEMINI_ENV_FILE: path.join(s.root, "elsewhere.env") });
  assert.equal(envFilePath(custom.ctx), path.join(s.root, "elsewhere.env"));
});

test("saveKey: owner-only file, upsert keeps other lines, rejects anything that is not a plain token", () => {
  const s = sandbox();
  fs.writeFileSync(s.envFile, "GITLAB_PAT=abc\nGEMINI_API_KEY=old-old-old-old-old-old\n");
  saveKey(s.envFile, KEY);
  const text = fs.readFileSync(s.envFile, "utf8");
  assert.equal(text, `GITLAB_PAT=abc\nGEMINI_API_KEY=${KEY}\n`);
  if (process.platform !== "win32") assert.equal(fs.statSync(s.envFile).mode & 0o777, 0o600);
  for (const bad of ["short", `${KEY}\nEVIL=1`, `${KEY} && rm -rf /`, `"${KEY}"`, "", null, "a".repeat(300)]) assert.throws(() => saveKey(s.envFile, bad), /does not look like a Gemini API key/);
  assert.equal(fs.readFileSync(s.envFile, "utf8"), text, "a rejected key must not touch the file");
  forgetKey(s.envFile);
  assert.equal(fs.readFileSync(s.envFile, "utf8"), "GITLAB_PAT=abc\n");
});

test("setSetting writes paths.local.env only (never the tracked paths.env) and upserts", () => {
  const s = sandbox();
  setSetting(s.ctx, "GEMINI_ENABLED", "true");
  setSetting(s.ctx, "GEMINI_MODEL", "gemini-x");
  setSetting(s.ctx, "GEMINI_ENABLED", "false");
  assert.equal(fs.readFileSync(s.local, "utf8"), "GEMINI_ENABLED=false\nGEMINI_MODEL=gemini-x\n");
  assert.equal(fs.readFileSync(path.join(s.root, "paths.env"), "utf8"), "PROJECTS_DIR=\n");
});

test("status: disabled by default, reports presence and source of a key but never the key", () => {
  const s = sandbox({ GEMINI_API_KEY: KEY });
  const st = geminiStatus(s.ctx);
  assert.equal(st.enabled, false);
  assert.equal(st.keyConfigured, true);
  assert.equal(st.keySource, "env:GEMINI_API_KEY");
  assert.ok(!JSON.stringify(st).includes(KEY));
  assert.equal(describeKey(KEY), `set (${KEY.length} chars, not displayed)`);
  setSetting(s.ctx, "GEMINI_ENABLED", "true");
  assert.equal(geminiStatus(s.ctx).enabled, true);
});

test("validateBaseUrl: https anywhere, http only for localhost", () => {
  assert.equal(validateBaseUrl("https://generativelanguage.googleapis.com/"), "https://generativelanguage.googleapis.com");
  assert.equal(validateBaseUrl("http://127.0.0.1:8080"), "http://127.0.0.1:8080");
  assert.throws(() => validateBaseUrl("http://evil.example.com"), /https/);
  assert.throws(() => validateBaseUrl("not a url"), /valid URL/);
});

test("promptHidden: reads a pasted key with editing, echoes nothing, restores the terminal, handles Ctrl-C and non-TTY", async () => {
  const term = () => {
    const input = new PassThrough();
    input.isTTY = true; input.isRaw = false; input.setRawMode = (v) => { input.isRaw = v; };
    const output = new PassThrough();
    const seen = { text: "" };
    output.on("data", (d) => { seen.text += d; });
    return { input, output, seen };
  };
  const a = term();
  const p = promptHidden("Key: ", { input: a.input, output: a.output });
  assert.equal(a.input.isRaw, true, "raw mode while typing");
  a.input.write(KEY.slice(0, 12));
  a.input.write(`X\u007f${KEY.slice(12)}\r`);
  assert.equal(await p, KEY);
  assert.equal(a.seen.text, "Key: \n", "only the question and a newline are ever written — never the key");
  assert.equal(a.input.isRaw, false, "terminal restored");
  const b = term();
  const cancelled = promptHidden("Key: ", { input: b.input, output: b.output });
  b.input.write("abc\u0003");
  await assert.rejects(cancelled, /cancelled/);
  assert.equal(b.input.isRaw, false);
  await assert.rejects(promptHidden("Key: ", { input: new PassThrough(), output: new PassThrough() }), /not a terminal/);
});

test("normalizeKeyInput: strips paste wrappers; explainKeyProblem never echoes the key", () => {
  const ESC = "\u001b";
  for (const wrapped of [`${ESC}[200~${KEY}${ESC}[201~`, `[200~${KEY}[201~`, `"${KEY}"`, `'${KEY}'`, `\u201C${KEY}\u201D`, `  ${KEY}\n`, `export GEMINI_API_KEY=${KEY}`, `GOOGLE_API_KEY="${KEY}"`, `${KEY}\u200B`]) {
    assert.equal(normalizeKeyInput(wrapped), KEY, JSON.stringify(wrapped).replace(KEY, "<KEY>"));
  }
  assert.equal(explainKeyProblem(KEY), null);
  assert.equal(explainKeyProblem("AQ.Ab8RN6" + "x".repeat(30)), null, "dotted key formats are accepted");
  assert.match(explainKeyProblem(""), /nothing was received/);
  assert.match(explainKeyProblem("short"), /only 5 characters/);
  assert.match(explainKeyProblem("x".repeat(250)), /250 characters .* too long/);
  const bad = explainKeyProblem(`${KEY.slice(0, 10)} ${KEY.slice(10)}\u201D`);
  assert.match(bad, /2 unsupported characters \(U\+0020, U\+201D\)/);
  assert.ok(!bad.includes(KEY.slice(0, 10)), "the explanation must not reveal any part of the key");
  assert.throws(() => saveKey(path.join(tmp(), "e"), "not a key !!!!!!!!!!!!!!!"), /does not look like a Gemini API key: it contains/);
});

test("promptHidden: terminal escape sequences from a paste are not kept as key text", async () => {
  const input = new PassThrough();
  input.isTTY = true; input.isRaw = false; input.setRawMode = (v) => { input.isRaw = v; };
  const output = new PassThrough();
  const p = promptHidden("Key: ", { input, output });
  input.write(`\u001b[200~${KEY}\u001b[201~\r`);
  assert.equal(await p, KEY);
});

// A local stand-in for Google that behaves like the real one did: the retired model is still LISTED and
// answers metadata requests with 200, but generateContent says 404 "no longer available to new users".
async function fakeGoogle({ working = ["gemini-3.5-flash"], busy = [] } = {}) {
  const posts = [];
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const send = (status, json) => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(json)); };
      if (req.method === "GET" && req.url.startsWith("/v1beta/models?")) {
        return send(200, { models: ["gemini-2.5-flash", "gemini-3.5-flash", "gemini-3.6-flash", "gemini-3.7-flash", "gemini-3.8-flash", "gemini-3.5-flash-lite", "gemini-3.1-flash-preview", "gemini-flash-latest", "gemini-3.5-transcribe", "text-embedding-004"].map((n) => ({ name: `models/${n}`, supportedGenerationMethods: n.startsWith("text-embedding") ? ["embedContent"] : ["generateContent"] })) });
      }
      if (req.method === "GET") return send(200, { name: req.url });                         // metadata: always "fine"
      const model = /models\/([^:]+):generateContent/.exec(req.url)?.[1];
      posts.push(model);
      if (req.headers["x-goog-api-key"] !== KEY) return send(400, { error: { message: "API key not valid. Please pass a valid API key." } });
      if (busy.includes(model)) return send(503, { error: { message: "high demand" } });
      if (!working.includes(model)) return send(404, { error: { message: `This model models/${model} is no longer available to new users. Please update your code to use models/gemini-3.8-flash for the latest features.` } });
      send(200, { candidates: [{ content: { parts: [{ text: "{}" }] }, finishReason: "STOP" }] });
    });
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  server.unref(); // a failing assertion must never leave a listening server that keeps the test process alive
  return { url: `http://127.0.0.1:${server.address().port}`, posts, close: () => { server.closeAllConnections?.(); return new Promise((r) => server.close(r)); } };
}

test("checkApi uses a real generation request: a retired-but-listed model is caught, with Google's suggestion", async () => {
  assert.equal(DEFAULT_MODEL, "gemini-3.5-flash");
  const g = await fakeGoogle();
  const ok = await checkApi({ key: KEY, model: "gemini-3.5-flash", baseUrl: g.url });
  assert.deepEqual([ok.ok, ok.model], [true, "gemini-3.5-flash"]);
  const old = await checkApi({ key: KEY, model: "gemini-2.5-flash", baseUrl: g.url });
  assert.deepEqual([old.ok, old.code, old.suggestion], [false, "MODEL", "gemini-3.8-flash"]);
  assert.match(old.reason, /not available to your key \(Google suggests gemini-3\.8-flash\)/);
  assert.equal((await checkApi({ key: "wrong-key-wrong-key-wrong", model: "gemini-3.5-flash", baseUrl: g.url })).code, "AUTH");
  assert.deepEqual(g.posts, ["gemini-3.5-flash", "gemini-2.5-flash", "gemini-3.5-flash"], "every check was a POST generateContent");
  await g.close();
  const b = await fakeGoogle({ busy: [DEFAULT_MODEL] });
  const busy = await checkApi({ key: KEY, model: DEFAULT_MODEL, baseUrl: b.url });
  assert.deepEqual([busy.ok, busy.code], [false, "UNAVAILABLE"]);
  assert.ok(!JSON.stringify(busy).includes(KEY));
  await b.close();
});

test("candidateModels: stable flash models only, newest first", async () => {
  const g = await fakeGoogle();
  assert.deepEqual(await candidateModels({ key: KEY, baseUrl: g.url }), ["gemini-3.8-flash", "gemini-3.7-flash", "gemini-3.6-flash", "gemini-3.5-flash", "gemini-2.5-flash"]);
  await g.close();
  assert.deepEqual(await candidateModels({ key: KEY, baseUrl: "http://127.0.0.1:9" }), [], "an unreachable API yields no candidates, not an exception");
});

test("setup --check: a retired default model is replaced by one that works and the choice is recorded", async () => {
  const g = await fakeGoogle({ working: ["gemini-3.6-flash"] });   // 3.8 is suggested but NOT available to this key
  const s = sandbox({ GEMINI_API_KEY: KEY, GEMINI_MODEL: "gemini-2.5-flash" });
  const out = collect();
  const check = (a) => checkApi({ ...a, baseUrl: g.url });
  const pick = (a) => candidateModels({ ...a, baseUrl: g.url });
  const r = await runSetup(s.ctx, { check: true }, { log: out.log, interactive: false, check, pick });
  assert.deepEqual([r.enabled, r.code], [true, 0]);
  assert.match(out.lines.join("\n"), /model "gemini-2\.5-flash" is not available to your key; using "gemini-3\.6-flash"/);
  assert.match(fs.readFileSync(s.local, "utf8"), /GEMINI_MODEL=gemini-3\.6-flash/);
  assert.match(fs.readFileSync(s.local, "utf8"), /GEMINI_ENABLED=true/);
  assert.deepEqual(g.posts, ["gemini-2.5-flash", "gemini-3.8-flash", "gemini-3.7-flash", "gemini-3.6-flash"], "tried the configured model, Google's suggestion, then the next candidates newest first");
  assert.ok(!out.lines.join("\n").includes(KEY));
  await g.close();
});

test("setup --check: a busy service does not block enabling; a bad key still does; no model found is explained", async () => {
  const busyG = await fakeGoogle({ busy: [DEFAULT_MODEL] });
  const a = sandbox({ GEMINI_API_KEY: KEY });
  const o1 = collect();
  const r1 = await runSetup(a.ctx, { check: true }, { log: o1.log, interactive: false, check: (x) => checkApi({ ...x, baseUrl: busyG.url }) });
  assert.deepEqual([r1.enabled, r1.code], [true, 0]);
  assert.match(o1.lines.join("\n"), /Google is slow, busy or limiting requests right now/);
  await busyG.close();
  const g = await fakeGoogle({ working: [] });
  const b = sandbox({ GEMINI_API_KEY: KEY });
  const o2 = collect();
  const r2 = await runSetup(b.ctx, { check: true }, { log: o2.log, interactive: false, check: (x) => checkApi({ ...x, baseUrl: g.url }), pick: (x) => candidateModels({ ...x, baseUrl: g.url }) });
  assert.equal(r2.enabled, true);
  assert.match(o2.lines.join("\n"), /no working model found automatically/);
  assert.ok(!fs.existsSync(path.join(b.root, "paths.local.env")) || !/GEMINI_MODEL=/.test(fs.readFileSync(b.local, "utf8")));
  await g.close();
  const c = sandbox({ GEMINI_API_KEY: "wrong-key-wrong-key-wrong" });
  const g2 = await fakeGoogle();
  const r3 = await runSetup(c.ctx, { check: true }, { log: collect().log, interactive: false, check: (x) => checkApi({ ...x, baseUrl: g2.url }) });
  assert.deepEqual([r3.enabled, r3.code], [false, 3]);
  await g2.close();
});

// ---- gemini:setup flows ----------------------------------------------------------------
test("setup, key already in the environment: enables, never prints the key", async () => {
  const s = sandbox({ GEMINI_API_KEY: KEY });
  const out = collect();
  const r = await runSetup(s.ctx, {}, { log: out.log, interactive: false, check: async () => ({ ok: true }) });
  assert.deepEqual([r.enabled, r.code, r.keyConfigured], [true, 0, true]);
  assert.match(fs.readFileSync(s.local, "utf8"), /GEMINI_ENABLED=true/);
  assert.ok(!out.lines.join("\n").includes(KEY));
  assert.match(out.lines.join("\n"), /plugin:install claude-code --apply/);
  assert.ok(!fs.existsSync(s.envFile), "env var keys are not copied to disk unless asked");
});

test("setup, no key and no terminal: stays disabled and explains how to proceed", async () => {
  const s = sandbox();
  const out = collect();
  const r = await runSetup(s.ctx, {}, { log: out.log, interactive: false });
  assert.deepEqual([r.enabled, r.code], [false, 2]);
  assert.ok(!fs.existsSync(s.local), "nothing is written");
  assert.match(out.lines.join("\n"), /gemini:setup/);
  const forced = await runSetup(s.ctx, { forceEnable: true }, { log: collect().log, interactive: false });
  assert.deepEqual([forced.enabled, forced.keyConfigured], [true, false]);
});

test("setup, interactive: hidden prompt → key saved owner-only to the env file → enabled", async () => {
  const s = sandbox();
  const out = collect();
  let asked = 0;
  const r = await runSetup(s.ctx, {}, { log: out.log, interactive: true, prompt: async () => { asked += 1; return KEY; }, check: async () => ({ ok: true }) });
  assert.equal(asked, 1);
  assert.deepEqual([r.enabled, r.code], [true, 0]);
  assert.match(fs.readFileSync(s.envFile, "utf8"), new RegExp(`GEMINI_API_KEY=${KEY}`));
  if (process.platform !== "win32") assert.equal(fs.statSync(s.envFile).mode & 0o777, 0o600);
  assert.ok(!out.lines.join("\n").includes(KEY));
  assert.match(fs.readFileSync(s.local, "utf8"), /GEMINI_ENABLED=true/);
});

test("setup, interactive: a quoted or wrapped paste is cleaned and accepted; a refusal explains itself and offers the fallback", async () => {
  const s = sandbox();
  const out = collect();
  const r = await runSetup(s.ctx, {}, { log: out.log, interactive: true, prompt: async () => `  "${KEY}" `, check: async () => ({ ok: true }) });
  assert.deepEqual([r.enabled, r.code], [true, 0]);
  assert.match(fs.readFileSync(s.envFile, "utf8"), new RegExp(`^GEMINI_API_KEY=${KEY}$`, "m"));
  assert.match(out.lines.join("\n"), new RegExp(`received ${KEY.length} characters`));
  const bad = sandbox();
  const o2 = collect();
  const r2 = await runSetup(bad.ctx, {}, { log: o2.log, interactive: true, prompt: async () => "short" });
  assert.equal(r2.code, 1);
  const text = o2.lines.join("\n");
  assert.match(text, /only 5 characters/);
  assert.match(text, /read -s GEMINI_API_KEY/);
  assert.match(text, /--store-key/);
});

test("setup --store-key: copies a key from the environment into the env file (validated), no prompt", async () => {
  const s = sandbox({ GEMINI_API_KEY: `"${KEY}"` });
  const out = collect();
  const r = await runSetup(s.ctx, { storeKey: true }, { log: out.log, interactive: false, check: async () => ({ ok: true }) });
  assert.deepEqual([r.enabled, r.keyConfigured], [true, true]);
  assert.match(fs.readFileSync(s.envFile, "utf8"), new RegExp(`^GEMINI_API_KEY=${KEY}$`, "m"));
  if (process.platform !== "win32") assert.equal(fs.statSync(s.envFile).mode & 0o777, 0o600);
  assert.ok(!out.lines.join("\n").includes(KEY));
  const junk = sandbox({ GEMINI_API_KEY: "has spaces in it and is clearly not a key" });
  const r2 = await runSetup(junk.ctx, { storeKey: true }, { log: collect().log, interactive: false });
  assert.deepEqual([r2.enabled, r2.code], [false, 1]);
  assert.ok(!fs.existsSync(junk.envFile) && !fs.existsSync(junk.local));
});

test("setup, interactive: invalid, empty or rejected keys never enable anything", async () => {
  const bad = sandbox();
  const r1 = await runSetup(bad.ctx, {}, { log: collect().log, interactive: true, prompt: async () => "short" });
  assert.deepEqual([r1.enabled, r1.code], [false, 1]);
  assert.ok(!fs.existsSync(bad.envFile) && !fs.existsSync(bad.local));
  const empty = sandbox();
  const r2 = await runSetup(empty.ctx, {}, { log: collect().log, interactive: true, prompt: async () => "" });
  assert.equal(r2.enabled, false);
  const auth = sandbox();
  const r3 = await runSetup(auth.ctx, {}, { log: collect().log, interactive: true, prompt: async () => KEY, check: async () => ({ ok: false, code: "AUTH", reason: "the API rejected the key" }) });
  assert.deepEqual([r3.enabled, r3.code], [false, 3]);
  assert.ok(!fs.existsSync(auth.local), "a rejected key must not enable the integration");
  const cancel = sandbox();
  const r4 = await runSetup(cancel.ctx, {}, { log: collect().log, interactive: true, prompt: async () => { throw new Error("cancelled"); } });
  assert.equal(r4.code, 130);
});

test("setup --disable (and --forget-key) returns to the Claude-only default", async () => {
  const s = sandbox();
  fs.writeFileSync(s.envFile, `GEMINI_API_KEY=${KEY}\nOTHER=1\n`);
  setSetting(s.ctx, "GEMINI_ENABLED", "true");
  const r = await runSetup(s.ctx, { disable: true, forgetKey: true }, { log: collect().log });
  assert.equal(r.enabled, false);
  assert.match(fs.readFileSync(s.local, "utf8"), /GEMINI_ENABLED=false/);
  assert.equal(fs.readFileSync(s.envFile, "utf8"), "OTHER=1\n");
});

test("setup dry run (apply:false) writes nothing", async () => {
  const s = sandbox({ GEMINI_API_KEY: KEY });
  const out = collect();
  await runSetup(s.ctx, { apply: false }, { log: out.log, interactive: false });
  assert.ok(!fs.existsSync(s.local));
  assert.match(out.lines.join("\n"), /dry-run/);
});

// ---- registry / runtime / package gating ------------------------------------------------
test("registry: gemini-assistant is valid, optional, and absent unless GEMINI_ENABLED", () => {
  const ctx = createContext({ repoRoot });
  const reg = loadRegistry(ctx);
  assert.deepEqual(validateRegistry(reg, ctx), []);
  const g = reg.servers["gemini-assistant"];
  assert.equal(g.optionalSetting, "GEMINI_ENABLED");
  assert.equal(isEnabled(g, {}), false);
  assert.equal(isEnabled(g, { GEMINI_ENABLED: "false" }), false);
  assert.equal(isEnabled(g, { GEMINI_ENABLED: "true" }), true);
  assert.equal(isEnabled(reg.servers["unified-trace"], {}), true, "non-optional servers are unaffected");
  for (const client of ["claude-code", "cursor", "opencode"]) {
    assert.ok(!serversForClient(reg, client, "darwin").includes("gemini-assistant"), `${client}: default`);
    assert.ok(serversForClient(reg, client, "darwin", { GEMINI_ENABLED: "true" }).includes("gemini-assistant"), `${client}: enabled`);
  }
  // enabling adds exactly one server per client — nothing else changes
  assert.deepEqual(serversForClient(reg, "claude-code", "darwin", { GEMINI_ENABLED: "true" }).filter((i) => i !== "gemini-assistant"), serversForClient(reg, "claude-code", "darwin"));
  assert.deepEqual(g.healthcheck.expectTools.length, 7);
});

test("runtime plan installs the server's npm deps only when enabled", () => {
  const off = planRuntime(createContext({ repoRoot, env: { ...process.env, GEMINI_ENABLED: "false" } })).map((s) => s.id);
  assert.ok(!off.includes("npm:gemini-assistant"));
  const on = planRuntime(createContext({ repoRoot, env: { ...process.env, GEMINI_ENABLED: "true" } })).map((s) => s.id);
  assert.ok(on.includes("npm:gemini-assistant"));
});

test("package build: no trace of Gemini by default; server + skill + tools folder when enabled (all clients)", () => {
  const cfg = tmp("gcfg-");
  const off = buildPlugins(createContext({ repoRoot, env: { ...process.env, GEMINI_ENABLED: "false" } }), { outDir: tmp("goff-"), configRoot: cfg });
  const p0 = off["claude-code"].pluginDir;
  assert.ok(!fs.readFileSync(path.join(p0, ".mcp.json"), "utf8").includes("gemini"));
  assert.ok(!fs.existsSync(path.join(p0, "skills", "gemini-delegation")));
  assert.ok(!fs.existsSync(path.join(p0, "mcp-tools", "gemini-assistant-mcp")));
  assert.ok(!fs.readFileSync(path.join(off.cursor.pluginDir, "mcp.json"), "utf8").includes("gemini"));
  assert.ok(!fs.existsSync(path.join(off.opencode.pluginDir, "skills", "gemini-delegation")));

  const on = buildPlugins(createContext({ repoRoot, env: { ...process.env, GEMINI_ENABLED: "true" } }), { outDir: tmp("gon-"), configRoot: cfg });
  const p1 = on["claude-code"].pluginDir;
  const mcp = JSON.parse(fs.readFileSync(path.join(p1, ".mcp.json"), "utf8")).mcpServers;
  assert.ok(mcp["gemini-assistant"]);
  assert.match(mcp["gemini-assistant"].args[0], /launcher\.js$/);
  assert.equal(mcp["gemini-assistant"].args[1], "gemini-assistant");
  assert.ok(!JSON.stringify(mcp).includes("AIza"), "no key material in MCP config");
  const skill = fs.readFileSync(path.join(p1, "skills", "gemini-delegation", "SKILL.md"), "utf8");
  assert.match(skill, /^---\nname: gemini-delegation/);
  assert.ok(fs.existsSync(path.join(p1, "mcp-tools", "gemini-assistant-mcp", "index.js")));
  assert.ok(!fs.existsSync(path.join(p1, "mcp-tools", "gemini-assistant-mcp", "node_modules")));
  assert.ok(JSON.parse(fs.readFileSync(path.join(on.cursor.pluginDir, "mcp.json"), "utf8")).mcpServers["gemini-assistant"]);
  assert.ok(fs.existsSync(path.join(on.opencode.pluginDir, "skills", "gemini-delegation", "SKILL.md")));
  // everything that exists without Gemini still exists with it
  const base = Object.keys(JSON.parse(fs.readFileSync(path.join(p0, ".mcp.json"), "utf8")).mcpServers);
  for (const id of base) assert.ok(mcp[id], `${id} must be unchanged`);
});
