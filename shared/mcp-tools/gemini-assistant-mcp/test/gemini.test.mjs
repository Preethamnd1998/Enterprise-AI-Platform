// gemini-assistant-mcp tests — no real API key or network: a local HTTP server stands in for
// the Gemini API (GEMINI_BASE_URL is honoured for localhost only).
import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { redact } from "../lib/redact.js";
import { createClient } from "../lib/client.js";
import { createTools } from "../lib/tools.js";
import { createPathGuard } from "../../../core/security/index.js";

const here = path.dirname(fileURLToPath(import.meta.url));
// Fake credentials are assembled at runtime so no key-shaped literal exists in the source (secret scanners).
const KEY = ["AIza", "SyTESTKEY-0123456789abcdefghijklmnop"].join(""); // fake; used to prove it never leaks
const AWS = ["AKIA", "ABCDEFGHIJKLMNOP"].join("");
const JWT = ["eyJhbGciOiJIUzI1NiJ9", "eyJzdWIiOiIxMjM0NTY3ODkwIn0", "abcdefghijk"].join(".");
const PEM = ["-----BEGIN RSA PRIVATE KEY-----", "MIIabc", "-----END RSA PRIVATE KEY-----"].join("\n");
const tmp = (p = "gem-") => fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), p));
const write = (f, c) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, c); };

// ---- mock Gemini API ------------------------------------------------------------------
async function mock(respond) {
  const requests = [];
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const rec = { url: req.url, method: req.method, headers: req.headers, body, json: (() => { try { return JSON.parse(body); } catch { return null; } })() };
      requests.push(rec);
      const r = respond(rec, requests.length);
      res.writeHead(r.status ?? 200, { "content-type": "application/json" });
      res.end(typeof r.raw === "string" ? r.raw : JSON.stringify(r.json));
    });
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  return { url: `http://127.0.0.1:${server.address().port}`, requests, close: () => new Promise((r) => server.close(r)) };
}
const ok = (data, extra = {}) => ({ json: { candidates: [{ content: { parts: [{ text: JSON.stringify(data) }] }, finishReason: "STOP" }], usageMetadata: { promptTokenCount: 11, candidatesTokenCount: 7 }, ...extra } });

// ---- redaction -------------------------------------------------------------------------
test("redact: secrets always masked, personal data masked by default", () => {
  const input = [
    "password=hunter22 and token: abcd1234efgh5678", "postgres://app:S3cr3t!@db.internal:5432/x",
    "Authorization: Bearer abcdefghijklmnop1234567890", `key ${KEY}`, JWT, PEM, AWS,
    "mail jane.doe@example.com phone +91 98765 43210 / 9876543210 id 1234 5678 9012",
  ].join("\n");
  const r = redact(input);
  for (const secret of ["hunter22", "abcd1234efgh5678", "S3cr3t!", "abcdefghijklmnop1234567890", KEY, "MIIabc", AWS, JWT, "jane.doe@example.com", "98765 43210", "9876543210", "1234 5678 9012"]) {
    assert.ok(!r.text.includes(secret), `${secret} leaked`);
  }
  assert.match(r.text, /postgres:\/\/\[USER\]:\[PASSWORD\]@db\.internal/);
  assert.match(r.text, /password=\[REDACTED\]/);
  assert.ok(r.count >= 9);
  const noPii = redact("mail jane.doe@example.com password=abcdef", { pii: false });
  assert.match(noPii.text, /jane\.doe@example\.com/);
  assert.doesNotMatch(noPii.text, /abcdef\b/);
  assert.deepEqual(redact("order 1699999999999 took 3.5s"), { text: "order 1699999999999 took 3.5s", count: 0 });
});

// ---- client ----------------------------------------------------------------------------
test("client: official request shape, key only in header, parsed JSON + usage", async () => {
  const m = await mock(() => ok({ hello: "world" }));
  const c = createClient({ key: KEY, model: "gemini-test", baseUrl: m.url, retryDelays: [] });
  const r = await c.generate({ system: "sys", prompt: "p", schema: { type: "OBJECT", properties: {} } });
  assert.deepEqual(r, { ok: true, data: { hello: "world" }, usage: { input: 11, output: 7 }, model: "gemini-test" });
  const q = m.requests[0];
  assert.equal(q.method, "POST");
  assert.equal(q.url, "/v1beta/models/gemini-test:generateContent");
  assert.equal(q.headers["x-goog-api-key"], KEY);
  assert.ok(!q.body.includes(KEY), "key must not be in the body");
  assert.ok(!q.url.includes(KEY), "key must not be in the URL");
  assert.equal(q.json.generationConfig.responseMimeType, "application/json");
  assert.deepEqual(q.json.generationConfig.responseSchema, { type: "OBJECT", properties: {} });
  assert.equal(q.json.systemInstruction.parts[0].text, "sys");
  await m.close();
});

