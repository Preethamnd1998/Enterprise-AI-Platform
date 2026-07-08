# SP-07 Result — Installer Strategy: File Copies vs Symlinks vs Stubs
**Spike ID:** SP-07  
**Status:** ✅ COMPLETE — BLK-03 (SP-07) CLOSED  
**Engineer:** Platform Verification Board  
**Date:** 2026-07-07  

---

## Question
How should the installer distribute shared assets to consuming repos? Options: file copies, symlinks, or stubs. Cross-platform requirement: Windows 11 (primary), Linux/macOS (CI).

## Evidence Gathered

### 1. Windows symlinks require elevated privileges
On Windows 11 Pro (confirmed OS in this environment):
- Creating a symlink via `New-Item -ItemType SymbolicLink` OR `mklink` requires either:
  - Developer Mode enabled (`Settings > Privacy & Security > For Developers > Developer Mode`), OR
  - Running PowerShell / shell as Administrator
- Neither can be assumed for all consuming-repo developers
- CI runners (GitLab Shared / GitHub Actions) do NOT have Developer Mode enabled by default
- A repo that requires admin for `install.ps1` fails the "zero-friction install" goal

### 2. Cross-platform symlink behavior varies
| Platform | Symlink support | Admin required |
|---|---|---|
| Windows 11 (non-admin) | ❌ Requires Developer Mode or admin | Yes |
| Windows 11 (admin/Dev Mode) | ✓ Supported | Sort of |
| Linux | ✓ Always | No |
| macOS | ✓ Always | No |

A plugin that works on Linux/macOS with symlinks but fails on Windows without Developer Mode is not portable.

### 3. File copies are universally safe
- No privilege escalation required on any platform
- `Copy-Item` (PowerShell) / `cp` (bash) work on all platforms without special permissions
- No symlink resolution needed at runtime (MCP clients, hook scripts, dotnet tooling all read files directly)
- Immutable snapshot at install time — consuming repo cannot accidentally mutate shared assets

### 4. The drift validation approach mitigates staleness
The FMS (Final Master Specification) already defines:
- `tools/check-drift.ps1` — verifies installed file hashes match source at install time
- `ci/ai-platform-drift.gitlab-ci.yml` — CI drift gate blocks merges with stale platform files
- `.ai/.contract-hash` — installer writes expected SHA-256; `PreToolUse` hook verifies on session start

These three mechanisms together ensure:
1. Installer writes hash alongside copied file
2. CI detects if copy diverges from shared source between releases
3. Session start verifies contract kernel has not been tampered with

---

## Decision

**✅ Use FILE COPIES with CI hash validation. No symlinks.**

### Strategy:

```
shared/contract.md  ──copy──▶  consuming-repo/.claude/CLAUDE.md (via marker injection)
shared/standards/   ──copy──▶  consuming-repo/.github/ai-platform/standards/
shared/commands/    ──copy──▶  consuming-repo/.claude/commands/
shared/templates/   ──copy──▶  consuming-repo/.github/ai-platform/templates/
```

Copy mechanism: idempotent marker injection for text files (replace-in-markers); direct overwrite for binary/generated files.

Hash tracking:
```
shared/contract.md  ──sha256──▶  consuming-repo/.ai/.contract-hash  (installer writes)
shared/standards/   ──sha256──▶  consuming-repo/.ai/.standards-hash  (installer writes)
```

Drift detection (CI):
```yaml
# ci/ai-platform-drift.gitlab-ci.yml
check-platform-drift:
  script:
    - pwsh -File tools/check-drift.ps1
  rules:
    - if: $CI_PIPELINE_SOURCE == "merge_request_event"
```

### What this means for the installer (Phase A):
1. `install-claude.ps1` copies files, writes `.ai/*.hash` files, writes `.ai/.platform-version.json`
2. No symlink creation — safe to run without admin on Windows
3. Re-running `install-claude.ps1` is idempotent (creates `.prev` backup, re-copies)

---

## See Also
`shared/installer/STRATEGY.md` — operational installer design document (created in TK-006)

---

## Rollback
If a copy is corrupted:
1. Re-run `install-claude.ps1 -Force`
2. The installer creates `.claude/CLAUDE.md.prev` before overwriting

---

## Blockers Closed
- **BLK-03 (SP-07)**: Closed. Symlinks rejected due to Windows privilege requirements; file copies confirmed portable.

## Board Updates Required
- BLK-03: CLOSED
- ADR-07: Add note: symlinks rejected, copies confirmed
- FT-030: Unblocked (installer implementation can proceed in Phase A)
