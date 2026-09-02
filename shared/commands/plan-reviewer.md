---
description: Review a submitted plan (PLAN.md, an attached Redmine plan, or inline text) against real evidence — code, DB, logs, Grafana/SigNoz, Kafka, BRD/requirement docs — and score it for implementation readiness. Approval requires all four scores to clear the threshold (default 95). Not approved → produces a revised plan + test-case file and re-scores.
argument-hint: "plan=<path.md> | redmine=<id> | \"<inline plan text>\" [threshold=N] [max-revisions=N] [auto=true]"
allowed-tools: Read, Grep, Glob, Write, Bash, TodoWrite, mcp__redmine-reader__redmine_get_issue, mcp__redmine-reader__redmine_create_issue_note, mcp__gitlab-reader__get_file_contents, mcp__gitlab-reader__get_repository_tree, mcp__gitlab-reader__get_merge_request, mcp__gitlab-reader__get_merge_request_diffs
---

# Command: /plan-reviewer

<!-- Shared execution contract is loaded via ~/.claude/CLAUDE.md (installed globally). -->

Agent profile: **Plan Reviewer**. Input: `$ARGUMENTS`.

This is a QA/audit gate on a plan that already exists (produced by `/planning`,
by a human, or attached to a Redmine issue) — it does not write a first draft
of a plan (that's `/planning`'s job) and it never implements. It reviews the
plan against **proof**, not against how plausible the plan reads, and it will
not approve a plan just because it sounds reasonable — every claim in the plan
must be checked against actual code, actual data, actual logs, or the actual
requirement document.

---

## Mode Detection

Parse `auto=true`, `threshold=N` (default `95`), `max-revisions=N` (default
`3`) from arguments. Store as session flags.

**If `$ARGUMENTS` is empty → Session Mode.**
**If `$ARGUMENTS` is non-empty → Direct Mode** (skip to Input Resolution below).

---

## Session Mode (no args)

Print this banner exactly once and wait for user input:

```text
Plan Reviewer Session started.  Skill loaded once.

Give me a plan to review using any of:
  • plan=<path>               — PLAN.md or any plan/spec markdown file
  • redmine=<id>               — Redmine issue with a plan attached
  • Inline text                — paste the plan directly

Options:
  • threshold=N                — approval bar per score, default 95
  • max-revisions=N            — cap the review→revise loop, default 3
  • auto=true                  — skip the write-approval gate for revised files

Type 'done' to end the session.
```

For each item the user provides:

1. Run **Input Resolution**, then **Phase 1 — Evidence-Gathering & Scoring**.
2. Output the **Review Report** (see below).
3. If not approved and revisions remain: run **Approval Gate** → **Revision
   Phase** → re-run Phase 1 on the revision → repeat until approved, revisions
   exhausted, or the user stops.
4. Append **Execution Summary** (contract §13).
5. Print: `─── Review complete. Next? (or 'done') ───`
6. Wait for the next input. Repeat until user types `done`.
7. When user types `done`: print **Session Summary** (contract §13) and close.

---

## Input Resolution

| Input | Action |
| --- | --- |
| `plan=<path>` | `Read` the file directly |
| `redmine=<id>` | `redmine_get_issue(id, include="attachments,journals")` — find the attached plan (often `<issue-id>.md` or `implementation-plan.md` per `shared/knowledge/architecture/redmine.md`), fetch it from `content_url` |
| Inline text | Treat the argument text as the plan itself |
| A `TEST-CASES.xlsx` alongside the plan | Read it too if present — required input for the Test Plan score; if absent, that score cannot exceed 40 (see scoring below) |

