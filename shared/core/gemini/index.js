// gemini — helpers shared by the setup CLI (gemini:setup / gemini:status) and the optional
// gemini-assistant MCP server. Everything here is local and side-effect free unless named
// otherwise. The API key is NEVER returned in a printable form: status/detect report only
// whether a key exists, where it came from and its length.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { loadSettings } from "../path-resolver/index.js";

export const KEY_VARS = ["GEMINI_API_KEY", "GOOGLE_API_KEY"];
export const DEFAULT_MODEL = "gemini-2.5-flash";
export const DEFAULT_BASE_URL = "https://generativelanguage.googleapis.com";
// Google API keys are 39 chars (AIza…); accept a wider, injection-safe range.
const KEY_RE = /^[A-Za-z0-9_-]{20,200}$/;
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
  if (!KEY_RE.test(key ?? "")) throw new Error("that does not look like a Gemini API key (expected 20–200 characters: letters, digits, _ or -)");
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
      for (const ch of chunk) {
        if (ch === "\r" || ch === "\n" || ch === "\u0004") return finish();
        if (ch === "\u0003") return finish(new Error("cancelled"));
        if (ch === "\u007f" || ch === "\b") { value = value.slice(0, -1); continue; }
        if (ch >= " ") value += ch;
      }
    };
    input.on("data", onData);
  });
}

// Cheap connectivity/credential check: GET the model metadata (no tokens consumed).
export async function checkApi({ key, model = DEFAULT_MODEL, baseUrl = DEFAULT_BASE_URL, fetchImpl = fetch, timeoutMs = 15000 } = {}) {
  if (!key) return { ok: false, code: "NO_KEY", reason: "no API key configured" };
  try {
    const url = `${validateBaseUrl(baseUrl)}/v1beta/models/${encodeURIComponent(model)}`;
    const res = await fetchImpl(url, { headers: { "x-goog-api-key": key }, signal: AbortSignal.timeout(timeoutMs) });
    if (res.ok) return { ok: true, status: res.status, model };
    const code = res.status === 404 ? "MODEL" : res.status === 429 ? "QUOTA" : res.status === 400 || res.status === 401 || res.status === 403 ? "AUTH" : "HTTP";
    return { ok: false, status: res.status, code, reason: code === "MODEL" ? `model "${model}" not found — set GEMINI_MODEL to a model your key can use` : code === "AUTH" ? "the API rejected the key" : code === "QUOTA" ? "quota or rate limit reached" : `HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, code: "NETWORK", reason: String(e.message ?? e).split(key).join("***") };
  }
}
