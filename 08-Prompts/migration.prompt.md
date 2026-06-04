# Migration / Cherry-Pick Prompt (v3 — dual mode)

Operate under `CLAUDE.md`. Run the **Migration** agent profile (`02-Main-Agents/agents.md`,
Agent 4) under `01-Agent-OS/agent-os.md`. Tools per `04-MCP/tool-allowlists.md`.

Input (any one):

- Redmine ID (resolve linked MR/commits)   - Merge Request `!id`
- Commit SHA(s)                              - Branch
- Release range `vX → vY`

Target branch:

{TARGET_BRANCH}

Mode (choose one — required):

- **exact** — diff-based. Migrate only the actual functional changes (drop whitespace,
  comment-only, import-reorder, formatting). Smallest patch; depth-1 only for compile-gaps.
  Use for cherry-pick, hotfix, backport, branch sync.
- **functionality** — capability-based. Migrate the whole capability (all required
  artifacts even if not in the diff), bounded by module boundary + budget; migrate only
  the delta vs target. Use for feature port, cross-version, module replication.

Rules:

- Deterministic discovery from the input (no repo scan). Read source from GitLab, not local.
- Never raw-cherry-pick merge commits; never reformat/refactor unrelated code.

Return:

1. Change set discovered (files + hunks)
2. Mode + dependency/capability map
3. Migration plan (files to modify / create / skip)
4. Migrated code (local branch changes)
5. Validation: `07-Templates/migration-checklist.md` + completeness (§7) + regression (§8) → PASS/FAIL with gaps
