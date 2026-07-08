# Fleet Rollout Guide (Phase F — v4.3)
<!-- docs/fleet-rollout.md — US-055 / TK-116
     Canary process and full fleet rollout procedure for rollout-fleet.ps1 -->

## Overview

The fleet rollout applies the Enterprise AI Platform to all consuming repositories
via automated installer runs, single-commit branches, and GitLab MRs opened by `glab`.
All changes are code-reviewable before merge — the script never merges automatically.

## Prerequisites

| Requirement | Check |
|---|---|
| PowerShell 7+ | `pwsh --version` |
| git CLI on PATH | `git --version` |
| glab CLI authenticated | `glab auth status` |
| Platform repo cloned locally | `ls shared/contract.md` from platform root |
| repos.txt populated | `cat tools/repos.txt` — at least 1 real URL |
| VERSION file correct | `cat VERSION` — should match the intended rollout version |

## Step 1 — Canary (Dry-Run)

Run against the full repos.txt without making any git changes:

```powershell
cd <platform-root>
pwsh tools/rollout-fleet.ps1 -ReposFile tools/repos.txt -Mode both -DryRun
```

Expected output:
```
==> DRY-RUN mode — no git writes or MRs will be created
==> [<repo-name>] https://...
  DRY-RUN: would clone ... to ...
  DRY-RUN: would run install\install-both.ps1 on ..., commit + push + open MR
==> Rollout complete: 0 succeeded · N skipped · 0 failed
Re-run without -DryRun to execute.
```

If any repo line causes an error in dry-run mode, fix repos.txt before proceeding.

## Step 2 — Single-Repo Canary (Live)

Run against ONE repo first to validate the full pipeline:

```powershell
# Create a single-repo test file
"https://<gitlab-host>/<group>/<canary-repo>.git" | Set-Content tools/repos-canary.txt

pwsh tools/rollout-fleet.ps1 -ReposFile tools/repos-canary.txt -Mode both
```

Verify:
1. Branch `chore/ai-platform-v<VERSION>` exists in the target repo
2. `.claude/CLAUDE.md` and `.github/ai-platform/shared/contract.md` are present and correct
3. GitLab MR is open with the correct title and description
4. MR diff contains only platform files (no source code changes)

If the canary repo validates, proceed to the full fleet.

## Step 3 — Full Fleet Rollout

```powershell
pwsh tools/rollout-fleet.ps1 -ReposFile tools/repos.txt -Mode both
```

The script is idempotent — repos where no changes are needed after install are skipped
automatically (logged as "No changes after install").

## Step 4 — Verify MRs

After the script completes:
1. Open GitLab and confirm one MR exists per repo in repos.txt
2. Each MR branch: `chore/ai-platform-v<VERSION>`
3. Assign MRs to the relevant repo owners for review and merge

## Rollback

If the fleet rollout needs to be undone, see `docs/rollback.md` Scenario 12
(Roll back rollout tooling). Each consuming repo has an independent commit history —
revert or close the MR in each repo individually.

## Fleet MR Process (Confirmed)

Each MR opened by `rollout-fleet.ps1` follows this lifecycle:

| Stage | Who | Action |
|---|---|---|
| Branch created | Automation | `chore/ai-platform-v<VERSION>` pushed to target repo |
| MR opened | glab CLI | Title: `chore: adopt Enterprise AI Platform v<VERSION>` |
| Review | Repo owner | Inspect `.claude/CLAUDE.md` and `.github/ai-platform/` diff |
| Approval | Repo owner | Standard GitLab approval process |
| Merge | Repo owner | Squash or merge commit — repo owner's choice |
| Verification | Platform team | Confirm `.platform-version.json` present in merged branch |

**MR reviewer checklist:**
- [ ] `.claude/CLAUDE.md` contents match expected contract kernel
- [ ] `.github/ai-platform/shared/contract.md` matches platform source
- [ ] No source code in the diff (only platform files: `.claude/`, `.github/ai-platform/`)
- [ ] `.mcp.json` NOT in the diff (gitignored — secrets stay local)
- [ ] `.platform-version.json` present with correct version and channel

## Notes

- The script never merges — all MRs require human approval and merge
- `repos.txt` lines starting with `#` or blank lines are ignored
- If `glab` is not installed, the branch is pushed but the MR must be opened manually
- Run with `-Mode claude` or `-Mode copilot` to install only one adapter
- Use `-Branch <name>` to override the default branch name (`chore/ai-platform-v<VERSION>`)