Also resolve, if referenced by the plan or the Redmine issue: the requirement
/ BRD (issue description, linked wiki page, or a `file=` document), and any MR
links in the issue journals (`shared/knowledge/architecture/redmine.md`'s "MR
tracking in comments" pattern) — these are evidence sources, not the plan
itself.

---

## Phase 1 — Evidence-Gathering & Scoring (read-only, no changes)

For each of the four scores, gather proof before assigning a number. **Never
score from how the plan reads — score from what was actually verified.**

### 1. Problem Understanding (0–100)

Checks whether the plan's stated problem/requirement matches the actual
source of truth:

- Redmine ticket / BRD / user story — does the plan's problem statement match
  the ticket description and, per `redmine.md`'s comment-priority rule, the
  **latest** journal findings (not just the original description)?
- For a bug: does the plan's claimed root cause match what the actual code,
  DB state, or logs show — not just what the ticket reporter guessed?
- For new development: does the plan correctly capture the BRD's scope,
  including edge cases the BRD states explicitly?

Deduct for: problem statement contradicted by newer ticket comments, a stated
root cause with no supporting evidence, missed BRD requirements, scope the
plan invents that the requirement never asked for.

### 2. Code Understanding (0–100)

Every structural claim in the plan about "current behavior" or "files to
change" must be checked against the actual repository, actual DB schema, and
actual logs/traces — cite the evidence:

- **Knowledge graph first (kernel F-KG):** if a `knowledge-graph` MCP server
  is connected, verify the plan's file/class/flow claims with
  `get_source_evidence`/`get_api_context`/`trace_business_flow`/
  `find_dependencies` before falling back to `get_file_contents`/
  `get_repository_tree` — cheaper, and the graph's confidence tag
  (VERIFIED/INFERRED/UNRESOLVED) is itself useful review evidence; an
  UNRESOLVED graph edge for something the plan states as fact is a gap to
  flag, not something to silently re-verify by hand and drop.
- Files/classes/methods the plan names: do they exist, at the stated
  path, doing what the plan says they do? (`get_file_contents`,
  `get_repository_tree` — or the graph tools above if connected)
- DB claims: verify against the live schema via the environment-appropriate
  `mcp__*-db__query` tool (route via
  `shared/knowledge/architecture/environments.md`'s ticket-status → DB-MCP
  table) — per `shared/standards/backend/sql-query.md`'s verify-before-writing
  rule, applied here to verify-before-approving.
  never assume a table/column exists because the plan says so.
- Log/trace claims (an error, a slow query, a Kafka lag): verify against the
  relevant `*-signoz-reader`/`*-grafana-reader` MCP for the named environment
  — if the plan cites a stack trace or metric, find it, don't take the plan's
  word for it.
- Kafka/published-data claims: confirm the topic/consumer the plan names
  actually exists in the codebase (search for the topic string, the
  `@KafkaListener`/producer).

Deduct heavily for: any file/table/log claim that doesn't check out, "current
behavior" described from assumption rather than inspection, missing evidence
citations entirely (a plan reviewed with zero evidence citations cannot score
above 50 here regardless of how correct it turns out to be — the standard is
proof, not luck).

### 3. Test Plan / Test-Cases Score (0–100)

Only meaningful once Problem + Code Understanding are established — a test
plan for a misunderstood problem cannot be scored highly no matter how
well-formed it is:

- Does `TEST-CASES.xlsx` (or the plan's own test section) cover every gap
  identified in Problem/Code Understanding, including edge cases?
- Are test steps concrete and executable (not "verify it works")?
- Is regression coverage present for anything the change touches beyond the
  gap itself?
- If no test-case file exists and the plan doesn't describe a test approach:
  cap this score at 40 regardless of other quality.

### 4. Confidence (0–100)

The reviewer's own assessment that **this plan, as written, will solve/build
the thing** — informed by the three scores above plus:

- Risk level (contract §9) — a HIGH/CRITICAL-risk plan (DB/Flyway, auth,
  billing/patient data) needs more evidence to reach the same confidence as a
  LOW-risk UI change.
- Whether the plan's proposed solution is proportionate (no unrelated
  refactors riding along, no missing layer per contract §7's Gate A list).
- Internal consistency — does the implementation checklist actually cover
  everything the gap analysis found, with nothing silently dropped?

Confidence is not an average of the other three — a plan can understand the
problem and the code perfectly (90+/90+) and still deserve lower confidence if
the proposed solution itself has a gap (e.g., no rollback plan for a HIGH RISK
migration, per `shared/standards/backend/db-migration.md`).

---

## Review Report (always output, every pass)

```text
## Plan Review — <plan title / Redmine ID>

Problem Understanding : <N>/100 — <one-line reasoning>
Code Understanding    : <N>/100 — <one-line reasoning, cite evidence checked>
Test Plan             : <N>/100 — <one-line reasoning>
Confidence             : <N>/100 — <one-line reasoning>

Evidence checked: <files/tables/logs/tickets actually inspected — not a generic list>
Gaps found: <specific, one per line — empty if none>

Threshold: <N> (per-score, from `threshold=` or default 95)
Status: APPROVED FOR IMPLEMENTATION | NOT APPROVED
```

`APPROVED FOR IMPLEMENTATION` requires **all four** scores ≥ threshold. One
score below the bar is enough to withhold approval, regardless of how high the
others are.

---

## Approval Gate (contract §14) — only reached when NOT approved

If `auto=true`: skip and proceed directly to Revision Phase.

Otherwise: STOP after the Review Report and ask:

```text
Generate a revised plan + test-cases file? (approve / yes / proceed / stop)
```

---

## Revision Phase (after approval, auto=true, or session-mode continuation)

1. For every item in "Gaps found," produce a concrete fix in the plan — not a
   vaguer restatement of the same section.
2. Regenerate `PLAN.md` (same section shape as `/planning`'s Generation Phase)
   and `TEST-CASES.xlsx` (same column shape as `/planning`'s), incorporating
   the fixes. Write to: the same paths as the input plan if the user
   specified one, else `PLAN_OUTPUT_PATH` from `paths.env` (repo root) if
   set, else the same location the input plan was read from (existing
   default) — same resolution `/planning` uses.
3. Re-run **Phase 1 — Evidence-Gathering & Scoring** on the revision.
4. Output a new **Review Report**.
5. Repeat from step 1 if still not approved and `max-revisions` has not been
   reached. If `max-revisions` is reached without approval: stop, report the
   remaining gaps, and state explicitly that the cap was hit — do not keep
   revising silently past the cap.

---

## Posting to Redmine (only if explicitly asked)

If the user explicitly asks to post the result to the Redmine issue:
- Approved → `shared/templates/redmine-approval-comment.md`.
- Not approved → `shared/templates/redmine-execution-comment.md` with
  `Status: Needs revision` and the one-line gap summary.

Never post to Redmine as a default step of this command.

---

## Output

Review Report (every pass) · revised `PLAN.md`/`TEST-CASES.xlsx` (only if not
approved and the user proceeds) · audit line · Execution Summary (contract
§13).
Budget: 10 evidence-gathering searches per review pass · ≤ 12k tokens per pass.
