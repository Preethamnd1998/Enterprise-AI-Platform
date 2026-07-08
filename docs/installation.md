# Installation — Enterprise AI Platform

> **This document is superseded by platform-specific guides.**
>
> The old plugin-based installation approach described here was replaced in v3.1 with
> PowerShell installer scripts. The plugin marketplace approach is no longer used.
>
> Please use the correct guide for your platform:
>
> | Platform | Guide |
> |---|---|
> | **Claude Code** | [INSTALL-CLAUDE.md](INSTALL-CLAUDE.md) |
> | **GitHub Copilot** | [INSTALL-COPILOT.md](INSTALL-COPILOT.md) |
> | **OpenCode** | [INSTALL-OPENCODE.md](INSTALL-OPENCODE.md) |
> | **All platforms (Quick Start)** | [QUICK-START.md](QUICK-START.md) |
> | **Prerequisites** | [docs/prerequisites.md](prerequisites.md) |
> | **MCP Setup** | [docs/mcp-setup.md](mcp-setup.md) |
> | **Fleet Rollout** | [docs/fleet-rollout.md](fleet-rollout.md) |

## What Changed in v3.1

The platform moved from a Claude Code plugin system (install via `/plugin marketplace add`) to
a portable PowerShell installer (`pwsh install/install-claude.ps1`). This change:

- Removed the dependency on the Claude Code plugin marketplace
- Made the platform portable across Claude Code, Copilot, and OpenCode
- Added the `shared/` + `adapters/` architecture (canonical assets in one place)
- Replaced the denylist with an allowlist (security improvement — fails closed)

If you have an old plugin-based install, run the new installer to migrate:

```powershell
cd enterprise-ai-platform
pwsh install/install-claude.ps1          # Global
pwsh install/install-claude.ps1 -RepoPath C:\src\your-service  # Per-repo
```
