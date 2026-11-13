// Context Manager unit tests: ctx-meter aggregation/advisory and eap-run filtering.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const ctxDir = path.join(here, "..", "context");
const require = createRequire(import.meta.url);
const meter = require(path.join(ctxDir, "ctx-meter.cjs"));

function line(obj) { return JSON.stringify(obj) + "\n"; }
function transcript(turns, ctxPerTurn) {
  let out = "";
  for (let i = 0; i < turns; i++) {
    out += line({ type: "assistant", message: { model: "claude-test", usage: { input_tokens: 1000, cache_read_input_tokens: ctxPerTurn - 1000, cache_creation_input_tokens: 0, output_tokens: 200 },
      content: [{ type: "tool_use", id: `t${i}`, name: i % 2 ? "Bash" : "Edit", input: i % 2 ? { command: "ls" } : { file_path: `/repo/f${i}.java` } }] } });
    out += line({ type: "user", message: { content: [{ type: "tool_result", tool_use_id: `t${i}`, content: "x".repeat(4000) }] } });
  }
  return out;
}

test("ctx-meter: incremental scan aggregates usage, tools, files and tool-result size", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ctx-"));
  const tp = path.join(dir, "s.jsonl");
  fs.writeFileSync(tp, transcript(4, 50000));
  const st = meter.scan(tp, meter.freshState());
  assert.equal(st.turns, 4);
  assert.equal(st.ctx_now, 50000);
  assert.equal(st.first_ctx, 50000);
  assert.equal(st.tools.Edit, 2);
  assert.equal(st.tools.Bash, 2);
  assert.equal(Object.keys(st.files_edited).length, 2);
  assert.equal(st.tool_result_tokens_approx.Bash, 2000);
  const offset = st.offset;
  fs.appendFileSync(tp, transcript(2, 200000));
  meter.scan(tp, st);                         // only the tail is read
  assert.ok(st.offset > offset);
  assert.equal(st.turns, 6);
  assert.equal(st.ctx_now, 200000);
});

test("ctx-meter: advisory only above budget", () => {
  const st = meter.freshState();
  st.ctx_now = 120000; st.turns = 3;
  assert.equal(meter.advisory(st, 150000, "/p/.claude/checkpoints/current.md"), null);
  st.ctx_now = 180000; st.tool_result_tokens_approx = { Bash: 90000 };
  const a = meter.advisory(st, 150000, "/p/.claude/checkpoints/current.md");
  assert.match(a, /context 180k > budget 150k/);
  assert.match(a, /tool output ≈50%: Bash 90k/);
  assert.match(a, /\/compact/);
});

test("ctx-meter hook: Stop writes token record and checkpoint; prompt event is silent under budget", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ctx-"));
  const tp = path.join(dir, "s.jsonl");
  fs.writeFileSync(tp, transcript(3, 40000));
  const env = { ...process.env, USAGE_LOG_PATH: path.join(dir, "logs"), CHECKPOINT_DIR: path.join(dir, "ck"), CTX_BUDGET: "150000", CLAUDE_PROJECT_DIR: dir };
  const payload = JSON.stringify({ session_id: "abc", transcript_path: tp, cwd: dir });
  const out1 = execFileSync("node", [path.join(ctxDir, "ctx-meter.cjs"), "--event", "UserPromptSubmit"], { input: payload, env }).toString();
  assert.equal(out1, "");
  execFileSync("node", [path.join(ctxDir, "ctx-meter.cjs"), "--event", "Stop"], { input: payload, env });
  const logs = fs.readdirSync(path.join(dir, "logs")).filter((f) => f.startsWith("tokens-"));
  assert.equal(logs.length, 1);
  const rec = JSON.parse(fs.readFileSync(path.join(dir, "logs", logs[0]), "utf8").trim().split("\n").pop());
  assert.equal(rec.turns_total, 3);
  assert.equal(rec.context_now, 40000);
  const ck = fs.readFileSync(path.join(dir, "ck", "current.md"), "utf8");
  assert.match(ck, /Files edited \(2\)/);
  assert.match(ck, /agent-state:start/);
  // agent-written state survives a refresh
  fs.writeFileSync(path.join(dir, "ck", "current.md"), ck.replace("- Requirement:", "- Requirement: keep me"));
  execFileSync("node", [path.join(ctxDir, "ctx-meter.cjs"), "--event", "Stop"], { input: payload, env });
  assert.match(fs.readFileSync(path.join(dir, "ck", "current.md"), "utf8"), /Requirement: keep me/);
});

test("eap-run: keeps exit code, prints errors + tail only, logs full output", () => {
  if (process.platform === "win32") return;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "run-"));
  const script = path.join(dir, "noisy.sh");
  fs.writeFileSync(script, "#!/bin/sh\nfor i in $(seq 1 300); do echo \"INFO line $i\"; done\necho '[ERROR] Compilation failure'\necho 'Tests run: 5, Failures: 1, Errors: 0'\nexit 3\n");
  fs.chmodSync(script, 0o755);
  const r = spawnSync("bash", [path.join(ctxDir, "eap-run.sh"), "--", script], { env: { ...process.env, EAP_RUN_LOG_DIR: dir } });
  const out = r.stdout.toString();
  assert.equal(r.status, 3);
  assert.match(out, /exit=3 lines=302/);
  assert.match(out, /Compilation failure/);
  assert.ok(out.split("\n").length <= 82, `too many lines: ${out.split("\n").length}`);
  const ok = spawnSync("bash", [path.join(ctxDir, "eap-run.sh"), "--quiet-ok", "--", "echo", "fine"], { env: { ...process.env, EAP_RUN_LOG_DIR: dir } });
  assert.equal(ok.status, 0);
  assert.equal(ok.stdout.toString().split("\n").filter(Boolean).length, 1);
});
