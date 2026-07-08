# File Migration Map — Current → Target Repo Structure
**Task:** TK-009 + TK-010 (US-006, V-E1)  
**Status:** ✅ COMPLETE — BLK-05 CLOSED (map) · ✅ FLATTEN EXECUTED 2026-07-08 (see `MASTER-PROJECT-BOARD.md`)  
**Date:** 2026-07-07 (map written) · 2026-07-08 (executed, manually, not via `tools/flatten-repo.sh`)  

> **Execution note (2026-07-08):** Section 1's flatten decision was carried out — the nested
> `enterprise-ai-platform/enterprise-ai-platform/` subdirectory no longer exists. The actual
> execution differed from this map in one respect: the outer `README.md`/`contributing.md`
> stayed-as-is assumption in §1 and in `tools/flatten-repo.sh` was superseded — the newer
> v4.3.0 inner docs were promoted instead of keeping the old outer ones, per explicit
> instruction at execution time. Sections 3–4 (commands/standards duplicates) were already
> closed in an earlier RC1 hardening pass. `install/.github/` duplicates beyond `standards/`
> (§8) and `repo-template/` (§9) were NOT deleted — still open, see `MASTER-PROJECT-BOARD.md`.

---

## Overview

The current repo has a **nested double-directory** problem:
```
D:/enterprise-ai-platform/                  ← git repo root
└── enterprise-ai-platform/                 ← INNER — actual platform code lives here
```

**Decision:** Flatten. All platform code moves to the git repo root. The `enterprise-ai-platform/enterprise-ai-platform/` subdirectory is eliminated.

The migration also restructures `shared/`, `adapters/`, and removes duplicate install targets.

---

## Migration Action Legend
| Action | Meaning |
|---|---|
| KEEP | No path change; content may be updated in-sprint |
| MOVE | Path changes; content preserved |
| MERGE | Fold into another file; source deleted |
| DELETE | Remove permanently |
| GENERATE | Replace hand-maintained file with installer-generated output |
| NEW | Does not exist yet; to be created in Phase A–F |

---

## Section 1 — Outer Root Files

Path prefix: `D:/enterprise-ai-platform/` (git repo root — stays at root after flatten)

| Current Path | Action | Target Path | Notes |
|---|---|---|---|
| `.github/copilot-instructions.md` | DELETE | — | Duplicate of inner adapter; removed in Phase A |
| `Enterprise_AI_Platform_User_Guide.docx` | KEEP | `Enterprise_AI_Platform_User_Guide.docx` | User documentation |
| `README.md` | KEEP | `README.md` | Update content to reflect new structure |
| `context/.gitignore` | MERGE | `.gitignore` | Merge with inner .gitignore; source deleted |
| `context/README.md` | DELETE | — | Superseded by root README.md |
| `context/context.path` | DELETE | — | Internal tool artifact; no value |
| `context/design.md` | DELETE | — | Superseded by PLATFORM-VERIFICATION-REPORT.md and FMS |
| `context/logs.md` | DELETE | — | Execution logs; not source content |
| `contributing.md` | KEEP | `contributing.md` | |
| `project-structure.md` | KEEP | `project-structure.md` | Update to reflect target structure |
| `prompt-guide.md` | MOVE | `docs/prompt-guide.md` | Belongs with docs |
| `usage-instructions.md` | MOVE | `docs/usage-instructions.md` | Belongs with docs |

---

## Section 2 — Inner Root Files

Path prefix: `D:/enterprise-ai-platform/enterprise-ai-platform/` → promoted to repo root

| Current Path | Action | Target Path | Notes |
|---|---|---|---|
| `CHANGELOG.md` | KEEP | `CHANGELOG.md` | Updated this sprint |
| `VERSION` | KEEP | `VERSION` | |
| `.gitlab-ci.yml` | KEEP | `.gitlab-ci.yml` | Update `include:` paths |
| `.claude-plugin/plugin.json` | KEEP | `.claude-plugin/plugin.json` | Fix D5 marketplace metadata in Phase A |
| `.claude-plugin/marketplace.json` | KEEP | `.claude-plugin/marketplace.json` | Fix D5 in Phase A |

---