test("client: failures map to codes, never throw, never contain the key", async () => {
  const cases = [
    [{ status: 403, json: { error: { message: "denied" } } }, "AUTH"],
    [{ status: 400, json: { error: { message: `API key not valid. Please pass a valid API key. (${KEY})` } } }, "AUTH"],
    [{ status: 404, json: { error: { message: "model gone" } } }, "MODEL"],
    [{ status: 400, json: { error: { message: `bad schema near ${KEY}` } } }, "BAD_REQUEST"],
    [{ json: { promptFeedback: { blockReason: "SAFETY" } } }, "BLOCKED"],
    [{ raw: JSON.stringify({ candidates: [{ content: { parts: [{ text: "not json" }] }, finishReason: "STOP" }] }) }, "BAD_RESPONSE"],
    [{ json: { candidates: [{ content: { parts: [{ text: '{"a":' }] }, finishReason: "MAX_TOKENS" }] } }, "BAD_RESPONSE"],
    [{ json: { candidates: [] } }, "BAD_RESPONSE"],
  ];
  for (const [resp, code] of cases) {
    const m = await mock(() => resp);
    const r = await createClient({ key: KEY, baseUrl: m.url, retryDelays: [] }).generate({ prompt: "x" });
    assert.equal(r.ok, false);
    assert.equal(r.code, code, JSON.stringify(r));
    assert.ok(!JSON.stringify(r).includes(KEY), `key leaked for ${code}`);
    await m.close();
  }
  const none = await createClient({ key: null }).generate({ prompt: "x" });
  assert.equal(none.code, "NO_KEY");
  const cfg = await createClient({ key: KEY, baseUrl: "http://example.com" }).generate({ prompt: "x" });
  assert.equal(cfg.code, "CONFIG");
});

test("client: retries 429 and 5xx, then succeeds or gives up", async () => {
  const m = await mock((_, n) => (n < 3 ? { status: 429, json: { error: { message: "slow down" } } } : ok({ done: true })));
  const r = await createClient({ key: KEY, baseUrl: m.url, retryDelays: [1, 1] }).generate({ prompt: "x" });
  assert.equal(r.ok, true);
  assert.equal(m.requests.length, 3);
  await m.close();
  const m2 = await mock(() => ({ status: 503, json: {} }));
  const r2 = await createClient({ key: KEY, baseUrl: m2.url, retryDelays: [1, 1] }).generate({ prompt: "x" });
  assert.deepEqual([r2.ok, r2.code, m2.requests.length], [false, "UNAVAILABLE", 3]);
  await m2.close();
  const m3 = await mock(() => ({ status: 429, json: {} }));
  const r3 = await createClient({ key: KEY, baseUrl: m3.url, retryDelays: [] }).generate({ prompt: "x" });
  assert.equal(r3.code, "QUOTA");
  await m3.close();
});

test("client: network failure and timeout are reported, not thrown", async () => {
  const dead = await mock(() => ok({}));
  const url = dead.url;
  await dead.close();
  const r = await createClient({ key: KEY, baseUrl: url, retryDelays: [] }).generate({ prompt: "x" });
  assert.deepEqual([r.ok, r.code], [false, "NETWORK"]);
  const slow = await mock(() => ({ raw: "{}" }));
  // a server that never answers within the timeout
  const hang = http.createServer(() => {});
  await new Promise((rr) => hang.listen(0, "127.0.0.1", rr));
  const t = await createClient({ key: KEY, baseUrl: `http://127.0.0.1:${hang.address().port}`, timeoutMs: 80, retryDelays: [] }).generate({ prompt: "x" });
  assert.deepEqual([t.ok, t.code], [false, "NETWORK"]);
  assert.match(t.reason, /timed out/);
  hang.closeAllConnections?.();
  await new Promise((rr) => hang.close(rr));
  await slow.close();
});

