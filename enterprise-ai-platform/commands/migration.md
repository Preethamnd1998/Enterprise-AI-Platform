---
description: Migrate code between branches from a Redmine/MR/commit/branch/release. mode=exact (smallest diff patch) or mode=functionality (complete capability). No repo scan.
argument-hint: "mode=exact|functionality (mr=!N | commit=SHA | branch=B | release=vX..vY | redmine=ID) target=<branch>"
allowed-tools: Read, Grep, Glob, Edit, Write, Bash, TodoWrite, mcp__redmine-reader__redmine_get_issue, mcp__gitlab-reader__get_merge_request, mcp__gitlab-reader__get_merge_request_diffs, mcp__gitlab-reader__list_merge_request_changed_files, mcp__gitlab-reader__get_merge_request_file_diff, mcp__gitlab-reader__get_commit, mcp__gitlab-reader__get_commit_diff, mcp__gitlab-reader__get_branch_diffs, mcp__gitlab-reader__list_commits, mcp__gitlab-reader__get_file_contents
---

# Command: /migration
<!-- Shared execution contract is loaded via ~/.claude/CLAUDE.md (installed globally). -->

Agent profile: **Migration**. Input: `$ARGUMENTS`. Required: `mode` and `target`.
If `mode` is missing, suggest one (cherry-pick/hotfix/backport → exact; feature/cross-version → functionality) and ask to confirm.

## Shared front-half (BOTH modes)
1. **Discovery** (contract §2): resolve the input to a CHANGE SET. Read source from GitLab, not local.
2. **Diff semantic filter:** from the diffs, drop non-functional hunks — whitespace-only,
   comment-only, brace/format-only, and import-reorder (same import SET, reordered). Keep
   `functionalHunks[]` + `symbolsTouched[]`. (Pure reasoning over hunks — no infra.)
3. **Standards (lazy):** Read `migration/semantic-git.md`, `migration/cherry-pick-rules.md`,
   and the backend/frontend standards for the layers in the change set.

---

## mode=exact  (diff-based, smallest patch)
Use for cherry-pick, hotfix, backport, branch sync.

Workflow:
1. Take `functionalHunks` only.
2. **Compile-gap expansion ONLY:** for each symbol the hunks reference, `get_file_contents`
   on `target`. If it resolves on target → do NOT migrate it. If MISSING → pull that one
   symbol (depth-1). Never expand for "relatedness".
3. Produce the smallest patch (Edit/Write on the local working branch).
4. **Signature-drift probe:** if a referenced symbol exists on target with a DIFFERENT
   signature, warn: "patch may apply but behavior may diverge — consider mode=functionality".

Validation: completeness §7 (applicable) · regression §8 · assert changed files ⊆
{functional-hunk files ∪ compile-deps} (no unrelated movement, no whitespace leakage).
Stop: patch applies AND every referenced symbol resolves on target.
Budget: ≤ 15 files, ≤ 12k tokens, 1 expansion round.

---

## mode=functionality  (capability-based, completeness-first)
Use for feature port, cross-version migration, module replication.

Workflow:
1. Seed = `symbolsTouched`. Read the module boundary + shared-package allowlist from the
   repo's `.claude/CLAUDE.md`.
2. **Bounded capability closure** (repeat until checklist satisfied OR budget hit):
   add files reachable ONLY via
   (a) typed references that LITERALLY APPEAR in already-loaded files, AND
   (b) naming/package conventions (XController→XService→XRepository, XDTO, XMapper,
       X entity, X.component.*, VX__ Flyway),
   filtered by the module boundary. **Never enumerate the repo; never global-grep for related code.**
3. **Delta vs target:** for each capability file, check `target` — skip if identical/compatible;
   migrate in full only if MISSING or DIVERGENT. Cost scales with the source↔target gap.
4. Apply changes to the local working branch.

Anti-scan guarantee: a file enters scope only if loaded content references it or convention
ties it to a loaded symbol, AND it is inside the boundary. Three hard stops: boundary,
delta-vs-target, budget.

Validation: fill `${CLAUDE_PLUGIN_ROOT}/templates/migration-checklist.md` + completeness §7 +
regression §8. Release/backport targets also verify target-compatibility (API/DB/Flyway/permission).
Stop: checklist satisfied OR budget hit → then REPORT GAPS (never silent truncate).
Budget: ≤ 40 files, ≤ 3 rounds, ≤ 40k tokens.

---

## Output (both modes)
Change set · mode · dependency/capability map · migration plan (modify/create/skip) ·
migrated code · validation (checklist + §7 + §8) → PASS/FAIL with gaps · audit line.
Never raw-cherry-pick merge commits; never reformat/refactor unrelated code.