## Section 3 — Commands (D1/D2 fix)

Current: `commands/` (5 files, no registry, `/planning` and `/ui-redesign` phantom commands in docs)  
Target: `shared/commands/` (7 files + registry.yml)

| Current Path | Action | Target Path | Notes |
|---|---|---|---|
| `commands/bug-fix.md` | MOVE | `shared/commands/bug-fix.md` | |
| `commands/migration.md` | MOVE | `shared/commands/migration.md` | |
| `commands/new-development.md` | MOVE | `shared/commands/new-development.md` | |
| `commands/data-correction.md` | MOVE | `shared/commands/data-correction.md` | |
| `commands/ui-design-update.md` | MOVE | `shared/commands/ui-design-update.md` | |
| — | NEW | `shared/commands/registry.yml` | Machine-readable command list; fixes D1 |
| — | NEW | `shared/commands/test.md` | Phase C |
| — | NEW | `shared/commands/prompt-audit.md` | Phase C |

---

## Section 4 — Standards

Current: `standards/` at inner root  
Target: `shared/standards/`

| Current Path | Action | Target Path | Notes |
|---|---|---|---|
| `standards/coding-standards.md` | MOVE | `shared/standards/coding-standards.md` | |
| `standards/backend/controller.md` | MOVE | `shared/standards/backend/controller.md` | |
| `standards/backend/service.md` | MOVE | `shared/standards/backend/service.md` | |
| `standards/backend/repository.md` | MOVE | `shared/standards/backend/repository.md` | |
| `standards/backend/entity.md` | MOVE | `shared/standards/backend/entity.md` | |
| `standards/backend/dto-mapper-enum.md` | MOVE | `shared/standards/backend/dto-mapper-enum.md` | |
| `standards/backend/common-api.md` | MOVE | `shared/standards/backend/common-api.md` | |
| `standards/backend/spring.md` | MOVE | `shared/standards/backend/spring.md` | |
| `standards/frontend/component.md` | MOVE | `shared/standards/frontend/component.md` | |
| `standards/frontend/service.md` | MOVE | `shared/standards/frontend/service.md` | |
| `standards/frontend/custom-components.md` | MOVE | `shared/standards/frontend/custom-components.md` | |
| `standards/frontend/pagination.md` | MOVE | `shared/standards/frontend/pagination.md` | |
| `standards/frontend/others.md` | MOVE | `shared/standards/frontend/others.md` | |
| `standards/frontend/angular.md` | MOVE | `shared/standards/frontend/angular.md` | |
| `standards/migration/semantic-git.md` | MOVE | `shared/standards/migration/semantic-git.md` | |
| `standards/migration/cherry-pick-rules.md` | MOVE | `shared/standards/migration/cherry-pick-rules.md` | |
| — | NEW | `shared/standards/testing.md` | Phase C |

---

## Section 5 — Templates

Current: `templates/` at inner root  
Target: `shared/templates/`

| Current Path | Action | Target Path | Notes |
|---|---|---|---|
| `templates/migration-checklist.md` | MOVE | `shared/templates/migration-checklist.md` | |
| `templates/redesign-checklist.md` | MOVE | `shared/templates/redesign-checklist.md` | |

---

## Section 6 — Shared Layer

Current: `shared/` has only `contract.md`  
Target: `shared/` is the full canonical asset layer

| Current Path | Action | Target Path | Notes |
|---|---|---|---|
| `shared/contract.md` | KEEP | `shared/contract.md` | Already canonical; no move needed |
| — | NEW | `shared/installer/STRATEGY.md` | Done (Sprint 0, TK-006) |
| — | NEW | `shared/mcp/` | Phase B |
| — | NEW | `shared/rules/` | Phase D |
| — | NEW | `shared/prompts/` | Phase D |
| — | NEW | `shared/reports/` | Phase D |
| — | NEW | `shared/knowledge/` | Phase D |

---

## Section 7 — Adapters

### 7a — Claude Adapter (NEW from repo-template)

Current: `repo-template/.claude/` contains the Claude adapter assets but in wrong location  
Target: `adapters/claude/` (8-glue-file pattern)