// ---- tools -----------------------------------------------------------------------------
function harness({ roots = [], respond, config } = {}) {
  const calls = [];
  const client = { generate: async (a) => { calls.push(a); return respond ? respond(a, calls.length) : { ok: true, data: { summary: "s", key_points: ["a", "b", "c"], error_groups: [], scenarios: [], findings: [] }, usage: { input: 1, output: 1 }, model: "m" }; } };
  const guard = roots.length ? createPathGuard({ allowedRoots: roots }) : null;
  return { calls, tools: createTools({ client, guard, guardError: guard ? null : "no roots", config, status: () => ({ configured: true }) }) };
}

test("tools: prompt frames content as untrusted data and masks secrets before sending", async () => {
  const h = harness();
  const r = await h.tools.summarize({ text: "deploy notes\npassword=hunter22\ncontact jane@example.com" });
  assert.equal(r.ok, true);
  assert.equal(r.input.redactions >= 2, true);
  const sent = h.calls[0];
  assert.match(sent.system, /untrusted DATA/);
  assert.match(sent.prompt, /<content source="inline text">/);
  assert.ok(!sent.prompt.includes("hunter22") && !sent.prompt.includes("jane@example.com"));
  assert.equal(r.tool, "gemini_summarize");
  assert.equal(r.model, "m");
});

test("tools: input errors and Gemini outages produce envelopes, not exceptions", async () => {
  const h = harness();
  assert.deepEqual(await h.tools.summarize({}), { ok: false, tool: "gemini_summarize", code: "NO_INPUT", reason: "provide `path` or `text`" });
  const noRoots = await h.tools.summarize({ path: "/etc/hosts" });
  assert.equal(noRoots.unavailable, true);
  assert.equal(noRoots.code, "NO_ROOTS");
  const down = harness({ respond: () => ({ ok: false, code: "AUTH", reason: "the Gemini API rejected the key" }) });
  const r = await down.tools.analyzeLogs({ text: "ERROR x" });
  assert.equal(r.ok, false);
  assert.equal(r.unavailable, true);
  assert.equal(r.code, "AUTH");
  assert.match(r.fallback, /Claude-only/);
});

test("summarize: large documents are chunked (map) and merged (reduce) within bounds", async () => {
  const text = Array.from({ length: 60 }, (_, i) => `line ${i} ${"x".repeat(40)}`).join("\n");
  const h = harness({ config: { chunkChars: 700, maxChunks: 3 } });
  const r = await h.tools.summarize({ text, max_points: 2 });
  assert.equal(r.ok, true);
  assert.equal(h.calls.length, 4, "3 chunk calls + 1 merge call");
  assert.match(h.calls[3].prompt, /merge them into a single summary/);
  assert.equal(r.input.chunks, 3);
  assert.equal(r.data.key_points.length, 2, "key_points capped to max_points");
});

test("analyze_logs: huge logs are read as head + tail (not loaded whole) and keep the most recent lines", async () => {
  const root = tmp();
  const lines = Array.from({ length: 5000 }, (_, i) => `2026-11-14 10:00:${String(i % 60).padStart(2, "0")} INFO request ${i}`);
  lines[4999] = "2026-11-14 10:59:59 ERROR NullPointerException at BillingService.java:88";
  write(path.join(root, "app.log"), lines.join("\n"));
  const h = harness({ roots: [root], config: { maxInputChars: 2000 } });
  const r = await h.tools.analyzeLogs({ path: path.join(root, "app.log"), hint: "billing failed" });
  assert.equal(r.ok, true);
  assert.equal(r.input.truncated, true);
  const p = h.calls[0].prompt;
  assert.match(p, /NullPointerException at BillingService\.java:88/);
  assert.match(p, /omitted/);
  assert.match(p, /billing failed/);
  assert.ok(p.length < 6000, `prompt too large: ${p.length}`);
});

