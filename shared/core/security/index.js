// Shared security primitives: canonical path guard (traversal + symlink +
// Windows quirks), sensitive-location deny-list, secret redaction, and safe
// process-spawn resolution. No dependencies; flavour (win32/posix) is
// injectable so both can be tested on one machine (mock != real Windows).
import fs from "node:fs";
import path from "node:path";

const DENY_DIRS = new Set([".ssh", ".aws", ".gnupg", ".config", ".kube", ".docker", ".azure", ".gcloud"]);
const DENY_FILES = new Set(["id_rsa", "id_ed25519", "id_ecdsa", ".npmrc", ".netrc", ".git-credentials", ".pgpass"]);
const ENV_FILE = /^\.env(\..+)?$/i;
const ENV_SAFE = /^\.env\.(example|sample|template)$/i;

export class SecurityError extends Error {
  constructor(message, code) {
    super(message);
    this.name = "SecurityError";
    this.code = code;
  }
}

function flavour(o = {}) {
  const platform = o.platform ?? process.platform;
  return {
    platform,
    p: platform === "win32" ? path.win32 : path.posix,
    exists: o.exists ?? ((f) => fs.existsSync(f)),
    realpath: o.realpath ?? ((f) => fs.realpathSync.native(f)),
    cwd: o.cwd ?? process.cwd(),
  };
}

// Canonical absolute path. Resolves `..`, then follows symlinks on the
// deepest EXISTING ancestor (so a not-yet-created file under a symlinked
// dir cannot escape), then re-appends the non-existent remainder.
export function canonicalize(input, o = {}) {
  const f = flavour(o);
  if (typeof input !== "string" || input === "") throw new SecurityError("path is required", "EMPTY");
  if (input.includes("\0")) throw new SecurityError("NUL byte in path", "NUL");
  if (f.platform === "win32") {
    if (/^\\\\[?.]\\/.test(input) || /^\/\/[?.]\//.test(input)) {
      throw new SecurityError("Windows device/extended-length paths are not allowed", "DEVICE_PATH");
    }
    const rest = input.replace(/^[A-Za-z]:/, "");
    if (rest.includes(":")) throw new SecurityError("alternate data streams are not allowed", "ADS");
  }
  let abs = f.p.normalize(f.p.isAbsolute(input) ? input : f.p.resolve(f.cwd, input));
  let cur = abs;
  const rest = [];
  while (!f.exists(cur)) {
    const parent = f.p.dirname(cur);
    if (parent === cur) break;
    rest.unshift(f.p.basename(cur));
    cur = parent;
  }
  const real = f.exists(cur) ? f.realpath(cur) : cur;
  return f.p.join(real, ...rest);
}

function isInside(root, target, f) {
  const rel = f.p.relative(root, target);
  if (rel === "") return true;
  return rel !== ".." && !rel.startsWith(".." + f.p.sep) && !f.p.isAbsolute(rel);
}

export function deniedReason(relParts) {
  for (const part of relParts) {
    const low = part.toLowerCase();
    if (DENY_DIRS.has(low)) return `sensitive directory "${part}"`;
    if (DENY_FILES.has(low)) return `sensitive file "${part}"`;
    if (ENV_FILE.test(part) && !ENV_SAFE.test(part)) return `environment file "${part}"`;
  }
  return null;
}

// createPathGuard({ allowedRoots }) -> { check(p), assert(p), roots }
// Deny-list is evaluated on the part BELOW the matched root, so a root that
// itself lives under e.g. ~/.config is not rejected wholesale.
export function createPathGuard({ allowedRoots, ...o }) {
  const f = flavour(o);
  if (!Array.isArray(allowedRoots) || allowedRoots.length === 0) {
    throw new SecurityError("no allowed roots configured (set PROJECTS_DIR / OPENCODE_BRIDGE_ALLOWED_ROOTS)", "NO_ROOTS");
  }
  const roots = allowedRoots.map((r) => {
    if (!f.exists(r)) throw new SecurityError(`allowed root does not exist: ${r}`, "ROOT_MISSING");
    return canonicalize(r, o);
  });
  function check(input) {
    let resolved;
    try {
      resolved = canonicalize(input, o);
    } catch (e) {
      return { ok: false, reason: e.message, code: e.code };
    }
    const root = roots.find((r) => isInside(r, resolved, f));
    if (!root) return { ok: false, resolved, reason: `outside allowed roots: ${roots.join(", ")}`, code: "OUTSIDE_ROOT" };
    const parts = f.p.relative(root, resolved).split(/[\\/]+/).filter(Boolean);
    const denied = deniedReason(parts);
    if (denied) return { ok: false, resolved, reason: `denied location (${denied})`, code: "DENIED" };
    return { ok: true, resolved, root };
  }
  return {
    roots,
    check,
    assert(input) {
      const r = check(input);
      if (!r.ok) throw new SecurityError(`${r.reason}${r.resolved ? `: ${r.resolved}` : ""}`, r.code);
      return r.resolved;
    },
  };
}

// ----------------------------------------------------------------- secrets
const SENSITIVE_KEY = /(token|secret|passw(or)?d|passwd|api[_-]?key|credential|auth|private[_-]?key|sasl)/i;

export function maskEnv(env) {
  const out = {};
  for (const [k, v] of Object.entries(env ?? {})) out[k] = SENSITIVE_KEY.test(k) ? "***" : v;
  return out;
}

export function redactText(text, env) {
  let t = String(text);
  for (const [k, v] of Object.entries(env ?? {})) {
    if (SENSITIVE_KEY.test(k) && typeof v === "string" && v.length >= 6) t = t.split(v).join("***");
  }
  return t;
}

// ------------------------------------------------------------ safe spawning
const SAFE_ARG = /^[\w.\-=:/\\@+,]+$/;

// Returns { command, args } safe to hand to child_process.spawn/execFile
// with shell:false. On Windows, `.cmd`/`.bat` shims can only be launched via
// cmd.exe, which re-parses arguments — so they are allowed ONLY when every
// argument is plain (no shell metacharacters). Arbitrary text (e.g. a prompt)
// must go to a real .exe / .js entry instead; we refuse rather than risk
// command injection.
export function resolveSpawn(command, args = [], { platform = process.platform, env = process.env, exists = fs.existsSync } = {}) {
  if (platform !== "win32" || !/\.(cmd|bat)$/i.test(command)) return { command, args };
  // cmd.exe /s /c strips the outer quotes, so a shim path with spaces splits. Refuse
  // instead of guessing quoting rules.
  if (/\s/.test(command)) {
    throw new SecurityError(`refusing to launch Windows .cmd shim whose path contains spaces (${command}); use the tool's .exe/.js entry instead`, "CMD_SHIM_PATH");
  }
  const bad = args.find((a) => !SAFE_ARG.test(String(a)));
  if (bad !== undefined) {
    throw new SecurityError(
      `refusing to pass non-trivial argument through Windows .cmd shim (${command}); point the tool's *_BIN setting at its .exe or .js entry`,
      "CMD_SHIM_ARGS"
    );
  }
  return { command: env.ComSpec || "cmd.exe", args: ["/d", "/s", "/c", command, ...args.map(String)] };
}
