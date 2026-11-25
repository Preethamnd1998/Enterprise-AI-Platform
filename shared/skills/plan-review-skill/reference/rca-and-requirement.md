# Requirement, RCA and Code-Understanding Checks

## 1. Requirement traceability (D1)

Sources, in priority order: **latest** Redmine journals → description → BRD/wiki → plan's own
restatement. Per `shared/knowledge/architecture/redmine.md`, newer comments override the
description. Titles get edited; read the journal `subject` changes (the symptom may have moved).

Build the matrix:

| # | Reported symptom / acceptance criterion | Source (journal id / line) | Plan item | Test case | Status |
|---|---|---|---|---|---|

Rules: every row needs a plan item and a test case. List **each reporter's** symptom
separately (QA, BA, dev comments often describe different failures under one ticket).
Extract screenshot facts (error text, console stack, URL, environment) into the matrix; an
unread screenshot is an unchecked requirement. Plan items with no source row are scope
creep: propose splitting them into their own ticket.

Questions that must be answered, or flagged as open decisions for the BA:
allowed/denied order types, roles, environments, customers, expected behaviour on edge
states (conducted, cancelled, empty, concurrent edit).

## 2. RCA (D2)

A proven RCA has all five:

1. **Symptom reproduced** or tied to an observed error (console stack, log line, request
   status) with environment and build.
2. **Mechanism**: the exact code path, `file:line` on the target branch, that produces it.
3. **Why now / why here**: what differs between working and failing (build mode, app,
   branch, data, role).
4. **Alternatives ruled out**: at least the obvious second cause, with the evidence that
   excluded it.
5. **Covers all symptoms**: one cause per cluster; list symptoms the cause does **not**
   explain. Those need their own RCA.

Red flags: "probably", a fix described before the cause; a framework error explained by a
mechanism that does not exist (e.g. dev-only checks blamed for production behaviour);
minified error names (`go is not a function`) mapped to source without a source map or
search; a cause that would make **every** user fail when the ticket says some do.

Where evidence lives: browser console/network screenshots, SigNoz/Grafana for the
environment, DB counts for "did this ever succeed here", `git log -S` for when it was
introduced or fixed (including under another ticket id).

## 3. Code understanding (D3)

For each structural claim in the plan, verify and cite:

| Claim | Where verified (`repo@ref:path:line`) | Result | Tag |
|---|---|---|---|

- Files, classes, methods exist at the stated path; do what the plan says.
- Line numbers match the **target branch** (not the author's checkout). Mismatch → the plan
  was written against unknown code.
- Existing behaviour is read from code, not inferred from the UI.
- Data flow end to end for the changed action (`saga`): UI trigger → API → service → store.
  Note async boundaries, shared singleton state, callbacks that bypass framework change
  detection.
- DB/Mongo claims verified against the live schema (read-only MCP) per
  `shared/standards/backend/sql-query.md`: never assume a column or collection.
- Existing tests: do they cover the changed code? (A spec that only asserts "should create"
  is no coverage.)

## 4. Change Map check (bug fixes)

The plan lists every planned edit with **line numbers**. For each row run
`git show <ref>:<path> | sed -n '<start>,<end>p'` and confirm: the file exists on that ref,
the lines contain the symbol the row names, the "before" snippet matches, and the "after"
change addresses the symptom in the same row. Tally rows OK / wrong-lines / wrong-file /
no-symptom. Expect different line numbers per branch when branches diverge (the same method
can sit at line 302 on one branch and 378 in the author's checkout); require a row per branch
or a stated reason the lines are identical (compare `git diff <a> <b> -- <path>`). Also list
edits the fix needs but the map omits (tests, translations, sibling apps with the same defect,
submodule pointer bumps).

Junior-author traps to look for: fixing the first component found rather than the screen the
user sees; trusting names (the host, selector and route that actually render it); editing a
generated or copied file instead of its source; assuming one app when the code is shared.