test("explore_codebase: sandboxed, deterministic, skips vendor/binary/secret files, numbers lines", async () => {
  const root = tmp(), outside = tmp("outside-");
  write(path.join(root, "src", "A.java"), "class A {\n  void run() {}\n}\n");
  write(path.join(root, "src", "B.ts"), "export const b = 1;\n");
  write(path.join(root, "src", "node_modules", "dep.js"), "SHOULD_NOT_APPEAR");
  write(path.join(root, "src", ".env"), "SECRET_TOKEN=do-not-send-123456");
  write(path.join(root, "src", "logo.png"), "\u0000PNG");
  write(path.join(outside, "x.txt"), "outside");
  const h = harness({ roots: [root] });
  const r = await h.tools.exploreCodebase({ question: "how does A run?", paths: [path.join(root, "src"), path.join(outside, "x.txt"), path.join(root, "src", ".env")] });
  assert.equal(r.ok, true);
  const p = h.calls[0].prompt;
  assert.match(p, /=== FILE: src\/A\.java \(4 lines\) ===\n1: class A \{/);
  assert.match(p, /=== FILE: src\/B\.ts/);
  for (const bad of ["SHOULD_NOT_APPEAR", "do-not-send-123456", "outside", "PNG"]) assert.ok(!p.includes(bad), `${bad} must not be sent`);
  assert.deepEqual(r.input.files, ["src/A.java", "src/B.ts"]);
  assert.ok(r.input.skipped.denied >= 2);
  const none = await h.tools.exploreCodebase({ question: "q", paths: [path.join(outside, "x.txt")] });
  assert.equal(none.ok, false);
  assert.equal(none.code, "NO_INPUT");
  assert.equal((await h.tools.exploreCodebase({ paths: [root] })).code, "NO_INPUT");
});

test("review_diff: real git diff, validated refs, repo must be inside the roots", async () => {
  const root = tmp(), outside = tmp("outside-");
  const repo = path.join(root, "repo");
  fs.mkdirSync(repo);
  const git = (...a) => execFileSync("git", ["-C", repo, "-c", "user.name=t", "-c", "user.email=t@t.t", ...a], { stdio: "pipe" });
  git("init", "-q");
  write(path.join(repo, "Svc.java"), "class Svc { int f() { return 1; } }\n");
  git("add", "."); git("commit", "-q", "-m", "init");
  write(path.join(repo, "Svc.java"), "class Svc { int f() { return 2; } }\n");
  const h = harness({ roots: [root] });
  const r = await h.tools.reviewDiff({ repo, focus: "return values" });
  assert.equal(r.ok, true);
  assert.match(h.calls[0].prompt, /diff --git a\/Svc\.java b\/Svc\.java/);
  assert.match(h.calls[0].prompt, /\+class Svc \{ int f\(\) \{ return 2; \} \}/);
  assert.match(h.calls[0].prompt, /Focus: return values/);
  const evil = await h.tools.reviewDiff({ repo, base: "--output=/tmp/pwned" });
  assert.equal(evil.ok, false);
  assert.match(evil.reason, /invalid base ref/);
  assert.equal((await h.tools.reviewDiff({ repo: outside })).ok, false);
  assert.equal((await h.tools.reviewDiff({ repo })).ok, true);
  git("add", "."); git("commit", "-q", "-m", "second");
  const clean = await h.tools.reviewDiff({ repo });
  assert.match(clean.reason, /no changes/);
  const pasted = await h.tools.reviewDiff({ diff: "diff --git a/x b/x\n+y\n" });
  assert.equal(pasted.ok, true);
});

test("generate_tests / extract_findings: respect counts, categories and caps", async () => {
  const many = Array.from({ length: 30 }, (_, i) => ({ id: `T${i}`, title: "t", type: "edge", priority: "P1", preconditions: "", steps: [], expected: "" }));
  const h = harness({ respond: () => ({ ok: true, data: { scenarios: many, findings: many }, usage: {}, model: "m" }) });
  const t = await h.tools.generateTests({ text: "As a nurse I can cancel an appointment", framework: "JUnit 5", count: 5 });
  assert.equal(t.data.scenarios.length, 5);
  assert.match(h.calls[0].prompt, /at most 5 test scenarios/);
  assert.match(h.calls[0].prompt, /JUnit 5/);
  const d = await h.tools.generateTests({ diff: "diff --git a/x b/x\n+y" });
  assert.equal(d.ok, true);
  const f = await h.tools.extractFindings({ text: "TODO: fix billing rounding", max_findings: 3 });
  assert.equal(f.data.findings.length, 3);
  assert.match(h.calls[2].prompt, /bug, risk, todo, requirement, decision/);
  const f2 = await h.tools.extractFindings({ text: "x", categories: ["compliance"] });
  assert.match(h.calls[3].prompt, /compliance/);
});

test("status: local only, never includes the key", async () => {
  const h = harness();
  const s = await h.tools.status();
  assert.equal(s.ok, true);
  assert.equal(s.privacy.redaction, true);
  assert.ok(!JSON.stringify(s).includes(KEY));
});

test("end to end through the real client: key stays in the header only", async () => {
  const m = await mock(() => ok({ summary: "ok", key_points: [], notable: [], uncertainty: "" }));
  const client = createClient({ key: KEY, baseUrl: m.url, retryDelays: [] });
  const tools = createTools({ client, guard: null });
  const r = await tools.summarize({ text: `config token=${KEY} done` });
  assert.equal(r.ok, true);
  assert.ok(!JSON.stringify(r).includes(KEY));
  assert.ok(!m.requests[0].body.includes(KEY), "the API key appearing inside analysed text was masked too");
  await m.close();
});

// ---- the real MCP server over stdio -----------------------------------------------------
async function withServer(env, fn) {
  const transport = new StdioClientTransport({ command: process.execPath, args: [path.join(here, "..", "index.js")], env: { ...process.env, GEMINI_API_KEY: "", GOOGLE_API_KEY: "", ...env }, stderr: "ignore" });
  const client = new Client({ name: "t", version: "1" });
  await client.connect(transport);
  try { return await fn(client); } finally { await client.close(); }
}
const call = async (client, name, args = {}) => {
  const res = await client.callTool({ name, arguments: args });
  return { res, body: JSON.parse(res.content[0].text) };
};

test("mcp server: lists the 7 tools and serves them against the (mock) API", async () => {
  const m = await mock(() => ok({ summary: "mock summary", key_points: ["k"], notable: [], uncertainty: "" }));
  const root = tmp();
  await withServer({ GEMINI_API_KEY: KEY, GEMINI_BASE_URL: m.url, GEMINI_ALLOWED_ROOTS: root }, async (client) => {
    const names = (await client.listTools()).tools.map((t) => t.name).sort();
    assert.deepEqual(names, ["gemini_analyze_logs", "gemini_explore_codebase", "gemini_extract_findings", "gemini_generate_tests", "gemini_review_diff", "gemini_status", "gemini_summarize"]);
    const st = await call(client, "gemini_status");
    assert.equal(st.body.configured, true);
    assert.equal(st.body.key_source, "env:GEMINI_API_KEY");
    assert.ok(!st.res.content[0].text.includes(KEY));
    const s = await call(client, "gemini_summarize", { text: "hello" });
    assert.equal(s.body.ok, true);
    assert.equal(s.body.data.summary, "mock summary");
    assert.ok(!s.res.content[0].text.includes(KEY));
    assert.ok(!s.res.isError);
  });
  assert.equal(m.requests.length, 1);
  await m.close();
});

test("mcp server: key from the gitignored env file works; GOOGLE_API_KEY is accepted", async () => {
  const m = await mock(() => ok({ summary: "x", key_points: [], notable: [], uncertainty: "" }));
  const dir = tmp();
  const envFile = path.join(dir, ".env");
  write(envFile, `OTHER=1\nGEMINI_API_KEY=${KEY}\n`);
  await withServer({ GEMINI_ENV_FILE: envFile, GEMINI_BASE_URL: m.url }, async (client) => {
    const st = await call(client, "gemini_status");
    assert.deepEqual([st.body.configured, st.body.key_source], [true, "env file"]);
    assert.equal((await call(client, "gemini_summarize", { text: "t" })).body.ok, true);
  });
  assert.equal(m.requests[0].headers["x-goog-api-key"], KEY);
  await withServer({ GOOGLE_API_KEY: KEY, GEMINI_BASE_URL: m.url, GEMINI_ENV_FILE: path.join(dir, "missing") }, async (client) => {
    assert.equal((await call(client, "gemini_status")).body.key_source, "env:GOOGLE_API_KEY");
  });
  await m.close();
});

test("mcp server: no key or API down → graceful unavailable result, no protocol error", async () => {
  const dir = tmp();
  await withServer({ GEMINI_ENV_FILE: path.join(dir, "missing.env") }, async (client) => {
    const st = await call(client, "gemini_status");
    assert.equal(st.body.configured, false);
    const r = await call(client, "gemini_analyze_logs", { text: "ERROR boom" });
    assert.equal(r.res.isError ?? false, false);
    assert.deepEqual([r.body.ok, r.body.unavailable, r.body.code], [false, true, "NO_KEY"]);
    assert.match(r.body.fallback, /Claude-only/);
  });
  const m = await mock(() => ({ status: 403, json: { error: { message: "no" } } }));
  await withServer({ GEMINI_API_KEY: KEY, GEMINI_BASE_URL: m.url }, async (client) => {
    const r = await call(client, "gemini_summarize", { text: "x" });
    assert.deepEqual([r.body.ok, r.body.unavailable, r.body.code], [false, true, "AUTH"]);
    assert.ok(!r.res.content[0].text.includes(KEY));
  });
  await m.close();
});
