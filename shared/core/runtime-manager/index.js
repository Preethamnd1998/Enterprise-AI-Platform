// Runtime manager: creates/validates the per-machine runtime (npm deps, Python
// venv, Code Cortex binary) and reports diagnostics. Venvs and binaries are
// NEVER copied between machines/OSes — always recreated from manifests.
// Every mutating step is a plan entry; nothing runs unless apply=true.
import { spawnSync } from "node:child_process";
import {
  inRepoKgDir, loadSettings, resolveBasePython, resolveVenvPython, resolveCodeCortex, resolveNode,
  resolveProjectsDir, resolveKgDb, venvPythonRel, which,
} from "../path-resolver/index.js";
import { loadRegistry, validateRegistry } from "../mcp-registry/index.js";
import { resolveSpawn } from "../security/index.js";

const defaultExec = (command, args, opts) => spawnSync(command, args, { encoding: "utf8", stdio: "pipe", ...opts });

// Run npm without any shell/.cmd shim: node + npm-cli.js (works with spaces in paths on
// Windows). Falls back to the `npm` on PATH if the cli script can't be located.
export function npmInvocation(ctx) {
  const node = ctx.nodeExe;
  const cands = [
    ctx.env.npm_execpath,
    ctx.p.join(ctx.p.dirname(node), "node_modules", "npm", "bin", "npm-cli.js"),
    ctx.p.join(ctx.p.dirname(node), "..", "lib", "node_modules", "npm", "bin", "npm-cli.js"),
  ].filter((c) => c && /npm-cli\.js$/.test(c));
  const cli = cands.find((c) => ctx.exists(c));
  if (cli) return { command: node, prefix: [cli] };
  return { command: which("npm", ctx).path ?? "npm", prefix: [] };
}

export function planRuntime(ctx, { withCortex = false } = {}) {
  const settings = loadSettings(ctx);
  const reg = loadRegistry(ctx);
  const steps = [];
  for (const [id, s] of Object.entries(reg.servers)) {
    if (s.dependencies?.npm) {
      const dir = ctx.p.join(ctx.repoRoot, ...s.dependencies.npm.split("/"));
      steps.push({
        id: `npm:${id}`,
        done: ctx.exists(ctx.p.join(dir, "node_modules")),
        cwd: dir,
        command: npmInvocation(ctx).command,
        args: [...npmInvocation(ctx).prefix, "install", "--no-audit", "--no-fund"],
      });
    }
  }
  const kg = inRepoKgDir(ctx, settings);
  if (!ctx.exists(ctx.p.join(kg, "mcp_server_main.py"))) {
    steps.push({ id: "kg:repo", done: false, blocked: `Knowledge Graph Generator not found at ${kg}. It is a separate repo: git clone https://git.lifetrenz.com/Preetham.ND/knowledge-graph-generator.git next to this repo (or set KNOWLEDGE_GRAPH_PATH in paths.local.env), then re-run.`, cwd: ctx.repoRoot, command: "", args: [] });
  }
  const venvDir = ctx.p.join(kg, ".venv-mcp");
  const venvPy = ctx.p.join(kg, ...venvPythonRel(ctx.platform));
  const base = resolveBasePython(ctx, settings);
  steps.push({
    id: "venv:knowledge-graph",
    done: ctx.exists(venvPy),
    cwd: kg,
    command: base.path,
    args: ["-m", "venv", venvDir],
    blocked: !ctx.exists(ctx.p.join(kg, "mcp_server_main.py")) ? "Knowledge Graph repo missing (see kg:repo)" : base.exists ? null : base.hint,
  });
  steps.push({
    id: "pip:knowledge-graph",
    done: false, // pip is idempotent; cheap to re-run
    cwd: kg,
    command: venvPy,
    args: ["-m", "pip", "install", "--quiet", "-r", "requirements-mcp.txt"],
    after: "venv:knowledge-graph",
    blocked: !ctx.exists(ctx.p.join(kg, "mcp_server_main.py")) ? "Knowledge Graph repo missing (see kg:repo)" : null,
  });
  const cc = resolveCodeCortex(ctx, settings);
  const ccDir = ctx.p.join(kg, "code-cortex");
  steps.push({
    id: "code-cortex:binary",
    done: cc.exists,
    optional: !withCortex,
    cwd: ccDir,
    command: ctx.platform === "win32" ? "powershell" : "bash",
    args: ctx.platform === "win32"
      ? ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", ctx.p.join(ccDir, "install.ps1")]
      : [ctx.p.join(ccDir, "install.sh"), "--skip-config"],
    note: "Downloads a prebuilt binary and (Windows) edits the USER PATH. Runs only with --with-cortex.",
  });
  return steps;
}

