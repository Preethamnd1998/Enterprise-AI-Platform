# Skills / Knowledge / Standards — Migration Map

**Date:** 2026-10-13. Companion to `SKILLS-KNOWLEDGE-STANDARDS-AUDIT.md` (why) and
`VALIDATION-REPORT.md` (proof it works). This file is the mechanical "what moved where."

## File moves

| From | To | Reason |
|---|---|---|
| `shared/knowledge/architecture/running-locally.md` | `shared/skills/running-locally-skill/SKILL.md` | Misclassified: procedure, not fact |
| `shared/knowledge/custom-flows/abdm/abdm-integration-backend.md` | `shared/skills/abdm-integration-backend/SKILL.md` | Misclassified + wrong filename (not `SKILL.md`, undiscoverable) |
| `shared/knowledge/custom-flows/abdm/abdm-integration-frontend.md` | `shared/skills/abdm-integration-frontend/SKILL.md` | Same |

`shared/knowledge/custom-flows/abdm/` removed (empty after the moves above).

## Files removed (not moved — genuinely redundant)

| File | Why |
|---|---|
| `shared/knowledge/.gitkeep` | Directory has had 15 real files since before this audit |
| `shared/.DS_Store`, `shared/skills/.DS_Store`, `shared/knowledge/.DS_Store`, `shared/standards/.DS_Store` | macOS junk, already `.gitignore`d |

## Files intentionally NOT moved (documented exceptions)

| File | Would belong in | Why left in place |
|---|---|---|
| `shared/knowledge/architecture/saga-tracing.md` | `shared/skills/` (procedure) | Exact path is hash-pinned inside `shared/contract.md`'s kernel section (`shared/contract.md.sha256`, verified by `hash-check.js` fleet-wide). A classification note was added to the file instead of moving it. |

## Content edits (same path, content corrected or annotated)

| File | Change |
|---|---|
| `shared/standards/frontend/pagination.md` | **Bug fix**, verified against live source: `event.page + 1` → `event.page` (0-based, not 1-based); HTTP param `noOfRecord` → `pageSize`. Defaults table (service property names) left unchanged — it was already accurate. |
| `shared/skills/settings-redic-index-db-cache-skill/SKILL.md` | **Correction**, verified against live source: removed `AccessRightsCacheService` as a cited example of "no wrapper library" (it uses `idb`); kept `ConfigMenuService`/`SettingsCacheDB` as the correct examples. |
| `shared/standards/frontend/global-filter-search.md` | **Added** a scope note cross-referencing the knowledge file's 3-subsystem breakdown (this file only covers 1 of 3). |
| `shared/standards/frontend/app-shell-menu-config-cache.md` | **Added** a cross-reference to the settings-cache skill (parallel subsystem) + the verified `idb` fact. |
| `shared/standards/backend/spring.md` | Removed inert `name: spring-skill` / `description:` frontmatter; replaced with a plain header + classification comment. |
| `shared/standards/frontend/angular.md` | Same, `angular-skill`. |
| `shared/standards/mobile/flutter.md` | Same, `flutter-skill`. |
| `shared/standards/migration/semantic-git.md` | Same, `semantic-git-skill`. |
| `shared/skills/abdm-integration-backend/SKILL.md` | Removed dangling `loads-after: spring-enterprise-backend`; replaced with a prose pointer to `shared/standards/backend/spring.md`. |
| `shared/skills/abdm-integration-frontend/SKILL.md` | Removed dangling `loads-after: angular-enterprise-ui`; replaced with a prose pointer to `shared/standards/frontend/angular.md`. |
| `shared/knowledge/architecture/architecture.md` | Fixed 2 broken inbound links after `running-locally.md` moved; added pointer to the new skill. |
| `shared/knowledge/architecture/projects.md` | Fixed 3 broken inbound links after `running-locally.md` moved. |
| `shared/knowledge/architecture/saga-tracing.md` | Added classification note (see "NOT moved" above). |
| `shared/knowledge/custom-flows/upload/CORE_UPLOAD_FRAMEWORK_ARCHITECTURE.md` | Added classification note (sections, not split — see audit §6). |
| `shared/knowledge/custom-flows/upload/RCM-New-Upload-Knowledge.md` | Same. |
| `shared/knowledge/custom-flows/pagination-global-filter/Pagination-Architecture.md` | Added classification note + cross-reference to the standards fix. |
| `shared/knowledge/custom-flows/pagination-global-filter/Global-Filter-Search-Architecture.md` | Added classification note + cross-reference to the standards fix. |
| `shared/company-profile.md` | Removed the ABDM knowledge-table row (content moved to skills); fixed the architecture row's "running locally" claim; added a pointer sentence to `shared/skills/` for procedural content. |
| `shared/skills/README.md` | Added entries for the 3 newly-relocated skills. |
| `PROJECT-STRUCTURE.md` | Added a `shared/knowledge/` tree entry (previously undocumented); added the 5 new/moved skill folders to the `shared/skills/` tree entry. |

## Installer / adapter changes

| File | Change |
|---|---|
| `adapters/claude/install.sh` | Added global install: `shared/knowledge/` → `~/.claude/knowledge/`, `shared/company-profile.md` → `~/.claude/company-profile.md`. |
| `adapters/claude/install.ps1` | Mirrored the same two targets (untested on this machine — no `pwsh`; `.sh` was run for real, see Validation Report). |
| `adapters/claude/file-map.yml` | Added documentation entries for the two new global targets. |

**Not touched:** `adapters/opencode/`, `adapters/copilot/`, `adapters/antigravity/`, and the stub
adapters (`cline`, `cursor`, `roo-code`, `windsurf`, `vscode-agent`, `continue`). The skills-layer
install target added in an earlier session (`shared/skills/` → `~/.claude/skills/`) already
covers OpenCode for free (it natively scans that same path — verified via `opencode debug
skill`). The new knowledge/company-profile targets were added only to the Claude adapter in this
pass; mirroring them to the other adapters' install scripts is a recommended follow-up (see audit
§7), not done here because those scripts could not be executed/verified from this environment.

## Reverting this migration

Every moved file's full original content is preserved verbatim at its new path (diff the
`SKILL.md` body against the git history of the old path to confirm — nothing was summarized or
dropped in a move, only frontmatter/cross-references were edited). To revert a single move:
copy the file back to its old path, restore the frontmatter to what git history shows, and
revert the corresponding lines in `architecture.md`/`projects.md`/`company-profile.md`/
`shared/skills/README.md`/`PROJECT-STRUCTURE.md` listed above. To revert the installer change:
remove the two added blocks from `install.sh`/`install.ps1`/`file-map.yml` listed above.
