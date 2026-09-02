# AI Loop Implementation Report

**Date:** 2026-09-02
**Scope:** `autonomous-runner/` (new, isolated package). No existing platform file was modified.
**Addendum 1 (same date):** Resume-from-crash / restart support — see §16.
**Addendum 2 (same date):** Real end-to-end live validation with authenticated credentials —
see §17 at the end of this report. This is the first session in which a genuine live model
round trip, including a real `SUCCESS`, was actually observed and independently verified.

---

## 1. Executive Summary

The request was to convert `/dev` into an autonomous AI Agent Loop. Phase 1 of this work
established that `enterprise-ai-platform` has **no application runtime** — it is a Markdown
prompt/contract distribution platform (`shared/commands/*.md`) with thin adapters for Claude
Code, Copilot, OpenCode, and Antigravity, plus three small Node hook scripts (`audit.js`,
`hash-check.js`, `usage-logger.js`). `/dev` (`shared/commands/dev.md`) is a **behavioral
specification** an LLM session reads and follows; there is no `LoopController` class, no
`LoopState` interface, and no orchestrator anywhere to convert, because nothing executes that
code today.

This was put to the user directly, with two options: rewrite `dev.md` as a more explicit prompt
spec (no new code, preserves the pure-prompt architecture), or build a genuinely new standalone
application that gives `/dev`'s workflow a real, code-level bounded loop. **The user chose the
second option explicitly**, with the constraint that it live entirely inside this repository
under `autonomous-runner/`, touch nothing else, and be portable to other developers' machines.

What was built: `autonomous-runner/`, a Node.js/TypeScript CLI (`ai-runner dev --repo <path>
--task <path>`) built on the real `@anthropic-ai/claude-agent-sdk` (installed, version-pinned,
and typechecked against its actual shipped `.d.ts` files — not guessed from memory). It
implements a real, bounded `Analyze -> Plan -> Execute -> Validate -> Fix` state machine with a
persisted `LoopState`, a hard separation between the Worker (makes changes) and the Validator
(a real build/test run plus a separate, read-only LLM review — never the Worker grading its own
work), a `canUseTool`-based safety gate that unconditionally denies destructive Git/SQL/Mongo/
publish/deploy operations, and a JSONL audit trail. It reuses the platform's own
`shared/contract.md` kernel, `shared/commands/dev.md`, `shared/standards/*`, `shared/rules/*`,
and a target repo's `.mcp.json` convention rather than re-describing any of that.

34 unit tests pass (including one real bug the test suite caught and a fix verified — see §10),
the package typechecks cleanly, builds cleanly, and the CLI was smoke-tested end-to-end against
a real fixture Git repository for every path that doesn't require a live model call. **No live
Claude Agent SDK call was made** — this sandboxed environment has no `ANTHROPIC_API_KEY` and no
`ant` CLI session — so the actual Worker/Validator model round trip is unverified beyond a clean
compile against the SDK's real type definitions. This is reported honestly in §12, not glossed
over.

---

## 2. Existing Architecture (`/dev` before this work)

```text
Engineer types /dev file=PLAN.md
  |
  v
Claude Code / Copilot / OpenCode / Antigravity session reads shared/commands/dev.md
  (installed per-adapter by adapters/*/install.ps1)
  |
  v
The LLM session itself follows dev.md's prose instructions:
  Phase 1 (Discovery & Analysis, read-only)
    -> resolve task file, lazy-load shared/standards/*, shared/rules/*
  Approval Gate (shared/contract.md §14) — STOP, ask "Approve implementation?"
    (skippable with auto=true)
  Execution Phase
    -> implement each TASK in sequence
    -> validate completeness (contract §7) + regression (contract §8) per task
    -> "Retry a simple, isolated failure automatically — maximum 3 attempts"
    -> Git stays read-only; never commit/push/merge
  Output: analysis blocks + Execution Summary (contract §13)
```

There is no code here — every box above is prose the model reads and (hopefully) follows inside
whatever host CLI is running it. `/dev` already had real bones of a loop (a retry cap, two
validation gates, a budget ceiling of ≤40 files/≤40k tokens) — it just had no persisted state,
no enforced iteration ceiling independent of the host session, and no separate validator that
isn't the same model session grading itself.

---

## 3. New Architecture

`autonomous-runner/` adds a second, parallel way to run the same workflow — unattended, as its
own OS process, with a real state machine instead of prose:

```text
$ ai-runner dev --repo <target> --task PLAN.md
  |
  v
cli.ts  — parse args, validate repo/task, dirty-tree check, confirmation gate
  |
  v
contextLoader.ts — reuse shared/contract.md kernel, shared/commands/dev.md,
                    shared/standards/*, shared/rules/*, target repo's .mcp.json
  |
  v
loopController.ts — bounded state machine
  |
  |   status: PLANNING
  |   -> analyzeAndPlan()  [worker.ts -> Claude Agent SDK query(), read-only tools]
  |
  |   status: RUNNING          iteration = 1..maxIterations
  |   -> execute() / fix()  [worker.ts -> query(), full tool access, canUseTool-gated]
  |
  |   status: VALIDATING
  |   -> validate()  [validator.ts]
  |        - real build command (Maven/Gradle/npm, detected from the repo)
  |        - real test command
  |        - SEPARATE read-only LLM review (structured JSON output)
  |
  |   PASS ────────────────────────────────────────→ status: SUCCESS, stop
  |     |
  |   FAIL
  |     |-- buildAttempts >= maxBuildAttempts, or
  |     |   testAttempts  >= maxTestAttempts        → status: FAILED, stop
  |     |-- else, iteration < maxIterations          → loop (Fix phase, iteration+1)
  |     |-- iteration == maxIterations                → status: MAX_ITERATIONS, stop
  v
Final report: status, iterations, model/tool calls, cost, files changed, state/audit paths
```

