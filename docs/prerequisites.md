# Toolchain Prerequisites (V-D1)
**Status:** Phase A baseline  
**Date:** 2026-07-07 (TK-048)  

---

## Required tools (all platforms)

| Tool | Minimum version | Purpose | Install |
|---|---|---|---|
| Claude Code CLI | ≥ 1.0.0 | Primary AI platform | `npm install -g @anthropic-ai/claude-code` |
| Node.js | ≥ 18 | Runs hook scripts (`audit.js`, `hash-check.js`) | [nodejs.org](https://nodejs.org) |
| PowerShell | ≥ 7.0 (pwsh) | Runs installer scripts | [github.com/PowerShell](https://github.com/PowerShell/PowerShell/releases) |
| Git | ≥ 2.40 | Version control; installer uses `git` status | [git-scm.com](https://git-scm.com) |

## Platform-specific

### Windows 11 (primary development environment)
| Tool | Version | Notes |
|---|---|---|
| PowerShell 7+ (`pwsh`) | ≥ 7.4 | Required for installer scripts. PowerShell 5.1 (`powershell.exe`) is NOT supported. |
| Windows Terminal | Any | Recommended for best Claude Code experience |
| Developer Mode | NOT required | Installer uses file copies, not symlinks (SP-07) |
| Admin privileges | NOT required | Normal user account sufficient |

### Linux / macOS (CI runners, team members)
| Tool | Version | Notes |
|---|---|---|
| bash | ≥ 5.0 | CI scripts use bash |
| pwsh | ≥ 7.4 | Installer scripts require PowerShell on macOS/Linux |
| sha256sum | System | Used by CI contract-hash-verify job |

## Optional tools (used by specific commands)

| Tool | Used by | Required for |
|---|---|---|
| GitLab MCP server | All commands | MR/issue discovery; install per `docs/mcp-setup.md` |
| Redmine MCP server | All commands | Redmine issue discovery; optional |
| MongoDB MCP server | `/data-correction` | Database analysis only |

## MCP server configuration

MCP servers are configured in `~/.mcp.json` (global) or `.mcp.json` (per-repo).  
See `docs/mcp-setup.md` for installation and configuration instructions.

The platform's MCP allowlist (`adapters/claude/config/settings.json`) is pre-configured for:
- `mcp__gitlab-reader` (required)
- `mcp__redmine-reader` (optional)
- `mcp__canary_mongo_db` (optional)

## Version checking

Run this before installing to verify prerequisites:

```powershell
# Check required tools
node --version      # Expected: v18.x or higher
pwsh --version      # Expected: 7.x
git --version       # Expected: 2.40 or higher
claude --version    # Expected: 1.x
```

## CI/CD runner requirements

GitLab shared runners must have:
- `alpine:latest` image (for validate/security stage jobs)
- `node:20-alpine` image (for validate job)
- Internet access to pull images (or use internal registry mirrors)

The CI jobs do NOT require any secrets or authenticated services.
