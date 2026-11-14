// gemini-assistant — OPTIONAL MCP server that lets Claude hand large pre-processing jobs
// (big documents, logs, many files, diffs) to Google's Gemini API and get compact JSON back.
// Registered only when GEMINI_ENABLED is true (see shared/core/gemini + mcp-registry). Claude
// keeps reasoning, implementation and every final decision. If Gemini cannot be used, tools
// answer { ok:false, unavailable:true, fallback } instead of failing.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createContext, loadSettings } from "../../core/path-resolver/index.js";
import { createPathGuard } from "../../core/security/index.js";
import { detectKey, geminiStatus, DEFAULT_MODEL, DEFAULT_BASE_URL } from "../../core/gemini/index.js";
import { createClient } from "./lib/client.js";
import { createTools } from "./lib/tools.js";

const CTX = createContext({ repoRoot: path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..") });
const SETTINGS = loadSettings(CTX);
const env = process.env;
const num = (v, d) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : d);

const MODEL = SETTINGS.GEMINI_MODEL || env.GEMINI_MODEL || DEFAULT_MODEL;
const ROOTS = (env.GEMINI_ALLOWED_ROOTS || SETTINGS.GEMINI_ALLOWED_ROOTS || SETTINGS.PROJECTS_DIR || "").split(",").map((s) => s.trim()).filter(Boolean);
let GUARD = null, GUARD_ERROR = null;
try { GUARD = createPathGuard({ allowedRoots: ROOTS }); } catch (e) { GUARD_ERROR = e.message; }

// The key is looked up on every call (env first, then the gitignored env file), so adding a key
// after startup works without a restart. It is never logged or returned.
const client = {
  generate: (args) => {
    const { key } = detectKey(CTX, { settings: SETTINGS });
    return createClient({
      key, model: MODEL, baseUrl: env.GEMINI_BASE_URL || DEFAULT_BASE_URL,
      timeoutMs: num(env.GEMINI_TIMEOUT_MS, 60000), maxOutputTokens: num(env.GEMINI_MAX_OUTPUT_TOKENS, 8192),
    }).generate(args);
  },
};

const tools = createTools({
  client, guard: GUARD, guardError: GUARD_ERROR,
  config: { maxInputChars: num(env.GEMINI_MAX_INPUT_CHARS, 400_000), pii: !/^(0|false|no|off)$/i.test(env.GEMINI_REDACT_PII ?? "") },
  status: () => {
    const s = geminiStatus(CTX);
    return { enabled: true, configured: s.keyConfigured, key_source: s.keySource ? (s.keySource.startsWith("file:") ? "env file" : s.keySource) : null, model: MODEL, allowed_roots: GUARD ? GUARD.roots : [], roots_problem: GUARD_ERROR };
  },
});

const server = new McpServer(
  { name: "gemini-assistant", version: "1.0.0" },
  {
    instructions:
      "Optional Gemini helper for pre-digesting LARGE inputs (logs, long documents, many files, diffs); it returns compact JSON. " +
      "Use it for first-pass analysis only: verify any cited file:line before acting, and keep reasoning, implementation and final decisions yourself. " +
      "If a result has ok:false (unavailable), continue without it. Content is sent to Google after secret/PII masking — never send credentials or patient data on purpose.",
  },
);

const reply = (r) => ({ content: [{ type: "text", text: JSON.stringify(r) }] });
const safe = (name, fn) => async (args) => {
  try { return reply(await fn(args ?? {})); }
  catch (e) { return reply({ ok: false, tool: name, unavailable: true, code: "INTERNAL", reason: String(e.message ?? e).slice(0, 200), fallback: "continue without Gemini" }); }
};

const src = { path: z.string().optional().describe("file inside the allowed roots"), text: z.string().optional().describe("inline text (use path for large inputs)") };

server.registerTool("gemini_summarize", {
  description: "Summarise a large file/text (map-reduce for very large inputs). Returns summary, key_points, notable items.",
  inputSchema: { ...src, focus: z.string().optional(), max_points: z.number().int().min(1).max(20).default(8) },
}, safe("gemini_summarize", (a) => tools.summarize(a)));

server.registerTool("gemini_analyze_logs", {
  description: "Analyse an application log: error groups with counts, first/last seen, likely causes, checks to run. Keeps the most recent lines of huge logs.",
  inputSchema: { ...src, hint: z.string().optional().describe("what you are debugging"), max_findings: z.number().int().min(1).max(25).default(10) },
}, safe("gemini_analyze_logs", (a) => tools.analyzeLogs(a)));

server.registerTool("gemini_explore_codebase", {
  description: "Answer a question about code in given files/directories: relevant files with line ranges and call flow. You choose the paths; nothing is scanned beyond them.",
  inputSchema: { question: z.string(), paths: z.array(z.string()).min(1).max(20), max_files: z.number().int().min(1).max(80).default(40), max_chars_per_file: z.number().int().min(1000).max(60000).default(20000) },
}, safe("gemini_explore_codebase", (a) => tools.exploreCodebase(a)));

server.registerTool("gemini_review_diff", {
  description: "First-pass review of a git diff (repo + base/head/staged, or a pasted diff): risks, findings with file/line, tests to add.",
  inputSchema: { repo: z.string().optional(), base: z.string().optional(), head: z.string().optional(), staged: z.boolean().optional(), diff: z.string().optional(), focus: z.string().optional() },
}, safe("gemini_review_diff", (a) => tools.reviewDiff(a)));

server.registerTool("gemini_generate_tests", {
  description: "Draft prioritised test scenarios (steps + expected) for a file, text/requirement or diff, plus coverage gaps.",
  inputSchema: { ...src, diff: z.string().optional(), framework: z.string().optional(), count: z.number().int().min(1).max(30).default(10) },
}, safe("gemini_generate_tests", (a) => tools.generateTests(a)));

server.registerTool("gemini_extract_findings", {
  description: "Extract structured findings (bugs, risks, TODOs, requirements, decisions or your categories) with evidence, severity and confidence.",
  inputSchema: { ...src, categories: z.array(z.string()).max(12).optional(), max_findings: z.number().int().min(1).max(40).default(15) },
}, safe("gemini_extract_findings", (a) => tools.extractFindings(a)));

server.registerTool("gemini_status", {
  description: "Local check (no API call): configured?, model, allowed roots, limits. Never reveals the key.",
  inputSchema: {},
}, safe("gemini_status", () => tools.status()));

await server.connect(new StdioServerTransport());
