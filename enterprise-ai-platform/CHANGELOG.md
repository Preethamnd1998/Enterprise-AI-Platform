# Changelog

All notable changes to the Enterprise AI Platform. Versioning: SemVer (see docs).

## [3.0.0] - 2026-06-03
### Added
- Claude Code plugin: `/bug-fix`, `/planning`, `/ui-redesign`, `/migration` (mode=exact|functionality).
- Shared execution contract (single source): discovery, no-scan, depth-1, lazy standards, gates §7+§8, risk, audit.
- Per-command MCP read-only allowlists + global write deny-list.
- Copilot adapters: `copilot-instructions.md` + `/planning /bug-fix /migration /ui-redesign` prompt files.
- PowerShell installers (claude/copilot/both) + updater. GitLab release/versioning workflow.
### Changed
- Collapsed v2 multi-agent chains/workflows/sub-agents into a single execution path.
### Removed
- All v2 policy/workflow/sub-agent files; vector/graph/tree-sitter/embedding plans.
