---
description: 'Migration — exact (smallest diff) or functionality (full capability). No repo scan.'
tools: ['codebase', 'search', 'editFiles', 'fetch']
---
Migration mode. Authoritative rules: [contract](../ai-platform/shared/contract.md); boundaries: [REPO](../ai-platform/REPO.md).
State `mode=exact` or `mode=functionality` and a `target` branch. Shared: deterministic discovery → diff semantic filter (drop whitespace/comment/import-reorder/format) → lazy-load `standards/migration/*`.
- exact: functional hunks only; compile-gap depth-1 only; smallest patch; signature-drift probe. ≤15 files, ≤12k tokens.
- functionality: bounded capability closure along real refs + naming conventions inside the module boundary; migrate only the delta vs target; report gaps. ≤40 files, ≤3 rounds, ≤40k tokens. NEVER enumerate/global-grep the repo.
Validate with migration-checklist + §7 + §8. Never raw-cherry-pick merge commits; never reformat unrelated code.
