# Installer Strategy
**Version:** Sprint 0 — Phase A baseline  
**Status:** Decided (SP-07)  

---

## Approach: File Copies + CI Hash Validation

The installer uses file copies, not symlinks. See `docs/sp-07-result.md` for rationale.

## Copy Targets

| Source (plugin repo) | Destination (consuming repo) | Method |
|---|---|---|
| `shared/contract.md` | `.claude/CLAUDE.md` | Marker injection (between `enterprise-ai-platform:contract:start/end` markers) |
| `shared/standards/**` | `.github/ai-platform/standards/` | Direct copy (recursive) |
| `shared/commands/**` | `.claude/commands/` | Direct copy (recursive) |
| `shared/templates/**` | `.github/ai-platform/templates/` | Direct copy (recursive) |
| `adapters/claude/config/settings.json` | `.claude/settings.json` | Marker injection (between `enterprise-ai-platform:settings:start/end` markers) |
| `adapters/claude/hooks/audit.js` | `.claude/hooks/audit.js` | Direct copy |

## Hash Files Written by Installer

| File | Content |
|---|---|
| `.ai/.contract-hash` | SHA-256 of installed `.claude/CLAUDE.md` contract section |
| `.ai/.standards-hash` | SHA-256 checksum manifest of installed standards files |
| `.ai/.platform-version.json` | Version record (see `docs/platform-version-schema.md`) |

## Idempotency Rules

1. Create `.prev` backup before overwriting any existing file
2. For marker-injection targets: replace ONLY the content between markers; preserve content outside markers
3. Re-running installer on same version = no-op (compare hash before copying)
4. Re-running installer on new version = update + write new hashes

## Session Directory

The installer requires a `.ai/` directory in the consuming repo root:
- `.ai/` is gitignored (add `echo '.ai/' >> .gitignore`)
- Contains runtime-only files (session flags, hashes)
- `.ai/.platform-version.json` is the ONE exception — gittracked (it records installed version)

## CI Drift Gate

`ci/ai-platform-drift.gitlab-ci.yml` script:
1. Read `.ai/.contract-hash`
2. Hash the current `.claude/CLAUDE.md` contract section
3. If mismatch → fail pipeline (platform drift detected)
4. Repeat for standards via `.ai/.standards-hash`

This ensures that if a developer manually edits platform-managed files, CI blocks the MR.
