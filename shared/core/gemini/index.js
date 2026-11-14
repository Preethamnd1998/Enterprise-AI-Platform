// gemini — helpers shared by the setup CLI (gemini:setup / gemini:status) and the optional
// gemini-assistant MCP server. Everything here is local and side-effect free unless named
// otherwise. The API key is NEVER returned in a printable form: status/detect report only
// whether a key exists, where it came from and its length.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { loadSettings } from "../path-resolver/index.js";

export const KEY_VARS = ["GEMINI_API_KEY", "GOOGLE_API_KEY"];
// A concrete model verified against the live API (2026-11-14). Not the "gemini-flash-latest" alias: that
// follows Google's newest model, which was overloaded at launch (503 / no answer within 100 s). Names do go
// stale (gemini-2.5-flash now answers 404 "no longer available to new users"), so `gemini:setup --check`
// probes with a real request and records a working replacement in GEMINI_MODEL when this one is gone.
export const DEFAULT_MODEL = "gemini-3.5-flash";
export const DEFAULT_BASE_URL = "https://generativelanguage.googleapis.com";
// Classic Google API keys are 39 chars (AIza…); newer formats may contain a "." — accept a wider but
// still injection-safe set (no whitespace, quotes, $, #, backticks, newlines) of 20–200 characters.
const KEY_CHARS = /[A-Za-z0-9._-]/;
const KEY_RE = /^[A-Za-z0-9._-]{20,200}$/;
const TRUTHY = /^(1|true|yes|on)$/i;

export const isTruthy = (v) => typeof v === "string" && TRUTHY.test(v.trim());