| Current Path | Action | Target Path | Notes |
|---|---|---|---|
| `repo-template/.claude/settings.json` | MOVE | `adapters/claude/config/settings.json` | Rewrite to allowlist (Phase A, Sprint 1) |
| `repo-template/.claude/CLAUDE.md` | MOVE | `adapters/claude/templates/CLAUDE.md` | Template for marker injection |
| `repo-template/.claude/hooks/audit.js` | MOVE | `adapters/claude/hooks/audit.js` | Keep; update hook for PreToolUse |
| `install/install-claude.ps1` | MOVE | `adapters/claude/install.ps1` | Refactor to use shared/installer/ engine |
| `repo-template/ci/ai-platform-drift.gitlab-ci.yml` | MOVE | `ci/ai-platform-drift.gitlab-ci.yml` | Promote to shared CI |
| — | NEW | `adapters/claude/capability-map.yml` | Phase A |
| — | NEW | `adapters/claude/compat.md` | Phase A |
| — | NEW | `adapters/claude/validate.ps1` | Phase A |
| — | NEW | `adapters/claude/upgrade.md` | Phase A |

### 7b — Copilot Adapter (refactor to GENERATE pattern)

Current: `adapters/copilot/` is hand-maintained with phantom commands (D1/D2)  
Target: `adapters/copilot/` uses installer-generated output, no hand-maintained content

| Current Path | Action | Target Path | Notes |
|---|---|---|---|
| `adapters/copilot/copilot-instructions.md` | GENERATE | `adapters/copilot/config/copilot-instructions.md` | Content generated from shared/contract.md + shared/commands/registry.yml |
| `adapters/copilot/chatmodes/bug-fix.chatmode.md` | GENERATE | `adapters/copilot/templates/chatmodes/bug-fix.chatmode.md` | Generated from shared/commands/bug-fix.md |
| `adapters/copilot/chatmodes/migration.chatmode.md` | GENERATE | `adapters/copilot/templates/chatmodes/migration.chatmode.md` | Generated |
| `adapters/copilot/chatmodes/PLANNING.chatmode.md` | DELETE | — | D2: phantom command; no /planning in final spec |
| `adapters/copilot/chatmodes/UI-REDESIGN.chatmode.md` | DELETE | — | D2: phantom command; no /ui-redesign in final spec |
| `adapters/copilot/prompts/bug-fix.prompt.md` | GENERATE | `adapters/copilot/templates/prompts/bug-fix.prompt.md` | Generated |
| `adapters/copilot/prompts/migration.prompt.md` | GENERATE | `adapters/copilot/templates/prompts/migration.prompt.md` | Generated |
| `adapters/copilot/prompts/PLANNING.prompt.md` | DELETE | — | D2: phantom command |
| `adapters/copilot/prompts/UI-REDESIGN.prompt.md` | DELETE | — | D2: phantom command |
| `install/install-copilot.ps1` | MOVE | `adapters/copilot/install.ps1` | Refactor to use shared/installer/ engine |
| — | NEW | `adapters/copilot/capability-map.yml` | Phase A |
| — | NEW | `adapters/copilot/compat.md` | Phase A |
| — | NEW | `adapters/copilot/validate.ps1` | Phase A |
| — | NEW | `adapters/copilot/upgrade.md` | Phase A |

### 7c — OpenCode Adapter (NEW — Phase C)

| Current Path | Action | Target Path | Notes |
|---|---|---|---|
| — | NEW | `adapters/opencode/` | All 8 glue files; Phase C |

---

## Section 8 — Install Directory (eliminate / redistribute)

The `install/` directory is the current installer. It gets refactored: PowerShell engine moves to `shared/installer/`, adapter-specific scripts go into `adapters/*/install.ps1`, duplicated assets get deleted.

