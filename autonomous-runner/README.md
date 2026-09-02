# autonomous-runner

A standalone, autonomous AI Developer Agent loop for the Enterprise AI Platform's `/dev`
workflow, built on the [Claude Agent SDK](https://code.claude.com/docs/en/agent-sdk). It runs
`Analyze -> Plan -> Execute -> Validate -> Fix` unattended against any target Git repository,
bounded by explicit iteration/attempt/timeout limits, and stops itself on success, failure, or
limit exhaustion.

This package is a new, isolated addition to the platform (`autonomous-runner/`) — it does not
change any existing command, adapter, or installer. `/dev` as invoked inside an interactive
Claude Code / Copilot / OpenCode / Antigravity session (`shared/commands/dev.md`) is unchanged;
this is a second, separate way to run the same workflow, unattended, as its own process. It is
registered in the platform's own map of itself (`PROJECT-STRUCTURE.md`, a pointer comment in
`shared/commands/registry.yml`, a note in `shared/commands/dev.md`) and built/typechecked/tested
by the platform's own CI (`.gitlab-ci.yml`'s `autonomous-runner-build-test` job) — see
[Platform integration](#platform-integration).

## What it does and doesn't do

- **Does:** read a task file, plan, edit files, run local build/test commands, validate its own
  work with a real build/test run plus a separate read-only LLM review, retry on failure, stop
  at a bound, and — if interrupted — resume from the last safely-completed phase instead of
  starting over (see [Resume / crash recovery](#resume--crash-recovery)).
- **Does not:** commit, push, merge, rewrite Git history, or touch a production database. Those
  operations are denied unconditionally by `src/safety.ts` — no flag turns them back on. See
  [Safety](#safety).
- **Reuses, not duplicates:** the platform's `shared/contract.md` kernel (hash-verified against
  `shared/contract.md.sha256`), `shared/commands/dev.md` behavioral spec, the *full*
  `shared/standards/*`/`shared/rules/*` lazy-loading table (contract.md §5 — not a smaller
  subset), `shared/company-profile.md` and `shared/knowledge/*` (the F10 seam), the MCP allowlist
  in `adapters/claude/config/settings.json`, and a target repo's own `.mcp.json` (per
  `shared/mcp/.mcp.json.template`) are all read at runtime and folded into the model's system
  prompt / MCP config / safety gate — none of that content is copied or re-described here.
- **Bounded, non-recursive subagent creation:** a hard `--agent-limit` (default 1) caps
  Task-tool (subagent) invocations for the whole run, including nested ones — see
  [Bounded subagent governance](#bounded-subagent-governance-agentlimit).

## Prerequisites

- Node.js >= 18 (developed and tested against Node 22).
- An Anthropic API key, **or** an active `ant auth login` CLI profile (see
  [Authentication](#authentication)).
- The target repository must be a Git repo. If you want the runner to actually build/test it,
  its own toolchain (`npm`, `mvn`, or `gradle`/`gradlew`) must already be installed and its
  dependencies already fetched — the runner does not run `npm install` / `mvn install` for you.

## Install

```bash
cd autonomous-runner
npm install
npm run build
```

`npm install` writes `package-lock.json` in this directory — it is intentionally **not**
gitignored (see `autonomous-runner/.gitignore`), so installs stay reproducible even though the
platform root's `.gitignore` ignores lockfiles everywhere else.

## Configure

```bash
cp .env.example .env
# edit .env: set ANTHROPIC_API_KEY, or leave unset if you use `ant auth login`
```

See `.env.example` for every recognized variable. All of them are optional overrides of CLI
flags — nothing in `.env` is required beyond credentials.

## Usage

```bash
node dist/cli.js dev --repo <path-to-target-repo> --task <path-to-task.md>
```

Or, once you `npm link` (or install this package globally), the `ai-runner` bin resolves the
same entry point:

```bash
ai-runner dev --repo /path/to/your-project --task PLAN.md
```

`--task` may be an absolute path or relative to `--repo`. The task file is whatever you'd hand to
the interactive `/dev` command — a plan, a spec, a ticket write-up.

### Example

```bash
ai-runner dev \
  --repo ~/code/my-service \
  --task PLAN.md \
  --max-iterations 5 \
  --max-build-attempts 3 \
  --max-test-attempts 3 \
  --timeout 1800 \
  --model claude-opus-5
```

On start it prints a pre-flight summary and — unless `--yes` is passed — asks for a one-time
confirmation before it touches anything, mirroring the platform's own Approval Gate
(`shared/contract.md` §14). It then runs the bounded loop, printing `[LOOP]` / `[AGENT]` /
`[TOOL]` / `[VALIDATOR]` lines as it goes (see [Logging](#logging)), and finishes with a summary:

```text
========================================
LOOP RESULT
========================================
Status:          SUCCESS
Iterations:      2/5
Model calls:     3
Tool calls:      11
...
```

### All flags

| Flag | Default | Meaning |
| --- | --- | --- |
| `--repo <path>` | required | Target Git repository |
| `--task <path>` | required | Task Markdown file |
| `--max-iterations <n>` | 5 | Analyze/Execute/Validate/Fix loop bound |
| `--max-build-attempts <n>` | 3 | Stop with `FAILED` once this many build attempts fail |
| `--max-test-attempts <n>` | 3 | Stop with `FAILED` once this many test attempts fail |
| `--timeout <seconds>` | 1800 | Overall wall-clock budget for the whole run |
| `--model <id>` | `claude-opus-5` | Primary model (or `$AI_RUNNER_MODEL`) |
| `--fallback-model <id>` | `claude-sonnet-5` | SDK `fallbackModel` if the primary is unavailable |
| `-y, --yes` | off | Skip the pre-execution confirmation prompt |
| `--allow-dirty` | off | Allow running against a repo with uncommitted changes |
| `--verbose` | off | Stream SDK stderr |
| `--resume [taskId]` | off | Resume a previous incomplete run for this `--repo`/`--task` (omit the id to auto-select the most recent match) |
| `--no-resume` | off | Never auto-detect or prompt to resume an incomplete run — always start a fresh taskId |
| `--agent-limit <n>` | 1 | Hard ceiling on Task-tool (subagent) invocations for the whole run, 0-3 — see [Bounded subagent governance](#bounded-subagent-governance-agentlimit) |

## Pointing it at your own repository

The runner never assumes anything about the target repo's structure beyond what it can detect
at runtime:

1. `--repo` can be any Git repository on disk — it does not need to know about
   `enterprise-ai-platform` at all.
2. Project-type detection (`src/validator.ts`) looks for `pom.xml`, `build.gradle(.kts)`, or
   `package.json` in the target repo's root and derives build/test commands from what it finds
   (Maven, Gradle, or the repo's own `npm run build` / `npm test` scripts). If none match, the
   runner skips the build/test check and relies on the LLM review alone — this is reported
   in the final summary, not silently assumed to be a pass.
3. If the target repo has its own `.mcp.json` (see `shared/mcp/.mcp.json.template` in this
   platform for the convention), the runner loads it and passes it through to the SDK, with
   `${env:VAR}` substitution from your own environment. Only configure **read-only** MCP servers
   there — see `shared/mcp/tool-allowlists.md`. Regardless of what that file configures, every
   MCP tool call is checked against `adapters/claude/config/settings.json`'s
   `permissions.allow` list (`contextLoader.ts#loadMcpAllowlist`) — the *same* allowlist file
   the interactive Claude Code adapter installs — and denied if absent from it, or if that file
   couldn't be read at all. This is a real allowlist check, not a guess at whether a tool name
   "looks" read-only.
4. State and audit logs are written under `<repo>/.ai-runner-state/` inside the target repo
   (gitignored in this package's own `.gitignore` template — add the same pattern to the target
   repo if you don't want it tracked there).

No file, script, or path outside this Git repository is required to run `autonomous-runner`
against a project on someone else's machine.

## Resume / crash recovery

If the process is interrupted — killed, crashed, network dropped, `--timeout` reached — a
`LoopState` checkpoint has already been written to `<repo>/.ai-runner-state/state/<taskId>.state.json`
after every phase that fully completed (Analyze/Plan, each Execute or Fix, each Validate).
Re-running the same `--repo`/`--task` picks that up:

```bash
# Auto-detect: if an incomplete run exists for this exact repo+task, you'll be asked to resume it
ai-runner dev --repo ~/code/my-service --task PLAN.md

# Explicit: resume a specific interrupted run by its taskId (printed in the original run's banner
# and in the final LOOP RESULT block, or found under .ai-runner-state/state/)
ai-runner dev --repo ~/code/my-service --task PLAN.md --resume TASK-2026-09-02T...

# Explicit, auto-picking the most recent match for this repo+task
ai-runner dev --repo ~/code/my-service --task PLAN.md --resume

# Force a fresh run even if an incomplete one exists (no prompt, no auto-detection)
ai-runner dev --repo ~/code/my-service --task PLAN.md --no-resume
```

**How re-entry is decided** (`src/resume.ts#deriveResumePoint`) — the loop only ever continues
from the last *completed* phase, never from one that was merely started, so a crash mid-phase
always re-runs that phase rather than trusting partial work from it:

| Last completed phase | Resume re-enters at | Why |
| --- | --- | --- |
| *(none — crashed before Analyze/Plan finished)* | Analyze/Plan, from scratch | Analyze/Plan uses read-only tools only, so nothing on disk needs undoing |
| Analyze/Plan | Execute, iteration 1 | The plan is safe to reuse — no files were touched yet |
| Execute or Fix (iteration N) | Validate, same iteration N | The edit attempt already happened; re-running it would risk redoing/duplicating work |
| Validate (iteration N, not passed) | Fix, iteration N+1 | Validation is deterministic (build/test) plus a read-only review — safe to have skipped straight to here |

The iteration count, accumulated tool/model-call counters, cost total, files-changed list, and
the Validator's last error list are all restored from the persisted state — a resumed run's
final report reflects the *entire* task's history, not just the resumed portion. When Execute or
Fix is re-entered on a resumed run, its prompt gets one extra note telling the Worker the repo
may already contain partial changes from the interrupted attempt, so it inspects current file
state rather than assuming a clean slate (`src/prompts.ts`'s `RESUMED_NOTE`).

**Safety guards specific to resume** (`src/resume.ts#validateResumeMatch`):

- A **completed** task (`SUCCESS`/`FAILED`/`MAX_ITERATIONS`) is refused — "Nothing to resume."
  Rerun without `--resume` to redo it as a new taskId.
- A saved state for a **different repository** or a **different task file path** is refused.
- A saved state whose task file's **content hash no longer matches** the current `--task` file
  is refused — resuming with a plan built against since-edited requirements would silently apply
  the wrong changes.
- Resuming skips the dirty-working-tree check that a fresh run enforces — a dirty tree is the
  *expected* result of an interrupted Execute/Fix, not something to block on.

Every process invocation writes exactly one `loop_start` (brand-new taskId) or `loop_resume`
(continuing an existing taskId) audit event, so a task's audit log is a readable timeline across
however many times it was interrupted and resumed — see [Logging & state](#logging--state).

## Bounded subagent governance (`agentLimit`)

The interactive `/dev` command's contract (kernel C4) is "zero subagents by default, opt-in
`agents=N` max 3" — a human approves Multi-Agent Mode before it starts. There is no human here
to approve one in real time, so autonomous-runner uses its own, stricter default while
preserving the same *ceiling*:

- **Default (no `--agent-limit` passed): 1.** One delegated helper is allowed, not zero, since
  nothing here can ask a human mid-run the way Multi-Agent Mode's approval gate does — but it is
  bounded, not unlimited.
- **Explicit `--agent-limit N`** overrides the default. `N` must be `0`-`3`; anything above `3`
  is rejected at startup (`config.ts#parseAgentLimit`) — the same ceiling the interactive
  command's Multi-Agent Mode enforces (kernel C4's "max 3"). `--agent-limit 0` disables Task-tool
  access entirely for the run.
- **It is a hard runtime limit, never auto-increased.** A single `{ limit, used }` object
  (`src/safety.ts`'s `AgentBudget`) is created once per run and passed by reference into *every*
  phase's SDK call — Analyze/Plan, Execute, and every Fix iteration — so the ceiling holds across
  the whole run, not per phase. Nothing in the codebase writes to `.limit`; only `.used` is
  incremented, and only after a spawn is allowed.
- **Recursive/indirect spawning respects the same limit.** The SDK routes a subagent's own tool
  use through the same `canUseTool` callback as the top-level session (with `agentID` identifying
  which subagent made the call) — so a subagent attempting to spawn another subagent is checked
  against the exact same shared budget, not a fresh one. There is no nesting depth at which the
  check is skipped.
- **The effective limit and usage are recorded, not just configured.** `LoopState.agentLimit`
  and `LoopState.subagentInvocations` are persisted to `state/<taskId>.state.json` after every
  phase and survive resume (a resumed run's budget starts from what was already spent, not from
  zero); every `loop_start`/`loop_resume`/`phase_end` audit event carries `agentLimit` and/or
  `subagentInvocations` too.
- A denied spawn is logged like any other denial: `[TOOL] Task — DENIED (agentLimit reached
  (N/N) — subagent creation is blocked for the rest of this run)`.
- Analyze/Plan and the Validator's LLM review never get the `Task` tool at all — only Execute/Fix
  do, and only when `agentLimit > 0` (`cli.ts`'s `executeTools`). Bounding only the phases that
  already have broad tool access keeps the attack surface as small as the governance requirement
  allows.

## Contract integrity verification

Equivalent to `adapters/claude/hooks/hash-check.js` (the PreToolUse hook an interactive Claude
Code session runs), but for a process that reads the platform source directly rather than an
installed copy: `src/contractIntegrity.ts#verifyContractIntegrity` extracts
`shared/contract.md`'s kernel block and compares its SHA-256 against `shared/contract.md.sha256`
once per run, before the loop starts. Deliberately **the same behavior as the hook, not
stricter**: a mismatch is printed as a loud warning (`[LOOP] Contract: MISMATCH — ...`) and
recorded in state/audit (`contractHashStatus: 'mismatch'`), but the run continues — there is no
installed copy here to self-heal by re-injection the way the hook can, so refusing to run over a
source-level discrepancy would be a different, stricter policy than the platform's own, not an
equivalent one. `missing` (no `.sha256` file) and `unavailable` (no kernel markers /
`contract.md` at all) are reported the same way. Status codes: `ok` / `mismatch` / `missing` /
`unavailable`.

## Authentication

The Claude Agent SDK resolves credentials the same way the `ant` CLI does: `ANTHROPIC_API_KEY` in
your environment/`.env`, or (if unset) an active `ant auth login` profile. If neither is
available, the run fails when it makes its first model call — the CLI's own argument/repo
validation, platform-context loading, and dirty-tree check all happen before that point and work
without credentials, which is exactly what the local test suite exercises without hitting the
network.

## Safety

`src/safety.ts` is consulted on **every** tool call via the SDK's `canUseTool` hook, before the
tool executes. It is reconciled with, not a duplicate of, the platform's own
`adapters/claude/config/settings.json`: every one of that file's `permissions.deny` Bash
patterns has an equivalent here, its `permissions.ask` entries (DB migration files) are
*denied* rather than asked (there's no human to ask), and its MCP `permissions.allow` list is
consulted directly rather than re-implemented as a name-shape guess. Unconditional denials (no
flag or prompt can re-enable these):

- `git push`, `git commit`, `git merge`, `git reset --hard`, `git clean -f*`, `git checkout .`,
  `git branch -D`, any `--force` git flag, `git rebase`, `git filter-branch`
- `gh pr create`/`gh pr merge`, `gh release`
- `rm -rf /` or `rm -rf` traversing above the working tree
- `flyway` CLI invocations, and any `Edit`/`Write` to a path under a `db/migration` directory
  (mirrors `settings.json`'s `permissions.ask` for the same paths — unattended, so denied
  instead of asked)
- Destructive SQL (`DROP`/`TRUNCATE`, `DELETE FROM`, `UPDATE ... SET`) and destructive Mongo
  shell calls (`deleteMany`, `updateOne`, `drop`, ...) issued via Bash
- `npm publish`, `docker push`/`rmi`, `kubectl delete`/`apply`, host shutdown/reboot
- **Every MCP tool, fail-closed**, unless it appears in `adapters/claude/config/settings.json`'s
  `permissions.allow` — including when that file couldn't be read at all (denies everything,
  matching the platform's own `"deny": ["mcp__*"]` base rule rather than falling back to a
  permissive guess)
- Task-tool (subagent) spawning beyond `--agent-limit` — see
  [Bounded subagent governance](#bounded-subagent-governance-agentlimit)

Everything else the SDK's built-in tools can do (read, write, edit, run arbitrary non-destructive
Bash, use allow-listed read-only MCP tools) is available to the Worker. The loop also:

- refuses to start against a dirty working tree unless `--allow-dirty` is passed (and even then,
  never commits on your behalf — it just no longer insists on a clean starting point);
- runs with `settingSources: []`, so it never inherits your own machine's `~/.claude` or a
  project's `.claude/settings.json` — a run's behavior is determined entirely by this package's
  code and your CLI flags/env, not whatever happens to be configured on the host (the platform's
  `settings.json` is read explicitly, as data, for the MCP allowlist above — never loaded as SDK
  settings);
- verifies the platform contract's kernel hasn't drifted — see
  [Contract integrity verification](#contract-integrity-verification);
- enforces a wall-clock `--timeout` via an `AbortController` passed into every SDK call.

## Logging & state

Every run writes two files under `<repo>/.ai-runner-state/`:

- `state/<taskId>.state.json` — the current `LoopState` (see `src/types.ts`), overwritten after
  every phase transition. Safe to inspect while a run is in progress.
- `audit/<taskId>.audit.jsonl` — one JSON line per lifecycle event (`loop_start` or `loop_resume`,
  `phase_start`, `phase_end`, `phase_skip`, `iteration_start`, `validate_result`, `loop_end`),
  each carrying a `schema_version` and documented by `schemas/audit-schema.json` **inside this
  package** — a deliberately separate schema from the platform's `shared/schemas/audit-schema.json`
  (that one's `event` enum is Claude Code hook names — `Stop`/`PostToolUse`/`SubagentStop` —
  describing what a hook observed in an interactive session; this describes an unattended loop's
  own lifecycle, which is not an instance of any of those hook events). Reusing that file's
  schema would mean lying about what happened; extending it would change a file other consuming
  repos may already validate against. Keeping them separate and both documented is the
  reconciliation. Tool inputs are truncated to 500 characters and passed through a
  secret-redaction filter (`redactSecrets` in `safety.ts`) before being written — no API keys,
  tokens, or password-shaped strings ever reach the log. Resuming an existing taskId appends to
  the same file rather than starting a new one, so the log reads as one continuous history across
  however many interruptions a task had.

Console output follows the same `[LOOP]` / `[AGENT]` / `[TOOL]` / `[VALIDATOR]` prefixing used in
the platform's own design notes, so a transcript reads top-to-bottom as the loop's history.

## Architecture

```text
cli.ts            CLI entry point (commander), wiring + confirmation gate + final report
  |
  +-- config.ts        CLI/env -> RunnerConfig (incl. agentLimit), repo/task validation,
  |                     platform-root discovery
  +-- contractIntegrity.ts  Kernel-hash check equivalent to hash-check.js (warn, never block)
  +-- contextLoader.ts  Reads shared/contract.md, shared/commands/dev.md, the FULL
  |                     shared/standards/*+shared/rules/* lazy-load table (contract.md §5),
  |                     shared/company-profile.md + shared/knowledge/* (F10), the target repo's
  |                     own .mcp.json, and adapters/claude/config/settings.json's MCP allowlist
  +-- prompts.ts        Builds each phase's system/user prompt from the loaded context
  +-- resume.ts         Checkpoint -> re-entry-point logic + resume-match validation
  +-- loopController.ts Bounded Analyze->Plan->Execute->Validate->Fix state machine (LoopState),
  |                     checkpointed after every phase; accepts an optional resume point
  |     |
  |     +-- worker.ts    Thin wrapper around the SDK's query(); enforces agentLimit via a
  |     |                 shared AgentBudget passed into every phase's canUseTool
  |     +-- validator.ts Real build/test execution (Maven/Gradle/npm) + a separate read-only
  |                       LLM completeness/regression review (structured JSON output)
  +-- safety.ts        canUseTool gate — reconciled with settings.json (see Safety); also
  |                     evaluateSubagentSpawn (pure, unit-tested budget check)
  +-- state.ts          LoopState persistence + load/hash/list helpers for resume
  +-- audit.ts          JSONL audit trail (secret-redacted, own schemas/audit-schema.json)
  +-- gitUtils.ts       Read-only git status/branch/diff helpers
```

The Worker never gets to declare its own work correct — `loopController.ts` only ever asks
`validate()` for a pass/fail, and `validate()` is a real build/test run plus a *separate* SDK
session with read-only tools that never saw the Execute/Fix phase's tool calls.

## Testing

```bash
npm test
```

Runs from a clean checkout with **no network access and no API key required** — the test suite
mocks the Worker/Validator functions at the `LoopDeps` boundary (`test/loopController.test.ts`,
including resume scenarios) and exercises `safety.ts`, `config.ts`, `state.ts`, `resume.ts`,
`contextLoader.ts`, `contractIntegrity.ts`, and `validator.ts`'s project-detection logic directly
against real fixture files/strings. It does not call the Claude Agent SDK.

- `test/resume.test.ts` — `deriveResumePoint` for every checkpoint case, `validateResumeMatch`'s
  rejection rules, `findResumableStates`' filtering/ordering.
- `test/loopController.test.ts` — resuming into each phase without re-running the phase that
  already completed, the `loop_resume` vs `loop_start` audit distinction, `maxIterations`
  respected on resume.
- `test/safety.test.ts` — every Bash denial pattern (including `git commit`/`flyway`, added
  during platform-hardening), the DB-migration-path guard, MCP allowlist fail-closed behavior,
  and `evaluateSubagentSpawn`'s budget logic (allow up to the limit, deny at/above it, `limit`
  itself is never mutated by the function).
- `test/contextLoader.test.ts` — the full contract.md §5 standards/rules table (per-language
  layer detection including camelCase class names like `UserController`, the testing/README.md +
  language-specific-topic pairing, rules always-vs-conditional loading), the F10 knowledge-topic
  table parsed live from `company-profile.md` (not hardcoded), and `loadMcpAllowlist`.
- `test/contractIntegrity.test.ts` — `ok`/`mismatch`/`missing`/`unavailable` against real
  temp-file kernels and hashes, and that it never throws.
- `test/config.test.ts` — `--agent-limit` defaults, valid range, rejection of negative/
  non-integer/over-ceiling values.

What the test suite does **not** cover — and what running this for real requires credentials
for — is an actual live model round trip: the SDK's `query()` call itself, MCP server
connectivity, a genuine end-to-end "the model fixes a real bug" scenario, and — because it
requires the SDK to actually route a subagent's tool call back through `canUseTool` with a
populated `agentID` — a *live* confirmation that a subagent's own attempt to spawn a further
subagent is bounded by the same shared budget (the budget-check logic itself is unit-tested via
`evaluateSubagentSpawn`; the SDK's `agentID`-routing behavior that makes it apply to nested
calls is documented in the SDK's own types, not independently re-verified here). Run
`ai-runner dev` against a small real repo with real credentials to exercise that path.

## Platform integration

This package is registered in, not just adjacent to, the platform's own structure:

- **`PROJECT-STRUCTURE.md`** — a full section describing this directory and its purpose,
  alongside `shared/`, `adapters/`, `tools/`, etc.
- **`shared/commands/registry.yml`** — a documentation comment under the `dev` entry pointing
  here. Deliberately *not* a registry entry of its own: that file is specifically the list of
  interactive slash commands installers generate adapter shells from, and this has no adapter
  shell (it's a CLI, invoked directly, not via `/slug`).
- **`shared/commands/dev.md`** — a short pointer note near the top, so an engineer reading the
  interactive spec discovers the unattended mode exists.
- **`.gitlab-ci.yml`** — the `autonomous-runner-build-test` job runs `npm ci && npm run build &&
  npm run typecheck && npm test` inside this directory as part of the platform's own pipeline,
  triggered on changes to this package or to the platform files it reads at runtime
  (`shared/contract.md`, `shared/contract.md.sha256`, `shared/commands/dev.md`,
  `adapters/claude/config/settings.json`).

What integration does **not** mean here: this remains an isolated Node/TS runtime with its own
`package.json`, its own test runner, and its own release cadence — "integrated" means the
platform knows it exists, documents the relationship, and gates it in CI, not that it was folded
into the markdown-command architecture or given an adapter shell it has no use for.

## Known limitations (MVP scope)

- Resume re-enters at the last *completed* phase, not mid-phase — if the crash happened partway
  through Execute/Fix itself, the Worker re-runs that whole phase rather than continuing a
  half-finished tool call. It's told to inspect current file state first (see
  [Resume / crash recovery](#resume--crash-recovery)), but this is guidance, not a guarantee of
  perfect idempotency — review a resumed run's diff like you would any other.
- Resume assumes one interrupted run per repo+task at a time — `findResumableStates` picks the
  most recently started non-terminal state; if you deliberately ran the same task twice
  concurrently (not recommended), only the newest is offered.
- No automatic dependency installation (`npm install`/`mvn -U`) before build/test — the target
  repo must already be set up.
- The LLM completeness/regression review is a single read-only pass, not a full second opinion
  loop — treat it as one more signal alongside the real build/test run, not a substitute for
  human code review before merging anything the loop produces.
- The standards/rules/knowledge topic detection in `contextLoader.ts` is keyword/regex-based
  against the task file's text (and, for standards, the repo's own marker files) — same
  heuristic nature as the interactive `dev.md`'s own context-folder reference matching. A task
  that never mentions a relevant word (e.g. asks for "the login screen" instead of "the
  `LoginComponent`") may under-match; it will never *cross-contaminate* (a Java-only repo never
  loads frontend/mobile standards, and vice versa — enforced by the repo-language marker gate,
  not the keyword match alone).
- `contractIntegrity.ts` and the MCP allowlist in `safety.ts` both read
  `adapters/claude/config/settings.json`/`shared/contract.md.sha256` as static data files at
  startup — they are not re-checked mid-run if those files change while a long run is in
  progress (matching the hook's own once-per-session behavior, not a stricter mid-run policy).
- The live SDK behavior that makes `agentLimit` bound *nested* Task calls (a subagent's tool use
  routing through the same `canUseTool` with a populated `agentID`) is documented in the SDK's
  own types and relied upon, but not independently re-verified against a live nested-subagent
  run in this session — see [Testing](#testing).