// KEY=VALUE lines; ignores comments/blank lines, strips `export ` and one pair of quotes.
export function parseDotenv(text) {
  const out = {};
  for (const line of String(text ?? "").split(/\r?\n/)) {
    const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (!m || m[1].startsWith("#")) continue;
    out[m[1]] = m[2].replace(/^(["'])(.*)\1$/, "$2");
  }
  return out;
}

// Where the key file lives: GEMINI_ENV_FILE (paths.env / paths.local.env / environment), else
// <platform repo>/.env — already gitignored (`.env`, `.env.*`, `!.env.example`).
export function envFilePath(ctx, settings = loadSettings(ctx)) {
  return settings.GEMINI_ENV_FILE || ctx.p.join(ctx.repoRoot, ".env");
}

// Order: GEMINI_API_KEY env, GOOGLE_API_KEY env, then the same two names in the env file.
export function detectKey(ctx, { env = ctx.env, settings = loadSettings(ctx) } = {}) {
  for (const v of KEY_VARS) if (env[v]?.trim()) return { key: env[v].trim(), source: `env:${v}` };
  const file = envFilePath(ctx, settings);
  try {
    const parsed = parseDotenv(fs.readFileSync(file, "utf8"));
    for (const v of KEY_VARS) if (parsed[v]?.trim()) return { key: parsed[v].trim(), source: `file:${file}` };
  } catch { /* no file */ }
  return { key: null, source: null };
}

// Cleans what people actually paste: terminal escape sequences (bracketed-paste markers, arrow
// keys), zero-width characters, surrounding quotes, an `export GEMINI_API_KEY=` prefix, spaces.
export function normalizeKeyInput(raw) {
  let s = String(raw ?? "");
  s = s.replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, "").replace(/\u001b/g, "");
  s = s.replace(/[\u200B-\u200D\u2060\uFEFF]/g, "").trim();
  s = s.replace(/^\[200~/, "").replace(/\[201~$/, ""); // bracketed-paste markers whose ESC byte was already lost
  s = s.replace(/^(?:export\s+)?(?:GEMINI_API_KEY|GOOGLE_API_KEY)\s*=\s*/i, "");
  s = s.replace(/^["'`\u2018\u2019\u201C\u201D]+|["'`\u2018\u2019\u201C\u201D]+$/g, "").trim();
  return s;
}

// Why a key was refused — describes length and unsupported characters by Unicode code point only,
// so the explanation can be shown without revealing any part of the key.
export function explainKeyProblem(key) {
  if (!key) return "nothing was received — the paste may not have reached the prompt";
  if (key.length < 20) return `only ${key.length} characters were received (a key is normally about 39) — the paste may have been cut off`;
  if (key.length > 200) return `${key.length} characters were received — too long to be a key; copy only the key itself`;
  const bad = [...new Set([...key].filter((c) => !KEY_CHARS.test(c)))];
  if (bad.length) return `it contains ${bad.length} unsupported character${bad.length > 1 ? "s" : ""} (${bad.slice(0, 6).map((c) => `U+${c.codePointAt(0).toString(16).toUpperCase().padStart(4, "0")}`).join(", ")}) — copy the key again without spaces or quotes`;
  return null;
}

// The only printable description of a key.
export const describeKey = (key) => (key ? `set (${key.length} chars, not displayed)` : "not set");

// Base URL: https anywhere, plain http only for localhost (tests / local proxies) — the key is
// sent to this host, so anything else is refused.
export function validateBaseUrl(url) {
  let u;
  try { u = new URL(url); } catch { throw new Error(`GEMINI_BASE_URL is not a valid URL`); }
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname);
  if (u.protocol !== "https:" && !(u.protocol === "http:" && local)) throw new Error("GEMINI_BASE_URL must be https (http only for localhost)");
  return url.replace(/\/+$/, "");
}

export function geminiStatus(ctx, { env = ctx.env } = {}) {
  const settings = loadSettings(ctx);
  const det = detectKey(ctx, { env, settings });
  const file = envFilePath(ctx, settings);
  return {
    enabled: isTruthy(settings.GEMINI_ENABLED),
    model: settings.GEMINI_MODEL || env.GEMINI_MODEL || DEFAULT_MODEL,
    keyConfigured: !!det.key,
    keySource: det.source,
    keyDescription: describeKey(det.key),
    envFile: file,
    envFileExists: fs.existsSync(file),
    allowedRoots: (settings.GEMINI_ALLOWED_ROOTS || settings.PROJECTS_DIR || "").split(",").map((s) => s.trim()).filter(Boolean),
  };
}

// Upsert KEY=VALUE in a simple env-style file: an existing line is replaced IN PLACE (position,
// comments and every other line are kept; duplicates are dropped), otherwise the line is appended.
// value === null removes the key.
function upsertLine(file, key, value, { mode } = {}) {
  const lines = fs.existsSync(file) ? fs.readFileSync(file, "utf8").split(/\r?\n/) : [];
  while (lines.length && lines[lines.length - 1] === "") lines.pop();
  const re = new RegExp(`^\\s*(export\\s+)?${key}\\s*=`);
  const out = [];
  let done = false;
  for (const l of lines) {
    if (!re.test(l)) { out.push(l); continue; }
    if (!done && value !== null) { out.push(`${key}=${value}`); done = true; }
  }
  if (!done && value !== null) out.push(`${key}=${value}`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, out.length ? out.join("\n") + "\n" : "", mode ? { mode } : undefined);
  if (mode) { try { fs.chmodSync(file, mode); } catch { /* windows */ } }
}

// Writes the key to the local env file with owner-only permissions. Refuses anything that is
// not a plain token so a pasted value can never inject extra lines or shell syntax.
export function saveKey(file, key) {
  if (!KEY_RE.test(key ?? "")) throw new Error(`that does not look like a Gemini API key: ${explainKeyProblem(key)}`);
  upsertLine(file, "GEMINI_API_KEY", key, { mode: 0o600 });
  return file;
}
export function forgetKey(file) {
  if (fs.existsSync(file)) upsertLine(file, "GEMINI_API_KEY", null, { mode: 0o600 });
}

// paths.local.env is machine-local and gitignored; paths.env is tracked, so never written here.
export function setSetting(ctx, name, value) {
  const file = ctx.p.join(ctx.repoRoot, "paths.local.env");
  upsertLine(file, name, value);
  return file;
}

// true / false / null (not a git checkout or git missing)
export function isGitIgnored(ctx, file) {
  try {
    execFileSync("git", ["check-ignore", "-q", file], { cwd: ctx.repoRoot, stdio: "ignore" });
    return true;
  } catch (e) {
    return e.status === 1 ? false : null;
  }
}

// Reads a secret from a TTY without echo (raw mode). Rejects when stdin is not a terminal.
export function promptHidden(question, { input = process.stdin, output = process.stderr } = {}) {
  return new Promise((resolve, reject) => {
    if (!input.isTTY) return reject(new Error("stdin is not a terminal"));
    output.write(question);
    let value = "";
    const wasRaw = input.isRaw;
    input.setRawMode(true);
    input.resume();
    input.setEncoding("utf8");
    const finish = (err) => {
      input.removeListener("data", onData);
      input.setRawMode(!!wasRaw);
      input.pause();
      output.write("\n");
      err ? reject(err) : resolve(value.trim());
    };
    const onData = (chunk) => {
      // drop terminal escape sequences (bracketed-paste markers, arrow keys) instead of keeping them as key text
      for (const ch of String(chunk).replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, "").replace(/\u001bO./g, "")) {
        if (ch === "\r" || ch === "\n" || ch === "\u0004") return finish();
        if (ch === "\u0003") return finish(new Error("cancelled"));
        if (ch === "\u007f" || ch === "\b") { value = value.slice(0, -1); continue; }
        if (ch >= " ") value += ch;
      }
    };
    input.on("data", onData);
  });
}

// Credential + model check with a REAL tiny generation request. (A metadata GET is not enough: Google
// still lists retired models and answers 200 for them, while generateContent returns 404.)
// 503/429/timeouts mean the key was accepted but the service is busy or slow (a tiny request currently takes
// 20–30 s) — reported, not treated as a bad key. Only a 404 triggers a model switch.
export async function checkApi({ key, model = DEFAULT_MODEL, baseUrl = DEFAULT_BASE_URL, fetchImpl = fetch, timeoutMs = 60000 } = {}) {
  if (!key) return { ok: false, code: "NO_KEY", reason: "no API key configured" };
  try {
    const url = `${validateBaseUrl(baseUrl)}/v1beta/models/${encodeURIComponent(model)}:generateContent`;
    const res = await fetchImpl(url, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: "Reply with {}" }] }], generationConfig: { maxOutputTokens: 64, responseMimeType: "application/json" } }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (res.ok) return { ok: true, status: res.status, model };
    let msg = "";
    try { msg = (await res.json())?.error?.message ?? ""; } catch { /* non-JSON */ }
    const s = res.status;
    if (s === 404) {
      const hint = /use models\/([A-Za-z0-9._-]+)/.exec(msg)?.[1] ?? null;
      return { ok: false, status: s, code: "MODEL", suggestion: hint, reason: `model "${model}" is not available to your key${hint ? ` (Google suggests ${hint})` : ""}` };
    }
    if (s === 401 || s === 403 || (s === 400 && /api key/i.test(msg))) return { ok: false, status: s, code: "AUTH", reason: "the API rejected the key" };
    if (s === 429) return { ok: false, status: s, code: "QUOTA", reason: "quota or rate limit reached" };
    if (s >= 500) return { ok: false, status: s, code: "UNAVAILABLE", reason: `Google reports the service busy (HTTP ${s})` };
    return { ok: false, status: s, code: "HTTP", reason: `HTTP ${s}` };
  } catch (e) {
    return { ok: false, code: "NETWORK", reason: String(e.message ?? e).split(key).join("***") };
  }
}

// Stable Flash models the key can generate with, newest first (gemini-3.8-flash before gemini-3.5-flash).
// Previews, lite/image/tts/live variants and dated snapshots are excluded.
export async function candidateModels({ key, baseUrl = DEFAULT_BASE_URL, fetchImpl = fetch, timeoutMs = 20000 } = {}) {
  try {
    const res = await fetchImpl(`${validateBaseUrl(baseUrl)}/v1beta/models?pageSize=200`, { headers: { "x-goog-api-key": key }, signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return [];
    const re = /^gemini-(\d+(?:\.\d+)?)-flash$/;
    return ((await res.json()).models ?? [])
      .filter((m) => (m.supportedGenerationMethods ?? []).includes("generateContent"))
      .map((m) => String(m.name).replace(/^models\//, ""))
      .filter((n) => re.test(n))
      .sort((a, b) => parseFloat(re.exec(b)[1]) - parseFloat(re.exec(a)[1]));
  } catch { return []; }
}
