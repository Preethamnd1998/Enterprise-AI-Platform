# Redmine Execution Comment Template

> Use only when the user explicitly asks to add an execution/status comment to
> a Redmine issue (e.g. "add an execution comment", "post an update to the
> ticket"). Never post to Redmine proactively or as a default step of any
> command — Redmine comments are visible to the whole team and, once posted,
> are not something the AI should add without being asked.

## Why short

Redmine comments are read on a phone, in a list of dozens of other comments,
by people who were not in this session. A comment that pastes full diffs,
full test output, or a full implementation summary is worse than no comment —
it buries the one thing a reader needs (what happened, is it done, where's the
detail if they want it). **Attach or reference files for anything long**
(`plan.md`, `Test-Case-Execution-Report.md`/`.xlsx`, implementation summary) —
never paste their content into the comment body itself.

## Template

```text
<One line: what was done — fix/feature/migration, in plain language.>

Status: <Implemented / Fixed / Blocked — reason / Needs input — question>

Tested: <what was actually run — e.g. "18/18 test cases passed" or
"unit tests only — no environment to verify integration">

Files: <attached or linked file names only — plan.md, test-case-execution-report.xlsx, etc.
Do not paste their contents here.>
```

## Optional AI-generated-information line

Add this only if the user explicitly asks for an "AI-generated" disclosure —
never by default:

```text
Generated with AI assistance; verified against source, tests, and the files above.
```

## Rules

- No assumptions, no hallucination — every claim in the comment must be
  something actually inspected/executed in this session.
- If something was not verified (e.g. no environment to test against), say so
  in the `Status` or `Tested` line rather than omitting it.
- Keep the whole comment under ~6 lines. If there's more to say, that's what
  the attached files are for.