export function runRuntime(ctx, steps, { apply = false, exec = defaultExec, withCortex = false } = {}) {
  const report = [];
  for (const st of steps) {
    if (st.done) { report.push({ id: st.id, status: "skip", detail: "already satisfied" }); continue; }
    if (st.blocked) { report.push({ id: st.id, status: "blocked", detail: st.blocked }); continue; }
    if (st.optional && !withCortex) { report.push({ id: st.id, status: "manual", detail: `not run (needs --with-cortex): ${st.command} ${st.args.join(" ")}` }); continue; }
    const line = `${st.command} ${st.args.map((a) => (/\s/.test(a) ? `"${a}"` : a)).join(" ")}  (cwd ${st.cwd})`;
    if (!apply) { report.push({ id: st.id, status: "dry-run", detail: line }); continue; }
    try {
      const sp = resolveSpawn(st.command, st.args, { platform: ctx.platform, env: ctx.env, exists: ctx.exists });
      const r = exec(sp.command, sp.args, { cwd: st.cwd });
      report.push({ id: st.id, status: r.status === 0 ? "ok" : "fail", detail: r.status === 0 ? line : `exit ${r.status}: ${(r.stderr || r.error?.message || "").slice(-400)}` });
      if (r.status !== 0) break; // later steps depend on earlier ones
    } catch (e) {
      report.push({ id: st.id, status: "fail", detail: e.message });
      break;
    }
  }
  return report;
}

// ----------------------------------------------------------------- doctor
export function diagnose(ctx) {
  const settings = loadSettings(ctx);
  const checks = [];
  const add = (name, status, detail) => checks.push({ name, status, detail });
  const major = Number(process.versions.node.split(".")[0]);
  add("platform", "ok", `${ctx.platform} (node ${process.version}, sep "${ctx.p.sep}")`);
  add("node>=20", major >= 20 ? "ok" : "fail", process.version);
  const node = resolveNode(ctx, settings);
  add("node executable", node.exists ? "ok" : "fail", node.path ?? node.hint);
  const base = resolveBasePython(ctx, settings);
  add("base python", base.exists ? "ok" : "warn", base.path ? `${base.path} [${base.source}]` : base.hint);
  const kgRepo = inRepoKgDir(ctx, settings);
  add("knowledge-graph repo", ctx.exists(ctx.p.join(kgRepo, "mcp_server_main.py")) ? "ok" : "warn",
    ctx.exists(ctx.p.join(kgRepo, "mcp_server_main.py")) ? kgRepo : `not found at ${kgRepo} — clone knowledge-graph-generator next to this repo or set KNOWLEDGE_GRAPH_PATH`);
  const py = resolveVenvPython(ctx, settings);
  add("kg venv python", py.exists ? "ok" : "warn", py.path ?? `${py.tried[0]} — ${py.hint}`);
  const cc = resolveCodeCortex(ctx, settings);
  add("code-cortex binary", cc.exists ? "ok" : "warn", cc.path ? `${cc.path} [${cc.source}]` : cc.hint);
  const db = resolveKgDb(ctx, settings);
  add("knowledge graph db", db.exists ? "ok" : "warn", db.path ?? db.hint);
  const pr = resolveProjectsDir(ctx, settings);
  add("PROJECTS_DIR", pr.exists ? "ok" : "warn", pr.path ?? pr.hint);
  try {
    const reg = loadRegistry(ctx);
    const errs = validateRegistry(reg, ctx);
    add("mcp registry", errs.length ? "fail" : "ok", errs.length ? errs.join("; ") : `${Object.keys(reg.servers).length} servers valid`);
    for (const [id, s] of Object.entries(reg.servers)) {
      if (s.dependencies?.npm) {
        const nm = ctx.p.join(ctx.repoRoot, ...s.dependencies.npm.split("/"), "node_modules");
        add(`npm deps: ${id}`, ctx.exists(nm) ? "ok" : "warn", ctx.exists(nm) ? "installed" : "run npm run platform:install");
      }
    }
  } catch (e) {
    add("mcp registry", "fail", e.message);
  }
  return checks;
}
