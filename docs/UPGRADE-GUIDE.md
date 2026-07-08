# Upgrade Guide

**Version:** v4.3.0 | For upgrades to v4.3 from v3.x or v4.x

This guide covers upgrading the Enterprise AI Platform from one version to another. Follow these steps for every platform (Claude Code, Copilot, OpenCode) installed across your fleet.

---

## Before You Upgrade

**Check the current version:**
```powershell
# Platform repo version
Get-Content VERSION

# Per-machine installed version (Claude Code)
Get-Content "$env:USERPROFILE\.claude\.platform-version"

# Per-repo installed version
Get-Content .claude\.platform-version   # Claude Code
Get-Content .github\ai-platform\.platform-version  # Copilot
```

**Read the CHANGELOG:**
Review [CHANGELOG.md](CHANGELOG.md) for changes between your current version and the target. Pay attention to:
- Any contract kernel changes (new SHA-256 hash)
- New or deprecated commands
- Schema version changes (audit log)
- New security rules

---

## Upgrade Procedure

### Step 1 — Pull the Latest Platform

```powershell
cd <enterprise-ai-platform-repo>
git pull origin main
```

Verify the version:
```powershell
Get-Content VERSION
```

---

### Step 2 — Run Global Install (Claude Code)

The global install updates the contract kernel, commands, and standards:

```powershell
pwsh install/install-claude.ps1
```

**What changes:**
- `~/.claude/CLAUDE.md` — contract kernel section updated
- `~/.claude/commands/` — any new or modified commands
- `~/.claude/standards/` — updated standards

**What is preserved:**
- Any existing content in `~/.claude/CLAUDE.md` outside the markers

---

### Step 3 — Run Per-Repo Install for Each Consuming Repo

For each repo that has the platform installed:

```powershell
pwsh install/install-claude.ps1 -RepoPath C:\src\your-service
```

**What changes:**
- `.claude/settings.json` — updated allowlist and hooks (previous backed up to `.prev`)
- `.claude/hooks/audit.js` — updated audit hook
- `.claude/hooks/hash-check.js` — updated hash-check hook
- `.claude/.platform-version` — updated stamp

**What is preserved:**
- `.claude/CLAUDE.md` (module boundaries) — never overwritten
- `.claude/audit/` — audit log history

---

### Step 4 — Update Copilot Repos (if using Copilot adapter)

For each repo with the Copilot adapter:

```powershell
pwsh install/install-copilot.ps1 -RepoPath C:\src\your-service
```

**What changes:**
- `.github/copilot-instructions.md` — refreshed
- `.github/ai-platform/shared/` — refreshed (vendored content)
- `.github/ai-platform/standards/` — refreshed
- `.github/prompts/` — refreshed
- `.github/chatmodes/` — refreshed

**What is preserved:**
- `.github/ai-platform/REPO.md` — never overwritten

**Commit the changes:**
```bash
git -C C:\src\your-service add .github/
git -C C:\src\your-service commit -m "chore: upgrade Enterprise AI Platform to v$(cat VERSION)"
```

---

### Step 5 — Update OpenCode Repos (if using OpenCode adapter)

For each repo with the OpenCode adapter:

```powershell
pwsh adapters/opencode/install.ps1 -RepoPath C:\src\your-service -Force
```

**What changes:**
- `AGENTS.md` — contract kernel section updated
- `.opencode/ai-platform/` — updated
- `.opencode/command/` — updated command shells

**Commit the changes:**
```bash
git -C C:\src\your-service add AGENTS.md .opencode/
git -C C:\src\your-service commit -m "chore: upgrade Enterprise AI Platform to v$(cat VERSION) (OpenCode)"
```

---

### Step 6 — Verify

```powershell
# Verify global install
$content = Get-Content "$env:USERPROFILE\.claude\CLAUDE.md" -Raw
$content -match "Enterprise AI Platform"  # Should be True

# Verify version stamp
Get-Content "$env:USERPROFILE\.claude\.platform-version"  # Should show new version

# Verify per-repo hooks
node .claude/hooks/hash-check.js  # Should exit 0

# Verify audit hook
node .claude/hooks/audit.js --event Stop  # Should exit 0 and write to log.jsonl
```