| Current Path | Action | Target Path | Notes |
|---|---|---|---|
| `install/_common.ps1` | MOVE + REFACTOR | `shared/installer/engine.ps1` | Core installer functions shared by all adapters |
| `install/install-both.ps1` | MOVE | `install.ps1` (repo root) | New unified entry point |
| `install/install-claude.ps1` | MOVE | `adapters/claude/install.ps1` | See §7a |
| `install/install-copilot.ps1` | MOVE | `adapters/copilot/install.ps1` | See §7b |
| `install/update-platform.ps1` | MOVE | `tools/update-platform.ps1` | |
| `install/.github/ai-platform/shared/contract.md` | DELETE | — | Duplicate of `shared/contract.md` |
| `install/.github/ai-platform/standards/**` | DELETE | — | Duplicate of `standards/` (moved to `shared/standards/`) |
| `install/.github/ai-platform/templates/**` | DELETE | — | Duplicate of `templates/` (moved to `shared/templates/`) |
| `install/.github/ai-platform/REPO.md` | MOVE | `shared/templates/ai-project-template/REPO.md` | |
| `install/.github/ai-platform/.platform-version` | MOVE | `shared/templates/.platform-version.template.json` | Seed template; installer generates actual file |
| `install/.github/chatmodes/**` | DELETE | — | D1: duplicates; adapter generates from shared/ |
| `install/.github/prompts/**` | DELETE | — | D1: duplicates; adapter generates from shared/ |
| `install/.github/copilot-instructions.md` | DELETE | — | D1: duplicate |

---

## Section 9 — Repo-Template Directory (eliminate)

The `repo-template/` directory is the installer source for the Claude adapter. Its contents migrate to `adapters/claude/` and `ci/`.

| Current Path | Action | Target Path | Notes |
|---|---|---|---|
| `repo-template/.claude/CLAUDE.md` | MOVE | `adapters/claude/templates/CLAUDE.md` | See §7a |
| `repo-template/.claude/settings.json` | MOVE | `adapters/claude/config/settings.json` | See §7a |
| `repo-template/.claude/hooks/audit.js` | MOVE | `adapters/claude/hooks/audit.js` | See §7a |
| `repo-template/.github/ai-platform/REPO.md` | MERGE | `shared/templates/ai-project-template/REPO.md` | Same as install/.github/ai-platform/REPO.md |
| `repo-template/ci/ai-platform-drift.gitlab-ci.yml` | MOVE | `ci/ai-platform-drift.gitlab-ci.yml` | See §7a |

After migration: `repo-template/` directory is EMPTY — delete it.

---

## Section 10 — CI Directory

| Current Path | Action | Target Path | Notes |
|---|---|---|---|
| `ci/release-check.sh` | KEEP | `ci/release-check.sh` | Update paths |
| `ci/validate.sh` | KEEP | `ci/validate.sh` | Update paths |
| `repo-template/ci/ai-platform-drift.gitlab-ci.yml` | MOVE | `ci/ai-platform-drift.gitlab-ci.yml` | See §7a |

---

## Section 11 — Docs Directory

| Current Path | Action | Target Path | Notes |
|---|---|---|---|
| `docs/audit-and-metrics.md` | KEEP | `docs/audit-and-metrics.md` | |
| `docs/boundary-examples.md` | KEEP | `docs/boundary-examples.md` | |
| `docs/example-executions.md` | KEEP | `docs/example-executions.md` | |
| `docs/installation.md` | KEEP | `docs/installation.md` | Update for new structure |
| `docs/mcp-setup.md` | KEEP | `docs/mcp-setup.md` | Update for allowlist |
| `docs/repo-onboarding.md` | KEEP | `docs/repo-onboarding.md` | Update for new install entry point |
| — | NEW | `docs/sp-01-result.md` | Done (Sprint 0) |
| — | NEW | `docs/sp-02-result.md` | Done (Sprint 0) |
| — | NEW | `docs/sp-07-result.md` | Done (Sprint 0) |
| — | NEW | `docs/platform-version-schema.md` | Done (Sprint 0) |
| — | NEW | `docs/file-migration-map.md` | This file |
| — | NEW | `docs/phase-dod.md` | Sprint 0 TK-011 |
| `prompt-guide.md` | MOVE | `docs/prompt-guide.md` | From outer root |
| `usage-instructions.md` | MOVE | `docs/usage-instructions.md` | From outer root |

---

## Section 12 — Tools Directory

| Current Path | Action | Target Path | Notes |
|---|---|---|---|
| `tools/check-drift.ps1` | KEEP | `tools/check-drift.ps1` | Update for new paths |
| `tools/rollout-fleet.ps1` | KEEP | `tools/rollout-fleet.ps1` | |
| `install/update-platform.ps1` | MOVE | `tools/update-platform.ps1` | |

