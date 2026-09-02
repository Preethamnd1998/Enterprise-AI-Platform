# Redmine Plan-Approval Comment Template

> Use when a plan has cleared review (e.g. the Plan Reviewer skill returned
> "Approved for implementation") and the user explicitly asks to post that
> approval to the Redmine issue. Never post proactively.

Every plan approval gets the same short, consistent comment — so anyone
scanning ticket history can recognize an approval at a glance without reading
the full plan.

## Template

```text
Plan reviewed and approved for implementation.

Problem understanding: <N>/100
Code understanding: <N>/100
Test plan: <N>/100
Confidence: <N>/100

Files: plan.md, test-cases.xlsx
```

## If not approved (score below threshold)

Do not post an approval comment. If the user asks for a status update on a
not-yet-approved plan, use the execution-comment template
(`redmine-execution-comment.md`) instead, with `Status: Needs revision` and a
one-line reason — not this template.

## Rules

- Scores come from the actual Plan Reviewer output for this plan — never
  invented or rounded up.
- Reference the plan/test-case files by name; do not paste their content into
  the comment.