---

### Step 7 — Test a Command

Open a new Claude Code session and run:
```
/prompt-audit
```

This is the simplest command — no MCP required, just tests that the contract and commands are loaded correctly.

---

## Version-Specific Notes

### Upgrading to v4.3 from v4.2 (Phase E → Phase F)

**Changes:**
- Contract body: §15 and §16 now point to external files (`migration-intelligence.md` and `prompt-quality.md`)
- Kernel: **unchanged** (SHA-256 = `528cdbb2d505296fd54b189bb7eb0bccbaef8c6886099aa3a853081c10cf463c`)
- New file: `shared/company-profile.md` — no action required for existing installs
- New file: `docs/fleet-rollout.md` — no action required

**Action required:**
```powershell
# Re-run global install (updates command files + standards)
pwsh install/install-claude.ps1

# Re-run per-repo install (updates settings.json + hooks)
pwsh install/install-claude.ps1 -RepoPath <path>
```

### Upgrading to v4.2 from v4.1 (Phase D → Phase E)

**Changes:**
- Contract kernel: **changed** — new SHA-256 = `528cdbb2...`
- `audit.js`: bumped to schema v1.1 (5 new telemetry fields)
- New file: `GOVERNANCE.md`
- New file: `docs/hitl-matrix.md`

**Action required:** Re-run global and per-repo installs. Existing `log.jsonl` entries remain valid (schema allows both v1.0 and v1.1).

### Upgrading to v4.1 from v4.0 (Phase C → Phase D)

**Changes:**
- Contract kernel: **changed** — lazy rules loading paragraph added
- 4 new rules files in `shared/rules/`
- 5 new AI context templates in `shared/templates/ai/`
- `/prompt-audit` command added

**Action required:** Re-run both global and per-repo installs.

### Upgrading to v4.0 from v3.2 (Phase B → Phase C)

**Changes:**
- `/test` command added
- `audit.js` updated to schema v1.0 (full JSONL)
- `settings.json` updated with PostToolUse hook

**Action required:** Re-run per-repo install (PostToolUse hook must be registered).

### Upgrading to v3.2 from v3.1 (Phase A → Phase B)

**Changes:**
- MCP `${env:}` injection introduced (replaces literal secrets)
- Copilot adapter added

**Critical action:** If you have literal secrets in `.mcp.json`, migrate them to environment variables before upgrade. See `docs/secrets.md`.

### Upgrading from v3.0 (denylist) to v3.1+ (allowlist)

This is a breaking security change. The denylist (`deny: [53 named entries]`) is replaced by the allowlist (`allow: [28 entries]` + `deny: ["mcp__*"]`).

```powershell
# Run the migration script first
pwsh tools/migrate-settings.ps1 -RepoPath C:\src\your-service

# Then re-run the per-repo install
pwsh install/install-claude.ps1 -RepoPath C:\src\your-service
```

---

## Fleet Upgrade

To upgrade all repos at once:

1. Update `tools/repos.txt` to include all consuming repos
2. Run the fleet rollout with `-Mode both`:

```powershell
# Dry-run first
pwsh tools/rollout-fleet.ps1 -ReposFile tools/repos.txt -Mode both -DryRun

# Then live
pwsh tools/rollout-fleet.ps1 -ReposFile tools/repos.txt -Mode both
```

The rollout opens one MR per repo. Repo owners review and merge.

See [docs/fleet-rollout.md](docs/fleet-rollout.md) for the full fleet upgrade procedure.

---

## Rollback

If an upgrade causes problems:

```powershell
# Option A: Restore .prev files (per-repo settings)
Copy-Item .claude\settings.json.prev .claude\settings.json -Force

# Option B: Restore from git
git checkout HEAD~1 -- .claude/
git checkout HEAD~1 -- .github/

# Option C: Re-run installer with older platform version
git checkout <older-version-tag>
pwsh install/install-claude.ps1 -RepoPath C:\src\your-service
```

See [docs/rollback.md](docs/rollback.md) for all rollback scenarios.
