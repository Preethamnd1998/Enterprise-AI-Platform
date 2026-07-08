---
description: Migration — mode=exact (smallest diff patch) or mode=functionality (full capability). No repo scan.
mode: agent
tools: ['codebase', 'search', 'editFiles', 'fetch']
---

# /migration

Follow the shared contract: [.github/ai-platform/shared/contract.md](../ai-platform/shared/contract.md).
Repo profile (boundaries): [.github/ai-platform/REPO.md](../ai-platform/REPO.md).

Input: `${input:args:mode=exact|functionality (mr=!N | commit=SHA | branch=B | release=vX..vY | redmine=ID) target=BRANCH}`.

Shared front-half: deterministic discovery → diff semantic filter (drop whitespace/comment/
import-reorder/format) → lazy-load `standards/migration/*` + touched-layer standards.

- **mode=exact** — functional hunks only; compile-gap depth-1 only (pull a symbol only if
  missing on target); smallest patch; signature-drift probe. Budget ≤ 15 files, ≤ 12k tokens.
- **mode=functionality** — bounded capability closure along real refs + naming conventions,
  inside the module boundary; migrate only the delta vs target; report gaps if budget hit.
  Budget ≤ 40 files, ≤ 3 rounds, ≤ 40k tokens. NEVER enumerate or global-grep the repo.

Validate with `.github/ai-platform/templates/migration-checklist.md` + §7 + §8. Never
raw-cherry-pick merge commits; never reformat unrelated code.