---

## Target Directory Tree (Phase A baseline)

After Sprint 1 migration completes, the repo root looks like:

```
enterprise-ai-platform/
├── .claude-plugin/
│   ├── plugin.json
│   └── marketplace.json
├── .gitlab-ci.yml
├── CHANGELOG.md
├── VERSION
├── README.md
├── contributing.md
├── project-structure.md
├── install.ps1                         ← was install/install-both.ps1
│
├── shared/
│   ├── contract.md                     ← unchanged location
│   ├── commands/
│   │   ├── registry.yml                ← NEW
│   │   ├── bug-fix.md
│   │   ├── migration.md
│   │   ├── new-development.md
│   │   ├── data-correction.md
│   │   └── ui-design-update.md
│   ├── standards/
│   │   ├── coding-standards.md
│   │   ├── backend/
│   │   ├── frontend/
│   │   └── migration/
│   ├── templates/
│   │   ├── migration-checklist.md
│   │   ├── redesign-checklist.md
│   │   └── ai-project-template/
│   └── installer/
│       ├── STRATEGY.md                 ← done Sprint 0
│       └── engine.ps1                  ← Phase A
│
├── adapters/
│   ├── claude/
│   │   ├── install.ps1
│   │   ├── config/settings.json        ← allowlist template
│   │   ├── templates/CLAUDE.md         ← injection template
│   │   ├── hooks/audit.js
│   │   ├── capability-map.yml
│   │   ├── compat.md
│   │   ├── validate.ps1
│   │   └── upgrade.md
│   ├── copilot/
│   │   ├── install.ps1
│   │   ├── config/copilot-instructions.md
│   │   ├── templates/
│   │   │   ├── chatmodes/
│   │   │   └── prompts/
│   │   ├── capability-map.yml
│   │   ├── compat.md
│   │   ├── validate.ps1
│   │   └── upgrade.md
│   └── opencode/                       ← Phase C
│
├── ci/
│   ├── release-check.sh
│   ├── validate.sh
│   └── ai-platform-drift.gitlab-ci.yml ← from repo-template/ci/
│
├── docs/
│   ├── audit-and-metrics.md
│   ├── boundary-examples.md
│   ├── example-executions.md
│   ├── installation.md
│   ├── mcp-setup.md
│   ├── repo-onboarding.md
│   ├── sp-01-result.md
│   ├── sp-02-result.md
│   ├── sp-07-result.md
│   ├── platform-version-schema.md
│   ├── file-migration-map.md
│   ├── phase-dod.md
│   ├── prompt-guide.md
│   └── usage-instructions.md
│
└── tools/
    ├── check-drift.ps1
    ├── rollout-fleet.ps1
    └── update-platform.ps1
```

---

## Migration Execution Plan

Migration is done in Phase A (Sprint 1). Not Sprint 0 — Sprint 0 only produces this map.

### Phase A Migration Steps (Sprint 1, TK-012 onward)
1. Create new directory scaffold (`shared/commands/`, `shared/standards/`, etc.)
2. Move commands, standards, templates to `shared/`
3. Create `adapters/claude/` from `repo-template/.claude/`
4. Create `adapters/copilot/` refactored from current `adapters/copilot/`
5. Delete D1/D2 duplicates (planning/ui-redesign phantom commands)
6. Delete `install/` duplicates
7. Delete `repo-template/` (empty after moves)
8. Update `.gitlab-ci.yml` include paths
9. Run `ci/validate.sh` to confirm no dangling references
10. Run `tools/check-drift.ps1` to confirm drift gate operates on new paths

### Rollback (if Phase A migration fails at any step)
- Git reset `--hard` to last commit before migration starts
- All moves are tracked in git — no permanent data loss risk
- Each step should be a separate commit with a clear message

---

## Blockers Closed
- **BLK-05**: Closed. Full current→target file migration map produced.

## Board Updates Required
- BLK-05: CLOSED
- BUG-A2 (V-E1): CLOSED
- EP-01: Unblocked (can proceed in Sprint 1)
- FT-002, FT-003: Unblocked