Every exit is one of exactly three terminal statuses (`SUCCESS`, `FAILED`, `MAX_ITERATIONS`) —
there is no code path that loops without bound (verified by `test/loopController.test.ts`, which
drives the controller with a Worker/Validator that always fails and asserts the iteration count
never exceeds the configured cap).

---

## 4. Files Changed

Nothing outside `autonomous-runner/` was created or modified — `git status --porcelain` at the
platform root shows a single new, untracked directory. All 23 files below are new:

| File | Why |
| --- | --- |
| `package.json`, `tsconfig.json`, `vitest.config.ts` | Package scaffold: build (`tsc`), dev run (`tsx`), test (`vitest`) |
| `.gitignore` | Overrides the platform root's blanket `package-lock.json` ignore (`!package-lock.json`) so this package's installs stay reproducible; ignores `dist/`, runtime state, `.env` |
| `.env.example` | Documented, safe-to-commit template for `ANTHROPIC_API_KEY` and optional overrides |
| `README.md` | Install/config/usage/architecture/safety/testing docs (see §6 of the original request) |
| `src/types.ts` | `LoopState`, `RunnerConfig`, `ValidationResult` — the state model the whole package is built around |
| `src/config.ts` | CLI/env -> `RunnerConfig`; repo/task validation; platform-root auto-discovery (walks up from the installed location to find `shared/commands/dev.md` — no hardcoded local path) |
| `src/safety.ts` | The `canUseTool` deny-list — the single place destructive operations are blocked, unconditionally |
| `src/gitUtils.ts` | Read-only `git status`/branch helpers (dirty-tree check, files-changed reporting) |
| `src/contextLoader.ts` | Reads `shared/contract.md` kernel, `shared/commands/dev.md`, matching `shared/standards/*`/`shared/rules/*` (lazy, marker-file-driven, never a directory scan), and a target repo's `.mcp.json` with `${env:VAR}` substitution |
| `src/prompts.ts` | Builds each phase's system/user prompt from the loaded platform context |
| `src/worker.ts` | Thin, typed wrapper around the SDK's `query()` — the only place the loop talks to the model |
| `src/validator.ts` | Project-type detection (Maven/Gradle/npm) + real build/test execution + separate read-only LLM review with structured JSON output |
| `src/state.ts` | `LoopState` creation + JSON persistence after every transition |
| `src/audit.ts` | JSONL audit trail, secret-redacted, truncated |
| `src/loopController.ts` | The bounded state machine itself |
| `src/cli.ts` | `commander`-based CLI entry point; wires everything together; confirmation gate; final report printer |
| `test/*.test.ts` (5 files, 34 tests) | See §9 |

---

## 5. Loop Design

- **Loop controller** (`loopController.ts`): a single `runLoop()` function taking injected
  `analyzeAndPlan`/`execute`/`validate` functions (`LoopDeps`), so the state machine itself is
  testable with zero network calls — the entire retry/bound logic is verified without ever
  calling the SDK.
- **Worker** (`worker.ts` + the `analyzeAndPlan`/`execute`/`fix` prompts in `prompts.ts`): makes
  changes. Runs with the SDK's default tool set restricted per phase (`Read`/`Grep`/`Glob` only
  for Analyze/Plan; `Read`/`Write`/`Edit`/`Bash`/`Grep`/`Glob` for Execute/Fix). Never asked to
  judge its own correctness — its prompts explicitly say so.
- **Validator** (`validator.ts`): two independent checks combined with AND —
  1. **Deterministic**: the target repo's own build/test commands, detected from `pom.xml` /
     `build.gradle(.kts)` / `package.json` scripts, run via `child_process.spawnSync` with a
     10-minute timeout and real exit-code checking. If neither a build nor a test command is
     detected, both are reported as "not run" rather than silently assumed to pass.
  2. **LLM review**: a *separate* SDK session, read-only tools only (`Read`/`Grep`/`Glob`),
     given the task + plan and asked to review the current state of the repo for completeness/
     regressions, using the SDK's `outputFormat: {type: 'json_schema', ...}` to force a
     structured `{verdict, reasons[]}` response instead of free text.
- **Iteration handling**: `state.iteration` runs 1..`maxIterations`; iteration 1 runs Execute,
  iterations 2+ run Fix with the previous iteration's validator errors fed back into the prompt.
