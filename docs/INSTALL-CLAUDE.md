# Installation Guide — Claude Code

**Platform:** Claude Code | **Version:** v4.3.0 | **Capability:** Full

This is the complete installation guide for the Enterprise AI Platform on Claude Code. Claude Code is the primary and recommended platform — it provides the full security posture including MCP allowlist enforcement, contract hash-check, and session audit logging.

---

## Prerequisites

| Tool | Minimum | Check | Install |
|---|---|---|---|
| Claude Code CLI | ≥ 1.0.0 | `claude --version` | `npm install -g @anthropic-ai/claude-code` |
| Node.js | ≥ 18.0 | `node --version` | [nodejs.org](https://nodejs.org) |
| PowerShell | ≥ 5.1 (Windows built-in) or pwsh 7+ | `$PSVersionTable.PSVersion` | Windows built-in; [PowerShell 7 releases](https://github.com/PowerShell/PowerShell/releases) optional |
| Git | ≥ 2.40 | `git --version` | [git-scm.com](https://git-scm.com) |

> **Windows:** Both `powershell.exe` (5.1, built in) and `pwsh` (7+) work — the installer scripts are ASCII-only and use no version-specific syntax.
> **Admin rights:** Not required. All files install to your user profile.

---

## Supported Versions

| Component | Version |
|---|---|
| Platform | v4.3.0 |
| Contract kernel SHA-256 | `528cdbb2d505296fd54b189bb7eb0bccbaef8c6886099aa3a853081c10cf463c` |
| Audit schema | v1.1 |
| MCP allowed tools | 28 tools across 4 servers |

---

## Architecture — What Gets Installed

```
~/.claude/                         # Global (one install per machine)
├── CLAUDE.md                      # Contract kernel — loaded every CC session
├── settings.json                  # MCP allowlist + hook configuration
├── commands/                      # All 8 platform commands
│   ├── bug-fix.md
│   ├── migration.md
│   ├── new-development.md
│   ├── data-correction.md
│   ├── ui-design-update.md
│   ├── test.md
│   ├── prompt-audit.md
│   └── dev.md
├── standards/                     # Coding standards (lazy-loaded)
│   ├── coding-standards.md
│   ├── backend/
│   ├── frontend/
│   ├── mobile/
│   └── migration/
└── .platform-version              # Install stamp

<repo>/                            # Per-repo (run once per consuming repo)
├── .claude/
│   ├── CLAUDE.md                  # Module boundaries (edit this for your repo)
│   ├── settings.json              # Per-repo hooks + allowlist override
│   ├── hooks/
│   │   ├── hash-check.js          # PreToolUse: contract integrity check
│   │   └── audit.js               # PostToolUse + Stop: session audit
│   ├── audit/                     # gitignored; logs written here
│   └── .platform-version          # Per-repo install stamp
```

---

## Installation Steps

### Step 1 — Clone the Platform Repo

```powershell
git clone https://gitlab.example.com/lifetrenz/enterprise-ai-platform.git
cd enterprise-ai-platform
```

### Step 2 — Global Install

Run once per machine. Installs the contract kernel and all commands to `~/.claude/`.

```powershell
pwsh install/install-claude.ps1
```

The installer:
1. Injects the contract kernel into `~/.claude/CLAUDE.md` (creates or updates within markers)
2. Copies 8 commands to `~/.claude/commands/`
3. Copies standards to `~/.claude/standards/`
4. Writes the MCP allowlist to `~/.claude/settings.json` (skips if already exists — merge manually if needed)
5. Writes `.platform-version` stamp

**Expected output:**
```
==> Global install: Enterprise AI Platform v4.3.0
  OK Updated contract section in existing ~/.claude/CLAUDE.md
  OK Installed commands to ~/.claude/commands/
  OK Installed standards to ~/.claude/standards/ (lazy-loaded by the contract)
  OK Wrote global allowlist to ~/.claude/settings.json
  Tip: run with -RepoPath <path> to also configure a specific repo
```

### Step 3 — Per-Repo Config

Run once per consuming repo. Installs hooks, per-repo settings, and the audit directory.

```powershell
pwsh install/install-claude.ps1 -RepoPath C:\src\your-service
```

The installer:
1. Writes `.claude/CLAUDE.md` (module boundaries template — edit this)
2. Backs up any existing `.claude/settings.json` to `.prev`, then writes new version
3. Installs `audit.js` and `hash-check.js` hooks
4. Creates `.claude/audit/` directory
5. Adds `.claude/audit/` to `.gitignore` if a `.gitignore` exists
6. Writes `.claude/.platform-version` stamp

**Expected output:**
```
==> Per-repo config: C:\src\your-service
  ! .claude/CLAUDE.md exists -- left unchanged (edit module boundaries manually)
  OK Backed up existing .claude/settings.json to .prev
  OK Wrote .claude/settings.json (allowlist + hash-check hook + audit hook)
  OK Installed .claude/hooks/audit.js and hash-check.js
  OK Added .claude/audit/ to .gitignore
  OK Per-repo config complete.
```

### Step 4 — Edit Module Boundaries

Open `.claude/CLAUDE.md` in your repo and fill in the module boundaries for your service:

```markdown
## Repo: your-service-name

This repo is a [Spring Boot service / Angular frontend / Flutter mobile app / etc.].

### Module boundaries
- `com.lifetrenz.yourservice.controller` — HTTP layer only; no business logic
- `com.lifetrenz.yourservice.service` — business logic only; no HTTP/DB
- `com.lifetrenz.yourservice.repository` — data access only
- `com.lifetrenz.yourservice.dto` — data transfer objects; no logic
- `com.lifetrenz.yourservice.entity` — JPA entities; no business logic

### Known sensitive areas
- [List any auth, PII, or billing-related packages]
```

### Step 5 — Configure MCP (Optional but Recommended)

MCP enables the AI to read GitLab issues, MRs, and database data.

```powershell
# Copy the template
Copy-Item shared/mcp/.mcp.json.template C:\src\your-service\.mcp.json
```

Edit `.mcp.json` and replace the `${env:}` placeholders. Then set the environment variables:

```powershell
# Add to $PROFILE for persistence
$env:GITLAB_PAT      = "glpat-xxxx"
$env:GITLAB_BASE_URL = "https://git.lifetrenz.com"
$env:GITLAB_MCP_PATH = "C:/tools/gitlab-mcp-reader"
```

For full MCP setup including Redmine and database servers, see [docs/mcp-setup.md](docs/mcp-setup.md).

### Step 6 — Verify Installation

```powershell
# Verify global install
Test-Path "$env:USERPROFILE\.claude\CLAUDE.md"          # Should be True
(ls "$env:USERPROFILE\.claude\commands\").Count          # Should be 7+

# Verify per-repo install
Test-Path ".claude\settings.json"                        # Should be True
Test-Path ".claude\hooks\audit.js"                       # Should be True
Test-Path ".claude\hooks\hash-check.js"                  # Should be True

# Verify contract kernel
$content = Get-Content "$env:USERPROFILE\.claude\CLAUDE.md" -Raw
$content -match "enterprise-ai-platform:kernel:start"    # Should be True

# Verify allowlist count
$s = Get-Content ".claude\settings.json" | ConvertFrom-Json
$s.permissions.allow.Count                               # Should be 28
```

### Step 7 — Test in a Session

Open Claude Code in your repo and run:

```
/bug-fix redmine=1
```

If MCP is not yet configured, you will see:
```
## Pre-Flight Check
Missing context: Redmine MCP not configured — using local files only
```

That is normal. The command will still work using local file context.

---

## Configuration Reference

### `.claude/settings.json`

The platform writes a pre-configured `settings.json`. The key sections:

```json
{
  "permissions": {
    "allow": [ "mcp__gitlab-reader__get_file", ... ],  // 28 read-only tools
    "deny":  [ "mcp__*", "Bash(git push*)", ... ]      // Catch-all block
  },
  "hooks": {
    "PreToolUse":  [{ "command": "node .claude/hooks/hash-check.js" }],
    "PostToolUse": [{ "command": "node .claude/hooks/audit.js --event PostToolUse" }],
    "Stop":        [{ "command": "node .claude/hooks/audit.js --event Stop" }]
  },
  "enableAllProjectMcpServers": false
}
```

Do not modify `settings.json` manually. If you need to add a custom tool, add it to `allow[]` only — never remove items from `deny[]`.

### `~/.claude/CLAUDE.md`

The global contract is injected between marker comments:

```
<!-- enterprise-ai-platform:contract:start -->
# Enterprise AI Platform — Execution Contract (kernel)
...
<!-- enterprise-ai-platform:contract:end -->
```

If you have your own `~/.claude/CLAUDE.md` content, the installer preserves it — the platform section is injected between markers and will be updated on upgrade without touching your custom content.

---

## Environment Variables

| Variable | Required | Purpose |
|---|---|---|
| `GITLAB_PAT` | For MCP | GitLab read-only personal access token |
| `GITLAB_BASE_URL` | For MCP | GitLab instance URL |
| `GITLAB_MCP_PATH` | For MCP | Path to gitlab-reader MCP server |
| `REDMINE_URL` | For MCP | Redmine instance URL |
| `REDMINE_API_KEY` | For MCP | Redmine service account API key |
| `MONGO_CONNECTION` | For MCP | MongoDB connection string (read-only user) |
| `POSTGRES_DSN` | For MCP | PostgreSQL connection string (read-only user) |

Set these in your PowerShell profile (`$PROFILE`) or `.env` file (gitignored).

---

## MCP Configuration

The `.mcp.json` file is gitignored and must be created locally. Use the template:

```powershell
Copy-Item shared/mcp/.mcp.json.template .mcp.json
```

The template uses `${env:}` variable injection — Claude Code substitutes these before launching MCP servers. Never put literal secrets in `.mcp.json`.

See [docs/mcp-setup.md](docs/mcp-setup.md) for detailed MCP server setup.

---

## Upgrade

To upgrade to a new platform version:

```powershell
# Pull latest platform repo
git -C <platform-repo> pull

# Re-run global install (updates contract, commands, standards)
pwsh install/install-claude.ps1

# Re-run per-repo install for each consuming repo
pwsh install/install-claude.ps1 -RepoPath C:\src\your-service
```

The installer is idempotent — it updates only what changed. Your module boundaries in `.claude/CLAUDE.md` are preserved if the file already exists. See [UPGRADE-GUIDE.md](UPGRADE-GUIDE.md) for a full upgrade procedure.

---

## Rollback

```powershell
# Restore settings.json from backup (created automatically during install)
Copy-Item .claude\settings.json.prev .claude\settings.json -Force

# Or restore from git
git checkout HEAD -- .claude/
```

See [docs/rollback.md](docs/rollback.md) for all rollback scenarios.

---

## Troubleshooting

| Problem | Likely cause | Fix |
|---|---|---|
| Commands not available in CC session | Global install not run or CC version too old | Re-run `pwsh install/install-claude.ps1` |
| `hash-check.js` fails on startup | Contract hash mismatch | Run `pwsh install/install-claude.ps1 -RepoPath .` to re-install |
| MCP tools not working | `.mcp.json` not configured or env vars not set | See [docs/mcp-setup.md](docs/mcp-setup.md) |
| `node: command not found` in hook | Node.js not on PATH | Install Node.js ≥18; restart terminal |
| `pwsh: command not found` | PowerShell 7 not installed | Not required -- run the script with `powershell.exe` (built into Windows) instead, or install pwsh 7+ |
| Audit log not created | `.claude/audit/` directory missing | Run per-repo install again |

See [TROUBLESHOOTING.md](TROUBLESHOOTING.md) for more.

---

## Known Limitations

| Limitation | Notes |
|---|---|
| No Bash equivalent | Hooks are Node.js only; no Bash hook scripts in this platform |
| Settings merge is manual | If `~/.claude/settings.json` exists before install, merge the allowlist manually |
| Hook scripts require local Node.js | Remote Claude Code sessions (SSH) need Node.js on the remote machine |
| Audit log grows unbounded | No rotation built in; archive `.claude/audit/log.jsonl` periodically |

---

## FAQ

**Q: Can I use the platform without MCP?**
Yes. All commands work with local files. MCP adds the ability to discover scope from Redmine tickets and GitLab MRs.

**Q: What does `auto=true` do?**
It skips the approval gate and proceeds directly to implementation after Phase 1 analysis. Use only for low-risk, well-understood tasks. CRITICAL risk tasks always require approval regardless.

**Q: Will the installer overwrite my existing `~/.claude/settings.json`?**
No. If it exists, the installer warns you to merge the allowlist manually. The per-repo `settings.json` is always replaced (after backing up to `.prev`).

**Q: Is the audit log sent anywhere?**
No. `.claude/audit/log.jsonl` is written locally and is gitignored. It never leaves your machine unless you explicitly send it.
