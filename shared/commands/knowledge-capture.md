---
description: After implementing something, capture what was learned as a new (or extended) file under shared/knowledge/ for future agents to reuse. Explicit, on-demand only — never runs automatically at the end of a task.
argument-hint: "[redmine=<id> | mr=!<n> | \"<free text: what was built/fixed>\"] [topic=<custom-flows/<name> | architecture | new>]"
allowed-tools: Read, Grep, Glob, Write, Edit, Bash, mcp__gitlab-reader__get_commit_diff, mcp__gitlab-reader__get_merge_request_diffs
---

# Command: /knowledge-capture

<!-- Shared execution contract is loaded via ~/.claude/CLAUDE.md (installed globally). -->

Agent profile: **Knowledge Capture**. Input: `$ARGUMENTS`.

Purpose: turn what was *actually just implemented and verified* in this
session (or a named MR/Redmine fix) into a durable knowledge file under
`shared/knowledge/`, in the same evidence-based style as the existing files
there (`shared/knowledge/custom-flows/*`, `shared/knowledge/architecture/*`) —
real file/class/method citations, gotchas, "verified" vs "inferred" framing —
not generic advice a model could produce without having touched this
codebase. This command never runs as a default step of another
command/skill; it only runs when the user explicitly asks to capture
knowledge from what was just done.

---

## Step 1 — Resolve what to capture

| Input | Source of the knowledge |
|---|---|
| `redmine=<id>` | `redmine_get_issue(id, include="journals")` + the MR(s) linked in its journals (per `shared/knowledge/architecture/redmine.md`'s MR-tracking pattern) |
| `mr=!<n>` | `get_merge_request_diffs` |
| Free text, or no argument | The current session's own recent work — the files actually read/edited in this conversation |

Only capture what was **actually implemented and verified** — a plan that
was written but not yet built, or a fix that was proposed but not merged, is
not knowledge yet. If the referenced work is still in-progress or unverified,
say so and stop rather than writing speculative documentation.

---

## Step 2 — Check for existing coverage (never duplicate)

Before writing anything:
1. `Glob shared/knowledge/**/*.md` and `shared/standards/**/*.md`.
2. `Grep` for the feature/domain name, the service name, and any distinctive
   class/table names from Step 1's evidence.
3. If an existing file already covers this: **extend it** (Edit — add a
   section, add a gotcha, correct something that turned out to be wrong) —
   do not create a near-duplicate file. If it's a genuinely new domain, only
   then create a new file.

---

## Step 3 — Determine placement

Root directory: `KNOWLEDGE_OUTPUT_PATH` from `paths.env` (repo root) if set to
a non-blank value, else the existing default, `shared/knowledge/` inside this
repo. Within that root, use `topic=` if the user gave it; otherwise infer:

| The work touches | Placement |
|---|---|
| ABDM, BOM, pagination/global-filter, upload — an existing `custom-flows/` domain | Extend the matching file under `<knowledge-root>/custom-flows/<domain>/` |
| A new, distinct business-flow domain not yet covered | New file under a new `<knowledge-root>/custom-flows/<new-domain>/` directory, named like the existing siblings |
| Service topology, environment/promotion behavior, Redmine workflow, dependencies | Extend the matching file under `<knowledge-root>/architecture/` |
| A reusable code pattern applicable beyond one feature (not a one-off business flow) | `shared/standards/backend/` or `shared/standards/frontend/` instead — this command still writes it, but flag to the user that it landed in standards, not knowledge, and why |

---

## Step 4 — Write the knowledge file

Follow the existing files' voice exactly — this is what makes them useful to
future agents instead of generic filler:

- State what's **verified** (you read the code/DB/logs yourself this
  session) vs **inferred** (plausible but not directly checked) — never
  blur the two.
- Cite real file paths, class names, method names, table/column names. If a
  `knowledge-graph` MCP server is connected, `get_source_evidence` is a cheap
  way to double-check a citation's file/line before writing it down as fact.
- Include the **gotcha**, if there was one — the thing that wasn't obvious
  going in and cost time to discover. This is usually the single most
  valuable sentence in the file.
- Skip anything genuinely generic (standard Spring Boot/Angular behavior
  with nothing project-specific about it) — that belongs in
  `shared/standards/`, not here, and probably doesn't need writing down at
  all if it's just how the framework normally works.
- Keep it to what was actually touched — do not pad with a full feature
  walkthrough when only one corner of it was worked on.

---

## Step 5 — Cross-link

If a new file was created (not just an extension): add it to the nearest
index — `shared/company-profile.md`'s "Custom Flow & Architecture Knowledge"
table for a new `custom-flows/`/`architecture/` topic, or a sibling file's
"Also read" pointer if one exists in that directory. A knowledge file no
index points to is a knowledge file no future agent will find.

---

## Output

The written/extended file path(s) · what was added and why (one line) ·
confirmation that Step 2's existing-coverage check was actually done (state
what was searched, not just "checked") · Execution Summary (contract §13).
This command makes no claim about implementation correctness — it documents
what was done, it doesn't re-validate it.