- **Retry/attempt handling**: `buildAttempts`/`testAttempts` increment only when that check
  actually ran, and an independent ceiling (`--max-build-attempts`, `--max-test-attempts`,
  default 3 each — matching `shared/contract.md`'s existing "max 3 attempts" retry policy) can
  stop the loop with `FAILED` before the iteration ceiling is reached.
- **Stopping conditions**: exactly `SUCCESS` (validator passed), `FAILED` (an attempt ceiling was
  hit), or `MAX_ITERATIONS` (iteration ceiling hit with no attempt ceiling triggered) — see the
  diagram in §3. `test/loopController.test.ts` drives all three plus a "retries then succeeds"
  path.
- **Wall-clock bound**: `--timeout` (default 1800s) is wired to an `AbortController` passed into
  every SDK call via `Options.abortController`.

---

## 6. Tool Execution

Every tool call — regardless of phase — passes through `worker.ts`'s `canUseTool` callback
(the SDK's real permission-callback API, verified against the installed `.d.ts`, not guessed),
which calls `safety.ts#evaluateToolUse` before allowing anything. Built-in tools available per
phase are scoped via the SDK's `tools` option (least privilege): read-only tools for Analyze/Plan
and the Validator's LLM review; full read/write/edit/bash for Execute/Fix. `settingSources: []`
is set on every call so a run never inherits the *operating* machine's own `~/.claude` or
project `.claude/settings.json` — behavior is fully determined by this package's code and CLI
flags/env, which is what makes it portable to another developer's machine.

---

## 7. MCP Integration

`contextLoader.ts#loadMcpServers` reads a target repo's own `.mcp.json` (per the platform's
existing `shared/mcp/.mcp.json.template` convention — same `${env:VAR}` substitution, same
"only read-only servers belong here" expectation documented in
`shared/mcp/tool-allowlists.md`) and passes it straight through to the SDK's `mcpServers` option
— no new MCP server is invented by this package. As defense in depth, `safety.ts` also denies
any MCP tool whose name matches a write-shaped pattern (`create_*`/`update_*`/`delete_*`/
`insert_*`/`write_*`/`push_*`/`merge_*`/`drop_*`/`truncate_*`), independent of what the
configured server itself would allow. This path is implemented and unit-testable
(`evaluateMcpTool` in `test/safety.test.ts`), but **connecting to a real MCP server was not
exercised** in this session (no target repo with a live `.mcp.json` and credentials was
available) — see §12.

---

## 8. Safety

See `README.md`'s Safety section for the full deny-list; summarized:

- **Unconditional** (no CLI flag re-enables these): `git push`, `git merge`,
  `git reset --hard`, `git clean -f*`, `git checkout .`, `git branch -D`, any `--force` git flag,
  `git rebase`, `git filter-branch`, `gh pr create`/`merge`, `gh release`, `rm -rf /` or `rm -rf`
  traversing above the working tree, destructive SQL (`DROP`/`TRUNCATE`/`DELETE FROM`/
  `UPDATE ... SET`), destructive Mongo shell calls, `npm publish`, `docker push`/`rmi`,
  `kubectl delete`/`apply`, host shutdown/reboot, and any write-shaped MCP tool name.
- **Default-on, overridable with an explicit flag**: refusing to start against a dirty working
  tree (`--allow-dirty` to override — and even then the runner still never commits).
- **Structural**: the runner never calls `git commit`/`git push` itself under any flag — that
  capability doesn't exist in the code at all, matching the platform's existing contract
  ("Git stays read-only... never commit, push, merge... unless the user explicitly instructs it
  in this session" — no such instruction exists in an unattended run by definition).
- **Logging**: `audit.ts` truncates every logged string to 500 characters and passes it through
  `redactSecrets()` (API-key-shaped, `Bearer `-prefixed, AWS-access-key-shaped, and
  `password=`/`secret=`/`token=`-shaped substrings) before writing — verified in
  `test/safety.test.ts`.

---

## 9. Tests Executed

All of the following were actually run in this session (not asserted from memory):

| Test | Command | Expected | Actual | Result |
| --- | --- | --- | --- | --- |
| TypeScript compiles against the real installed SDK types | `npx tsc -p tsconfig.json --noEmit` | Exit 0, no errors | Exit 0, no errors | PASS |
| Unit test suite | `npx vitest run` | All tests pass | 34/34 passed (5 files: safety, config, state, validator, loopController) | PASS |
| Production build | `npm run build` | `dist/*.js` emitted for every `src/*.ts` | 12 `.js` + 12 `.js.map` files emitted | PASS |
| CLI `--help` / `dev --help` | `node dist/cli.js --help`, `node dist/cli.js dev --help` | Usage text listing all flags | Printed correctly | PASS |
| Reject non-existent `--repo` | `node dist/cli.js dev --repo /nope ...` | Clear error, no crash/stack trace | `[LOOP] FATAL: --repo path does not exist...` | PASS |
| Reject missing `--task` file | `node dist/cli.js dev --repo <real> --task NOPE.md` | Clear error | `[LOOP] FATAL: --task file not found...` | PASS |
| Reject dirty target repo | Modify a tracked file in a real fixture repo, then run | Clear error, refuses to start | `[LOOP] FATAL: Repository ... has uncommitted changes...` | PASS |
| Confirmation gate on a clean repo | `echo no \| node dist/cli.js dev --repo <clean fixture> --task TASK.md` | Prints pre-flight block, asks to confirm, aborts cleanly on "no" | Printed `AUTONOMOUS /dev LOOP` pre-flight block including model/bounds/state-dir, then `[LOOP] Aborted by operator.` | PASS |
| `.gitignore` override for `package-lock.json` | `git check-ignore -v autonomous-runner/package-lock.json` (expect no match) | `package-lock.json` tracked, `node_modules`/`dist` ignored | Confirmed via `git check-ignore -v` on all three | PASS |
| No files touched outside `autonomous-runner/` | `git status --porcelain` at platform root | Only `autonomous-runner/` untracked | Confirmed — single line: `?? autonomous-runner/` | PASS |
| Live SDK `query()` round trip (real Worker/Validator/model call) | `ai-runner dev --repo <fixture> --task TASK.md --yes` with real credentials | Model plans, edits, validator runs build/test/review, loop reaches SUCCESS or a bounded FAILED | **Not run** — no `ANTHROPIC_API_KEY` and no `ant auth login` session available in this sandboxed environment | **NOT TESTED** (see §12) |
| MCP server connection | Target repo with a real `.mcp.json` + credentials | Server connects, read-only tools available | **Not run** — no live MCP server/credentials available | **NOT TESTED** (see §12) |

---

## 10. Bugs Found

1. **Destructive-SQL detection regex was broken.** The original pattern
   `/\b(DELETE|UPDATE)\s+.+\bFROM\b|\bUPDATE\s+\w+\s+SET\b/i` failed to match `DELETE FROM users`
   because `\s+` consumed the single space and the following `.+` then had nothing left to match
   before `FROM`. Caught by `test/safety.test.ts`'s `denies destructive SQL` case
   (`evaluateBashCommand('psql -c "DELETE FROM users"')` returned `allow: true` instead of
   `false`) — a real safety-gate gap, not a cosmetic test failure.

No other bugs were found in this session — everything else typechecked and passed on first
write, which is expected given the code was written against the SDK's real installed type
declarations rather than recalled/guessed signatures (see §14 recommendation on this practice).

---

## 11. Bugs Fixed

1. Split the broken combined regex into two explicit patterns —
   `/\bDELETE\s+FROM\b/i` and `/\bUPDATE\s+\S+\s+SET\b/i` — in `src/safety.ts`. Re-ran the full
   test suite afterward: 34/34 pass, including the previously-failing case.

---

## 12. Remaining Issues

Reported honestly, not glossed over:

- **No live model call was made.** This environment has no `ANTHROPIC_API_KEY` and no `ant` CLI
  session. Everything that requires an actual `query()` round trip to Claude — the real
  Analyze/Plan output, real file edits by the Worker, the LLM review's structured output, an
  end-to-end `SUCCESS` on a real task — is **implemented and typechecked against the SDK's real
  types**, but **not functionally verified end-to-end**. The user should run
  `ai-runner dev --repo <small test repo> --task <small task>` with real credentials before
  relying on this for anything important.
- **No MCP server connection was exercised.** `loadMcpServers()` and the SDK's `mcpServers` wiring
  are implemented and unit-tested at the config-parsing/safety-gate level, but no live MCP
  server was available to confirm an actual connection.
- **No resume-from-crash.** `LoopState` is persisted to disk on every transition, but a killed
  process restarts the loop from iteration 0 rather than resuming — documented as an MVP
  limitation in the README, not silently absent.
- **No automatic dependency installation.** The Validator assumes the target repo's own
  `npm install` / Maven/Gradle dependency resolution has already been done; it does not run
  `npm ci` or equivalent before build/test.
- **`npm audit` reports 5 vulnerabilities** (3 moderate, 1 high, 1 critical), all inside
  `vitest`'s transitive dev-only `esbuild`/`vite` dependency chain (a known dev-server request
  issue, not a runtime/production exposure since `vitest` never ships in `dist/`). Left as-is
  for this MVP rather than force a breaking `vitest` major-version bump; worth revisiting before
  this package matures past MVP.
- **The LLM review is a single read-only pass**, not a second full validation loop — the README
  says explicitly not to treat it as a substitute for human review before merging anything the
  loop produces.

---

## 13. Performance

Measured, not estimated, where the operation actually ran in this session:

| Metric | Value |
| --- | --- |
| `npx tsc --noEmit` | ~2–4s (no errors) |
| `npm run build` | few seconds, 24 output files |
| `npx vitest run` (34 tests, 5 files) | ~1.5–5s wall clock across repeated runs |
| CLI cold-start to pre-flight print (fixture repo, no model call) | sub-second |
| `npm install` (55 packages) | ~45s |

**Model-call-related metrics** (iterations, model calls, tool calls, build/test attempts, cost,
execution time for an actual loop run) **could not be measured** — no live run occurred (§12).
The design does track all of them at runtime (`LoopState.modelCalls`, `.toolCalls`,
`.buildAttempts`, `.testAttempts`, `.totalCostUsd`, `.startedAt`/`.completedAt`, printed in the
final `LOOP RESULT` block and persisted to `state/<taskId>.state.json`), so once a real run
happens the numbers are available without further instrumentation work.

**Context/token control built in:** each phase is a fresh, bounded `query()` call
(`maxTurns` per phase: 15 for Analyze/Plan and the LLM review, 40 for Execute/Fix) rather than
one long-lived conversation accumulating the entire run's history — this avoids the "blindly
send the whole repo/context on every iteration" failure mode called out in the original request.
The Fix phase's prompt carries forward only the plan text and the previous iteration's validator
error list, not the full transcript of prior tool calls.

---

## 14. Recommendations

1. **Run a real smoke test with credentials** before trusting this for anything beyond the unit
   level — set `ANTHROPIC_API_KEY` (or `ant auth login`), point `--repo`/`--task` at a small,
   disposable fixture, and confirm a `SUCCESS` end-to-end run.
2. **Bump `vitest`** past the `esbuild`/`vite` advisory chain (`npm audit fix --force` currently
   proposes `vitest@4.x`, a breaking change) once there's time to verify the rest of the test
   suite against `vitest` 4's API.
3. **Add resume-from-crash** if this graduates past MVP — `LoopState` already has everything
   needed (`iteration`, `status`, accumulated counters); the missing piece is a `--resume <taskId>`
   flag that reloads the persisted state and the target repo's current diff instead of starting
   iteration 0 from scratch.
4. **Consider wiring the interactive `/dev` command and this runner together** at the prompt
   level: `shared/commands/dev.md` could gain a short pointer noting that an unattended,
   process-level version of the same workflow exists at `autonomous-runner/`, so an engineer
   discovers it from the command they already know.
5. **Optional dependency bootstrap flag** (`--install`) for the Validator, so target repos that
   haven't had `npm install`/Maven resolution run yet don't silently report "no build command
   detected" when the real issue is missing `node_modules`.

---

## 15. Final Status

```text
PASS WITH WARNINGS
```

Every piece that could be verified without spending real API credit or requiring live external
credentials was verified and passes (compile, unit tests, CLI wiring, safety-gate logic,
git-ignore behavior, scope containment). The warning is specific and singular: the actual
Claude Agent SDK model round trip (Worker execution, Validator's LLM review, MCP connectivity)
was not exercised end-to-end in this session for lack of credentials — see §12 for exactly what
that leaves unverified and what running it yourself would confirm.

---

## 16. Addendum — Resume-from-Crash / Restart Support

A follow-up enhancement, same session, same isolation boundary (`autonomous-runner/` only,
nothing else touched).

**What changed.** `LoopState` gained a `checkpoint` (`{phase, iteration, savedAt}`), a persisted
`plan`, `lastValidationErrors`, and a `taskContentHash`. `loopController.ts` now writes a
checkpoint immediately after every phase that fully completes (Analyze/Plan, Execute, Fix,
Validate) and accepts an optional `ResumeOptions` that tells it which phase to re-enter at
instead of restarting from Analyze/Plan. A new `resume.ts` module turns a persisted checkpoint
into that re-entry instruction (`deriveResumePoint`), validates that a resume target actually
matches the current repo/task/task-content (`validateResumeMatch`), and finds candidate
incomplete runs for auto-detection (`findResumableStates`). `cli.ts` gained `--resume [taskId]`
and `--no-resume`, auto-detection with an interactive offer-to-resume prompt (skipped, not
silently auto-resumed, under `--yes`), and skips the dirty-tree rejection specifically when
resuming (an interrupted Execute/Fix is expected to leave the tree dirty). A `loop_resume` audit
event replaces `loop_start` for continued taskIds; the state and audit files are reused
(appended to), not recreated.

**The core design decision**: resume only ever continues from the last *completed* phase, never
a phase that was merely started. A crash mid-Execute always re-runs Execute/Fix in full (with an
added prompt note that the repo may already contain partial changes, so the Worker inspects
before assuming a clean slate) rather than guessing what already landed — the only phases that
are ever *skipped* on resume are ones whose checkpoint proves they already finished.

**Files changed** (all under `autonomous-runner/`, all new or extended — nothing rewritten):

| File | Change |
| --- | --- |
| `src/types.ts` | Added `LoopPhase`, `LoopCheckpoint`; extended `LoopState` with `checkpoint`, `plan`, `lastValidationErrors`, `taskContentHash` |
| `src/state.ts` | `createInitialState` takes an optional `taskContentHash`; added `hashTaskContent`, `loadState`, `listStateFiles` |
| `src/resume.ts` | **New.** `deriveResumePoint`, `validateResumeMatch`, `findResumableStates`, `isTerminal` |
| `src/loopController.ts` | Accepts optional `ResumeOptions`; writes a checkpoint after every phase; writes `loop_resume` instead of `loop_start` when continuing an existing taskId; skips Execute/Fix on the first resumed iteration when the checkpoint says it already completed |
| `src/prompts.ts` | `executePrompt`/`fixPrompt` take an optional `resumed` flag that appends a note about possible partial prior changes |
| `src/cli.ts` | `--resume [taskId]` / `--no-resume` flags; `resolveTaskId()` helper (explicit id, auto-pick, or interactive offer-to-resume); dirty-tree check skipped when resuming; resume banner lines |
| `test/resume.test.ts` | **New**, 17 tests — `deriveResumePoint` (all 4 checkpoint cases + 2 defensive-undefined cases), `validateResumeMatch` (terminal/repo-mismatch/task-mismatch/hash-mismatch/legacy-hash/match), `findResumableStates` (filtering, ordering, missing dir, corrupt file) |
| `test/loopController.test.ts` | +8 tests — checkpoint-write assertions, resume into each phase without re-running the completed one, resume respecting `maxIterations`, `loop_resume` vs `loop_start` audit distinction |
| `README.md` | New "Resume / crash recovery" section, updated flags table, architecture diagram, logging section, testing section, known-limitations list |
| `docs/AI-LOOP-IMPLEMENTATION-REPORT.md` | This addendum |

**Tests.** 59/59 pass (34 from the original MVP + 25 new: 17 in `resume.test.ts`, 8 added to
`loopController.test.ts`). `npx tsc -p tsconfig.json --noEmit` clean; a second ad-hoc `tsc` pass
against `src/*.ts test/*.ts` together (vitest's esbuild transform does not type-check) is also
clean — every new test file is type-correct, not just runtime-passing.

**Resume scenarios verified — mocked/unit level** (no network, `test/resume.test.ts` +
`test/loopController.test.ts`): resume after analyze_plan (skips re-planning, starts at
Execute); resume after execute/fix (skips re-executing, starts at Validate, same iteration —
does not restart from iteration 1); resume after validate (continues at Fix, next iteration,
with the persisted validator errors correctly threaded through); resume with no safe checkpoint
(re-runs Analyze/Plan under the same taskId rather than losing the audit trail); a resumed run
still stops at `MAX_ITERATIONS` and never exceeds the configured bound; `loop_resume` is written
instead of `loop_start` and carries the correct `startPhase`/`startIteration`; a fresh run still
writes `loop_start`, not `loop_resume`; a checkpoint is written after each of analyze_plan,
execute, and validate.

**Resume scenarios verified — live, real Claude Agent SDK, real fixture Git repo**
(`ANTHROPIC_API_KEY` was available this session, unlike the base MVP report's §12 — this
addendum's live testing is a strict superset of what was possible before): a hand-constructed
`LoopState` with `checkpoint: {phase: 'execute', iteration: 1}` was placed under a fixture
repo's `.ai-runner-state/state/`, simulating a process that crashed right after Execute
finished. Running `ai-runner dev --resume <taskId>` against it confirmed, against the real CLI
and real model:
- the CLI correctly identified it as a resume, printed `status=RUNNING lastCheckpoint=execute`
  / `Re-entering at: validate (iteration 1)`, and skipped the dirty-tree rejection;
- Execute was **not** re-invoked — the loop went straight to a real Validator run (real
  `npm run build`/`npm test`, both passing, plus a real read-only LLM review call);
- the LLM review correctly and independently identified that the task's actual deliverable
  (a README.md edit) was never made — a genuine, honest failure, not a scripted one, citing the
  runner's own state file and a real repo listing as evidence;
- the loop correctly advanced to a real Fix-phase model call at iteration 2 (`lastAction: "fix"`)
  without operator intervention;
- the interrupted-then-resumed run's checkpoint (`phase: 'execute'`) was preserved unchanged
  across a **second** simulated crash (a 5-minute CLI timeout mid-Validate) — resuming that
  taskId a second time correctly re-derived the same `validate (iteration 1)` re-entry point
  rather than advancing past a phase that hadn't actually completed, proving checkpoint
  integrity holds across repeated interruptions, not just one.
- The live Fix-phase model call (iteration 2) ran for an unusually long time (~12 minutes) and
  was terminated by the operator (this session) before reaching a terminal status, so the
  specific outcome "does a resumed Fix phase reach a real `SUCCESS`" is **not confirmed** — only
  that it was correctly *invoked* with the right context. Everything upstream of that call
  (resume detection, checkpoint-based re-entry, skip-vs-run decisions, multi-crash checkpoint
  stability, real Validator execution) was confirmed live, not just at the mock level.

**Remaining limitations** (in addition to the base MVP's §12, all specific to this feature):
- Resume re-enters at the last *completed* phase, not mid-phase — a crash mid-Execute always
  re-runs that whole phase; the added prompt note asks the Worker to inspect current state
  first, but this is guidance, not enforced idempotency.
- One interrupted run per repo+task is assumed; `findResumableStates` picks the most recent
  non-terminal match if more than one somehow exists.
- No automatic pruning of old completed/terminal state files — they accumulate under
  `.ai-runner-state/state/` until an operator cleans them up.
- The live end-to-end "resume completes with a real `SUCCESS`" path was exercised up to a real
  Fix-phase invocation but not confirmed to completion in this session (see above) — the unit
  tests fully cover this path with mocks, and everything mock-independent (CLI resume
  resolution, checkpoint derivation/skip logic, audit event correctness) was separately
  confirmed live.

**Final status for this addendum:** `PASS WITH WARNINGS` — same rating and same reason class as
the base report: everything testable without an open-ended live model call passed, live testing
went further than the base report could (real credentials were available this time) and
confirmed the resume mechanism itself end-to-end, and the one open item (a live run reaching
`SUCCESS` through a resumed Fix phase) is honestly reported as inconclusive rather than assumed.

---

## 17. Addendum — Real End-to-End Live Validation (Authenticated Session)

A follow-up session with working Anthropic credentials, run explicitly to close the one gap
every earlier report flagged: an actual, independently-verified `SUCCESS` through the real
`ai-runner dev` command. This addendum supersedes §12/§16's "not confirmed live" caveats where
they overlap.

### Authentication

No `ANTHROPIC_API_KEY` or `ANTHROPIC_AUTH_TOKEN` was set, and no `ant` CLI was on `PATH`. The
Claude Agent SDK authenticated anyway via `~/.claude/.credentials.json` — the credential file
this interactive session itself was already logged in with. No credential value was ever read,
printed, or logged; only the file's *existence* was checked. This is the functional equivalent
of "the existing authenticated Claude/`ant auth login` profile" the request asked to reuse.

### Build & unit tests

`npm run build` and `npx tsc -p tsconfig.json --noEmit` both clean. `npm test`: **66/66 pass**
(the 59 from §16 plus 7 new — see Bug Found below). One `npm run build` invocation crashed with
a vitest/tinypool "Worker exited unexpectedly" error and a separate invocation failed with a
shell-level "Could not determine Node.js install directory" error; both were transient and
non-reproducible — an immediate retry of each passed cleanly, consistent with this being a
heavily-loaded shared machine (dozens of concurrent `node.exe` processes throughout this
session) rather than a code defect. Not counted as a real failure.

### Bug found and fixed: dirty-tree check flagged the runner's own bookkeeping directory

**Symptom:** re-running `ai-runner dev` against a repo that had been run once before (even with
zero code changes) failed immediately with "Repository has uncommitted changes" — because
`.ai-runner-state/` itself is untracked, and `isWorkingTreeDirty`/`changedFiles`
(`src/gitUtils.ts`) ran plain `git status --porcelain` with no exclusion. The same bug also
meant a run's own state directory could appear in `LoopState.filesChanged`, misattributing the
runner's bookkeeping as a change the Worker made.

**Fix:** both functions now pass an exclusion pathspec (`git status --porcelain -- . ':!.ai-runner-state'`)
verified directly against a real repo before use. **Files changed:** `src/gitUtils.ts` (fix),
`test/gitUtils.test.ts` (new, 7 tests: clean tree, real tracked-file change, real untracked
file, `.ai-runner-state/`-only is NOT dirty, a real change alongside `.ai-runner-state/` still
IS dirty, `changedFiles` excludes the bookkeeping dir, empty list on a clean tree — all against
real `git`-initialized temp repos, not mocks). Rebuilt and re-ran the full suite (66/66) after
the fix.

### Investigation: apparent "hangs" that were not hangs

Three early live attempts appeared to hang indefinitely (15-30+ minutes, zero progress) during
Analyze/Plan. Killing and diagnosing in isolation — four standalone scripts calling the SDK's
`query()` directly and the shipped `worker.ts#runQuery` directly, with and without the real
~18.7 KB system prompt, the real target-repo `cwd`, real `tools`/`canUseTool`, and even the same
`execFileSync` git calls `cli.ts` makes beforehand — **every one of them completed normally**
(47-60 seconds), disproving each hypothesis in turn (system-prompt size, `cwd`, `tools`+
`canUseTool`, a synchronous git call before the async SDK spawn). The actual explanation
surfaced when a patient (not killed) real CLI run was checked via `fs.readFileSync` directly
from Node instead of `cat` through the Git-Bash path translation: the state file already showed
real progress (a completed Analyze/Plan, a real cost, an advancing checkpoint) at a point where
a `cat`-based read of the exact same file had shown nothing but the initial zeroed state. The
`cat`/pipe path was returning **stale snapshots** of a file another process was actively
rewriting; `fs.readFileSync` was not. All three "hung" processes killed earlier in this
investigation were, in hindsight, very likely healthy runs destroyed by impatient intervention
based on unreliable monitoring — not evidence of any defect in `autonomous-runner`. **Lesson
for future live testing of this tool (recorded in case anyone repeats this investigation):
poll progress via a direct Node.js file read or the harness's own task-completion notification,
not `cat`/shell redirection through a translated path, and do not kill a background run based on
apparent silence alone.**

### Live SDK result

Confirmed via more than half a dozen real, metered API calls across the diagnostics above and
the two full runs below: authentication, `query()`, tool use (`Read`/`Grep`/`Glob`/`Edit`/
`Bash`), `canUseTool` (observed firing for `Edit`/`Bash`, and — separately confirmed by its
absence in the diagnostics' tool-call logs — *not* invoked for inherently-safe read-only
`Read`/`Grep`/`Glob` calls under Claude Code's own default permission behavior; `safety.ts`
still gates whichever tools the SDK does route through it), structured output
(`outputFormat: json_schema`, used by the Validator's review), and cost/usage reporting all work
exactly as `worker.ts`/`validator.ts` assume.

### Live end-to-end result — fresh run, real `SUCCESS`

Fixture: a throwaway Git repo with `src/math.js` exporting `add(a, b)` that threw
`'not implemented'`, a real Node.js `node:test` suite asserting `add(2,3)===5` and
`add(-1,-1)===-2`, and a `TASK.md` asking for the implementation with `test/math.test.js` and
`package.json` declared off-limits. (One fixture-authoring mistake surfaced and was fixed along
the way: `"test": "node --test test/"` fails to resolve the directory on this Node 22.14.0/
Windows combination — `Cannot find module '...\test'` — while bare `node --test` correctly
auto-discovers the same files; this was a defect in the *test fixture's* `package.json`, not in
`autonomous-runner`, and was corrected before the run below.)

```
ai-runner dev --repo <fixture> --task TASK.md --yes --max-iterations 3 --timeout 1800
```

Result (`taskId TASK-2026-09-02T17-58-02-756Z`, read from `state/<taskId>.state.json` and cross-
checked against the audit log):

| Phase | Result |
| --- | --- |
| Analyze/Plan | 39s. Produced a genuinely on-topic, detailed plan citing the exact task file, test contract, and platform coding standards. |
| Execute | 55s. One `Edit` + 2 `Bash` tool calls. Changed exactly `src/math.js`, one line: `throw new Error(...)` → `return a + b;`. |
| Validate | 44s. Real `npm run build` (pass), real `npm test` (pass), separate read-only LLM review (pass). |
| **Result** | **`SUCCESS`**, iteration 1/3, 2 model calls, 3 tool calls, **$0.2372**, 2 min 20 sec wall clock. |

**Independently verified** (not taking the runner's own report on faith): read `src/math.js`
directly — contains `return a + b;`; ran `npm test` directly in the fixture — `# pass 2, # fail
0`; ran `npm run build` directly — clean; ran `git diff` — exactly the one-line change, with
`test/math.test.js` and `package.json` byte-identical to their committed baseline as the task
required. The audit log (`audit/<taskId>.audit.jsonl`) shows a complete, coherent
`loop_start → phase_start/end analyze_plan → iteration_start → phase_start/end execute →
phase_start validate → validate_result(pass:true) → loop_end(SUCCESS)` sequence with no gaps.

### Live crash/resume result — genuine process kill, not simulated

A second fixture (`multiply(a, b)`, same shape) was run, and this time the actual OS process was
killed (`taskkill`) mid-Execute — confirmed via the state file at the moment of the kill:
`status: RUNNING`, `checkpoint.phase: "analyze_plan"` (Execute had not yet checkpointed),
`src/mult.js` still unedited. This is a real interruption, not the hand-constructed state file
used in §16's addendum.

```
ai-runner dev --repo <fixture2> --task TASK.md --resume <taskId> --yes --max-iterations 3 --timeout 1800
```

The audit log across both process invocations for this one `taskId` reads: `loop_start →
phase_start/end analyze_plan → iteration_start → phase_start execute` *(process killed here)*
`→ loop_resume(resumedFromPhase: "analyze_plan", startPhase: "execute") → iteration_start →
phase_start/end execute → phase_start validate → validate_result(pass:true) →
loop_end(SUCCESS)`. Concretely, resuming: did **not** re-run Analyze/Plan (no second
`phase_start analyze_plan` after `loop_resume`) — the exact persisted plan text reappeared
verbatim in the post-resume state; did **not** restart at iteration 0 — the resumed process
picked up the already-accumulated `modelCalls`/`totalCostUsd` from before the crash and added to
them; correctly **re-ran** Execute (rather than skipping it, since the checkpoint proved Execute
had *not* completed before the crash) and this time completed it, then proceeded through
Validate to a real `SUCCESS`. Independently verified exactly as the first run was: `npm test`
→ `pass 2, fail 0`; `git diff` → one line, `mult.js` only.

Total across both invocations for this task: 3 model calls, 2 tool calls (the resumed Execute
only, since the interrupted first Execute attempt made none before being killed), **$0.2996**.

Combined with §16's addendum (checkpoint integrity proven stable across *two consecutive*
interruptions on a hand-constructed state, and correct re-entry derivation for every checkpoint
case at the unit level), resume-from-crash is now verified at three independent levels: unit
tests (mocked), a manufactured multi-crash scenario (live SDK, synthetic interruption), and a
genuinely OS-killed process (live SDK, real interruption).

### Final status for this addendum

```
PASS
```

Every item every earlier report left open — a real authenticated run, a real `SUCCESS`
independently verified end-to-end, and resume tested against an actual killed process rather
than a simulated one — is now closed. The one real bug this session's live testing surfaced
(the `.ai-runner-state/` dirty-tree false-positive) was fixed and regression-tested. No bug in
`autonomous-runner` was found in the "hang" investigation — that was a monitoring artifact in
how *this session* polled progress, not a defect in the tool being tested, and is recorded above
so it doesn't cost a future investigator the same hour.
