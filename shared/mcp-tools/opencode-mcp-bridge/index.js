import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { execFile, spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { createContext, loadSettings, which } from "../../core/path-resolver/index.js";
import { createPathGuard, resolveSpawn } from "../../core/security/index.js";

const execFileAsync = promisify(execFile);

// Roots: OPENCODE_BRIDGE_ALLOWED_ROOTS, else PROJECTS_DIR (paths.env /
// paths.local.env). No default personal path; startup does not crash if
// unset — every call then fails with a clear message instead.
const CTX = createContext({ repoRoot: path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..") });
const SETTINGS = loadSettings(CTX);
const ROOT_LIST = (process.env.OPENCODE_BRIDGE_ALLOWED_ROOTS || SETTINGS.PROJECTS_DIR || "")
  .split(",")
  .map((p) => p.trim())
  .filter(Boolean);
let GUARD = null;
let GUARD_ERROR = null;
try {
  GUARD = createPathGuard({ allowedRoots: ROOT_LIST });
} catch (e) {
  GUARD_ERROR = e.message;
}
const ALLOWED_ROOTS = GUARD ? GUARD.roots : [];

// opencode executable: explicit override first, else PATH lookup. On Windows
// the npm shim is opencode.cmd, which cannot safely receive arbitrary prompt
// text — resolveSpawn() refuses that; set OPENCODE_BRIDGE_BIN to the .exe.
function opencodeBin() {
  return process.env.OPENCODE_BRIDGE_BIN || which("opencode", CTX).path || "opencode";
}

const AGENTS = {
  implement: process.env.OPENCODE_BRIDGE_IMPLEMENT_AGENT || "code-implementer",
  investigate: process.env.OPENCODE_BRIDGE_INVESTIGATE_AGENT || "bug-investigator",
};

const RUN_TIMEOUT_MS = Number(process.env.OPENCODE_BRIDGE_TIMEOUT_MS || 600000);
const MAX_OUTPUT_CHARS = 8000;

// Tried in order. "default" = omit -m (let opencode pick its configured default).
// Free opencode/* and google/* models observed via `opencode models` on this machine —
// adjust with OPENCODE_BRIDGE_MODEL_CHAIN if the free catalog changes.
const MODEL_CHAIN = (
  process.env.OPENCODE_BRIDGE_MODEL_CHAIN ||
  "default,opencode/big-pickle,opencode/nemotron-3.5-lightning-free,opencode/mimo-v2.5-free,opencode/nemotron-3-ultra-free,opencode/ling-3.0-flash-fin-free"
)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const RATE_LIMIT_PATTERN = /rate.?limit|quota|429|resource_exhausted|too many requests/i;

function resolveWorkspacePath(projectPath) {
  if (!projectPath || typeof projectPath !== "string") {
    throw new Error("projectPath is required");
  }
  if (!GUARD) throw new Error(`no approved workspace roots: ${GUARD_ERROR}`);
  return GUARD.assert(projectPath);
}

async function gitStatusPorcelain(cwd) {
  try {
    const { stdout } = await execFileAsync("git", ["status", "--porcelain"], { cwd });
    return stdout.trim();
  } catch {
    return null;
  }
}

function tail(text, maxChars) {
  if (!text || text.length <= maxChars) return text;
  return `...[truncated]...\n${text.slice(-maxChars)}`;
}

// Must use spawn with stdin explicitly ignored, not execFile: execFile leaves
// the child's stdin as an open, never-closed pipe, and `opencode run` blocks
// forever waiting on it when there's no real TTY attached (verified: hangs
// past any timeout under execFile, completes in ~20-30s under spawn+ignore).
function runOpenCode(args, timeoutMs) {
  return new Promise((resolve, reject) => {
    const sp = resolveSpawn(opencodeBin(), args);
    const child = spawn(sp.command, sp.args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, timeoutMs);

    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (timedOut) {
        reject(Object.assign(new Error(`opencode run timed out after ${timeoutMs}ms`), { stdout, stderr }));
      } else if (code !== 0) {
        reject(Object.assign(new Error(`opencode exited with code ${code}`), { stdout, stderr }));
      } else {
        resolve({ stdout, stderr });
      }
    });
  });
}

const server = new McpServer({ name: "opencode-bridge", version: "1.0.0" });

server.registerTool(
  "opencode_health",
  {
    description:
      "Check that the opencode CLI is installed and reachable. Call this before opencode_run.",
    inputSchema: {},
  },
  async () => {
    try {
      const sp = resolveSpawn(opencodeBin(), ["--version"]);
      const { stdout } = await execFileAsync(sp.command, sp.args);
      return {
        content: [
          {
            type: "text",
            text:
              `opencode ok, version ${stdout.trim()}\n` +
              `agents: implement=${AGENTS.implement}, investigate=${AGENTS.investigate}\n` +
              `model chain (tried in order until one isn't rate-limited): ${MODEL_CHAIN.join(" -> ")}\n` +
              `allowed roots: ${ALLOWED_ROOTS.join(", ") || `NONE (${GUARD_ERROR})`}`,
          },
        ],
      };
    } catch (err) {
      return {
        content: [{ type: "text", text: `opencode not reachable: ${err.message}` }],
        isError: true,
      };
    }
  }
);

server.registerTool(
  "opencode_run",
  {
    description:
      "Delegate a task to OpenCode inside an approved project directory, running against free cloud models only. " +
      "mode=implement can read/edit/run tests/builds but is permission-blocked from git commit/push/reset. " +
      "mode=investigate is read-only (edit tool denied) — use it for root-cause/diagnosis tasks that must not touch files. " +
      "Tries multiple free models in order, moving to the next only on a rate-limit/quota response. " +
      "Review the returned diff yourself before committing anything.",
    inputSchema: {
      projectPath: z
        .string()
        .describe("Absolute path to the project directory OpenCode should run in. Must be inside an approved workspace root."),
      prompt: z.string().describe("The precise, narrow task instruction for OpenCode to carry out."),
      mode: z
        .enum(["implement", "investigate"])
        .default("implement")
        .describe("implement = can edit files/run tests (no commit/push). investigate = read-only diagnosis, cannot edit."),
    },
  },
  async ({ projectPath, prompt, mode }) => {
    let resolved;
    try {
      resolved = resolveWorkspacePath(projectPath);
    } catch (err) {
      return { content: [{ type: "text", text: err.message }], isError: true };
    }

    const agent = AGENTS[mode] || AGENTS.implement;
    const before = await gitStatusPorcelain(resolved);
    const attempts = [];

    for (const model of MODEL_CHAIN) {
      const args = ["run", "--pure", "--agent", agent, "--dir", resolved];
      if (model !== "default") args.push("-m", model);
      args.push(prompt);

      try {
        const { stdout, stderr } = await runOpenCode(args, RUN_TIMEOUT_MS);
        const after = await gitStatusPorcelain(resolved);

        const summary = [
          `--- model used: ${model} (attempts before this: ${attempts.join(", ") || "none"}) ---`,
          `--- opencode output ---`,
          tail(stdout, MAX_OUTPUT_CHARS),
          stderr ? `--- stderr ---\n${tail(stderr, 2000)}` : "",
          `--- git status before ---\n${before || "(clean)"}`,
          `--- git status after ---\n${after || "(clean)"}`,
        ]
          .filter(Boolean)
          .join("\n\n");

        return { content: [{ type: "text", text: summary }] };
      } catch (err) {
        const combined = `${err.message}\n${err.stdout || ""}\n${err.stderr || ""}`;
        attempts.push(model);
        if (RATE_LIMIT_PATTERN.test(combined) && model !== MODEL_CHAIN[MODEL_CHAIN.length - 1]) {
          continue; // next model in chain
        }
        const after = await gitStatusPorcelain(resolved);
        return {
          content: [
            {
              type: "text",
              text:
                `opencode run failed on model "${model}" (tried: ${attempts.join(", ")}): ${err.message}\n\n` +
                `--- git status after (may be partial) ---\n${after || "(clean)"}`,
            },
          ],
          isError: true,
        };
      }
    }
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
