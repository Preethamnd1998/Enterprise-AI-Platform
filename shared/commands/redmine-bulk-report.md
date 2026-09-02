---
description: Take a list of Redmine issue IDs and produce one dated report — what each task is, its status, and (where the evidence supports it) a root-cause finding backed by code/DB/log citations. Read-only. Built to feed straight into /planning or /plan-reviewer.
argument-hint: "ids=<comma/space-separated Redmine IDs> [env=<override>] [auto=true]"
allowed-tools: Read, Grep, Glob, Write, Bash, TodoWrite, mcp__redmine-reader__redmine_get_issue, mcp__redmine-reader__redmine_search, mcp__gitlab-reader__get_file_contents, mcp__gitlab-reader__get_merge_request, mcp__gitlab-reader__get_merge_request_diffs, mcp__gitlab-reader__get_commit_diff
---

# Command: /redmine-bulk-report

<!-- Shared execution contract is loaded via ~/.claude/CLAUDE.md (installed globally). -->

Agent profile: **Redmine Bulk Reporter**. Input: `$ARGUMENTS`.

Purpose: turn a list of Redmine IDs into one report an engineer can triage in
one pass, and that a follow-up `/planning` or `/plan-reviewer` invocation can
start from directly instead of re-discovering the ticket from scratch. This
command never implements, never writes code, and never posts to Redmine
unless explicitly asked (see "Posting" below).

---

## Input Resolution

Parse `ids=` as a comma/space/newline-separated list of Redmine issue IDs.
If `$ARGUMENTS` contains bare numbers with no `ids=` key, treat them as the
list directly. If the list is empty, ask for it (contract §1 — one
clarifying question, then proceed).

`env=<name>` optionally overrides automatic environment detection (see Step 2
below) for every ID in the batch — use when the user already knows the
environment and per-ticket detection would be redundant.

---

## Per-ticket procedure (repeat for every ID in the list)

Budget: ≤ 8 searches and ≤ 1 DB/log MCP per ticket — this is a triage pass,
not a full `/bug-fix` investigation. If a root cause isn't found within
budget, report "insufficient evidence" for that ticket rather than expanding
scope; the user can run `/bug-fix redmine=<id>` for a deeper look afterward.

### Step 1 — Fetch

`redmine_get_issue(id, include="attachments,journals")`. Apply
`shared/knowledge/architecture/redmine.md`'s comment-priority rule: read
journals, weight the **latest** QA/deployment/rejection finding over the
original description.

### Step 2 — Determine environment

From the `Customer/Env` custom field, the ticket status name (New / RC Failed
/ QA Failed / UAT Failed / etc.), or `env=` if the user set it. Route to the
matching MCP servers via
`shared/knowledge/architecture/environments.md`'s "Ticket status → DB MCP
routing" table. Never query a higher-tier/customer-facing environment than
the ticket actually names.

### Step 3 — Find the MR(s), if any

Per `redmine.md`'s "MR tracking in comments": scan `journals[].notes` for
`git.lifetrenz.com/.../-/merge_requests/<n>` URLs. If found, pull the diff
(`get_merge_request_diffs`) — this is often the fastest path to an accurate
RCA (the fix that was actually attempted, and what a later "still failing"
comment says about it).

### Step 4 — Look for root cause, in this order (stop as soon as one gives a confident answer)

1. **MR diff** (Step 3) — does the diff explain the failure, or does a later
   rejection comment point at what's still wrong with it?
2. **Code** — **knowledge graph first (kernel F-KG):** if the ticket names a
   service/class/endpoint and a `knowledge-graph` MCP server is connected,
   use `search_knowledge`/`get_api_context`/`trace_business_flow` to locate
   and understand it before reading source — it's usually one call instead
   of several targeted reads. Fall back to a targeted `get_file_contents`
   read (never a repo-wide scan) when the graph is unavailable or unresolved.
3. **DB** — only if the ticket's symptom is data-shaped (wrong count, missing
   row, stale value) and Step 2 resolved which environment/table to check.
   Query via the routed MCP from Step 2 — never guess schema
   (`shared/standards/backend/sql-query.md`'s verify-before-writing rule
   applies here as verify-before-concluding).
4. **Logs/traces** — only if the symptom is an error/exception/timeout and an
   environment was resolved in Step 2. Use the matching
   `*-signoz-reader`/`*-grafana-reader` for that environment
   (`find_error_pattern_logs`, `search_logs`, `get_trace`, `find_slow_requests`
   as appropriate to the symptom).
5. **Attachments** — screenshots/images/files on the issue
   (`attachments[].content_url` per `redmine.md`). Fetch and `Read` (view)
   image attachments when a UI bug is described and code/DB/logs didn't
   already explain it — note explicitly if an attachment couldn't be
   retrieved rather than skipping it silently.

If none of the above yields a confident root cause within budget: mark the
ticket `INSUFFICIENT EVIDENCE` and say plainly what was checked and what's
still missing — never guess a root cause to fill the row.

### Step 5 — Confidence

Rate the RCA confidence the same way `/plan-reviewer`'s Code Understanding
score would: an RCA backed by an actual MR diff, DB row, or log line earns
`High`; an RCA inferred from the ticket description alone with no independent
check earns `Low` and must be flagged as such, never presented as equally
solid.

---

## Report

Write **one** combined file, `Redmine-Report-<YYYY-MM-DD>.md` (current date,
in the working directory unless the user specified a path), with one section
per ticket:

```markdown
# Redmine Bulk Report — <YYYY-MM-DD>

## #<id> — <title>
Status: <Redmine status>            Environment: <detected/overridden>
Task: <one or two lines — what this ticket is actually asking for/reporting>

Root cause: <finding, or "INSUFFICIENT EVIDENCE — <what was checked>">
Evidence: <MR !n diff / file:line / table+query / log line / attachment name — cite what was actually inspected>
Confidence: High | Medium | Low

Recommendation: <"Ready for /planning redmine=<id>" if RCA confidence is High,
"Needs deeper investigation via /bug-fix redmine=<id>" if Low/insufficient,
or "Needs human input — <why>" if genuinely blocked (e.g. no MCP access to
the required environment)>

---
```

End the file with a short summary table (ID, status, confidence, recommendation)
so the engineer can scan the whole batch without reading every section.

---

## Posting (only if explicitly asked)

If the user explicitly asks to post per-ticket findings back to Redmine, use
`shared/templates/redmine-execution-comment.md` per ticket (short, references
the report file by name rather than pasting the RCA inline) — never post as a
default step of this command.

---

## Output

`Redmine-Report-<date>.md` · audit line · Execution Summary (contract §13),
with `Prompt Quality` scored on the input list itself (a bare ID list scores
lower than one where the user also named the environment/expected behavior —
per contract §16, this never blocks execution, it's informational).
