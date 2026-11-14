// input.js — everything that reads local data for the tools. All file access goes through the
// platform's path guard (allowed roots + deny-list for .env/.ssh/keys), reads are size-bounded,
// directory walks are depth/count-bounded and deterministic (sorted), and git is run with
// execFile (no shell) with validated ref names.
import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "build", "target", "coverage", ".venv", ".venv-mcp", "__pycache__", ".idea", ".vscode", ".gradle", ".angular", "out"]);
const BINARY_EXT = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".pdf", ".zip", ".gz", ".tgz", ".jar", ".war", ".class", ".exe", ".dll", ".so", ".dylib", ".bin", ".woff", ".woff2", ".ttf", ".eot", ".mp3", ".mp4", ".mov", ".xlsx", ".docx", ".pptx", ".db", ".sqlite"]);
const MAX_FILE_BYTES = 1_000_000;

const fail = (reason) => ({ ok: false, reason });

// Reads a (possibly huge) text file. When it is much larger than maxChars only the head and
// the tail are read (bias = fraction kept from the head) so a 2 GB log never fills memory.
export function readText(guard, p, { maxChars, headFraction = 0.5 }) {
  const g = guard.check(p);
  if (!g.ok) return fail(g.reason);
  let st;
  try { st = fs.statSync(g.resolved); } catch (e) { return fail(`cannot read ${p}: ${e.code ?? e.message}`); }
  if (!st.isFile()) return fail(`not a file: ${p}`);
  const ext = path.extname(g.resolved).toLowerCase();
  if (BINARY_EXT.has(ext)) return fail(`binary file type ${ext} is not supported`);
  const fd = fs.openSync(g.resolved, "r");
  try {
    let text, omitted = 0;
    if (st.size <= maxChars * 3) {
      text = fs.readFileSync(g.resolved, "utf8");
    } else {
      const headBytes = Math.floor(maxChars * headFraction);
      const tailBytes = maxChars - headBytes;
      const head = Buffer.alloc(headBytes), tail = Buffer.alloc(tailBytes);
      fs.readSync(fd, head, 0, headBytes, 0);
      fs.readSync(fd, tail, 0, tailBytes, Math.max(0, st.size - tailBytes));
      omitted = st.size - headBytes - tailBytes;
      text = head.toString("utf8") + `\n…[${omitted} bytes omitted]…\n` + tail.toString("utf8");
    }
    if (text.includes("\u0000")) return fail("file looks binary (NUL bytes)");
    const r = truncate(text, maxChars, headFraction);
    return { ok: true, text: r.text, truncated: omitted > 0 || r.truncated, omitted: omitted + r.omitted, label: g.resolved, bytes: st.size };
  } finally { fs.closeSync(fd); }
}

// Keeps head + tail of an over-long string, marks the gap.
export function truncate(text, maxChars, headFraction = 0.5) {
  if (text.length <= maxChars) return { text, truncated: false, omitted: 0 };
  const head = Math.floor(maxChars * headFraction);
  const tail = maxChars - head;
  const omitted = text.length - head - tail;
  return { text: `${text.slice(0, head)}\n…[${omitted} characters omitted]…\n${text.slice(text.length - tail)}`, truncated: true, omitted };
}

// Splits on line boundaries into chunks of at most `size` characters.
export function chunkLines(text, size) {
  const chunks = [];
  let cur = [], len = 0;
  for (const line of text.split("\n")) {
    if (len + line.length + 1 > size && cur.length) { chunks.push(cur.join("\n")); cur = []; len = 0; }
    cur.push(line); len += line.length + 1;
  }
  if (cur.length) chunks.push(cur.join("\n"));
  return chunks;
}

const numbered = (text) => text.split("\n").map((l, i) => `${i + 1}: ${l}`).join("\n");

// Walks the given files/directories (depth ≤ 4, sorted, skipping build/vendor/binary/denied
// paths) and returns numbered file contents for citation. Bounded by maxFiles / maxCharsPerFile.
export function collectFiles(guard, paths, { maxFiles = 40, maxCharsPerFile = 20000 } = {}) {
  const files = [];
  const skipped = { denied: 0, binary: 0, large: 0, limit: 0, missing: 0 };
  const notes = [];
  const add = (abs, root) => {
    if (files.length >= maxFiles) { skipped.limit += 1; return; }
    const g = guard.check(abs);
    if (!g.ok) { skipped.denied += 1; return; }
    const ext = path.extname(abs).toLowerCase();
    if (BINARY_EXT.has(ext)) { skipped.binary += 1; return; }
    let st;
    try { st = fs.statSync(abs); } catch { skipped.missing += 1; return; }
    if (st.size > MAX_FILE_BYTES) { skipped.large += 1; return; }
    let text;
    try { text = fs.readFileSync(abs, "utf8"); } catch { skipped.missing += 1; return; }
    if (text.includes("\u0000")) { skipped.binary += 1; return; }
    const t = truncate(text, maxCharsPerFile, 0.7);
    files.push({ path: path.relative(root, abs) || path.basename(abs), lines: text.split("\n").length, truncated: t.truncated, text: numbered(t.text) });
  };
  const walk = (dir, root, depth) => {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const e of entries) {
      const abs = path.join(dir, e.name);
      if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name) && !e.name.startsWith(".") && depth < 4) walk(abs, root, depth + 1); }
      else if (e.isFile()) add(abs, root);
    }
  };
  for (const p of paths) {
    const g = guard.check(p);
    if (!g.ok) { skipped.denied += 1; notes.push(`${p}: ${g.reason}`); continue; }
    let st;
    try { st = fs.statSync(g.resolved); } catch { skipped.missing += 1; notes.push(`${p}: not found`); continue; }
    if (st.isDirectory()) walk(g.resolved, g.root, 0); else add(g.resolved, g.root);
  }
  return { files, skipped, notes };
}

const REF_RE = /^[A-Za-z0-9._/@^~-]+$/;

// git diff of a repository inside the allowed roots. Refs are validated (no option injection).
export async function gitDiff(guard, { repo, base, head, staged }, { maxBuffer = 20 * 1024 * 1024 } = {}) {
  const g = guard.check(repo);
  if (!g.ok) return fail(g.reason);
  for (const [name, ref] of [["base", base], ["head", head]]) {
    if (ref !== undefined && (!REF_RE.test(ref) || ref.startsWith("-"))) return fail(`invalid ${name} ref`);
  }
  const args = ["-C", g.resolved, "diff", "--no-color", "--unified=3"];
  if (staged) args.push("--staged");
  if (base && head) args.push(`${base}...${head}`);
  else if (base) args.push(base);
  args.push("--");
  try {
    const { stdout } = await execFileAsync("git", args, { maxBuffer, timeout: 30000 });
    if (!stdout.trim()) return fail("no changes found for that selection");
    return { ok: true, text: stdout, label: `${g.resolved} (${staged ? "staged" : base ? `${base}${head ? `...${head}` : ""}` : "working tree"})` };
  } catch (e) {
    return fail(`git diff failed: ${String(e.stderr ?? e.message).split("\n")[0].slice(0, 200)}`);
  }
}
