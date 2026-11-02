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
> | **macOS / Linux machine bootstrap** | `install/bootstrap.sh` — see below |

## macOS / Linux: full machine bootstrap (not just the contract install)

The PowerShell installers above assume Claude Code, OpenCode, and the MCP
servers (Knowledge Generator, Code Cortex, Unified Trace) are already set
up on the machine — they only install this platform's contract/commands
into a repo. `install/bootstrap.sh` covers the step before that: it also
detects/installs prerequisites, the Claude Code CLI, and registers the
shared MCP servers. There is no Windows equivalent of this specific script
yet (see [prerequisites.md](prerequisites.md)).

```bash
git clone https://git.lifetrenz.com/Preetham.ND/enterprise-ai-platform.git
cd enterprise-ai-platform
bash install/bootstrap.sh --dry-run   # preview
bash install/bootstrap.sh             # run it
bash install/bootstrap.sh --doctor    # health check any time after
```

Idempotent (safe to re-run), never installs OpenCode-required-mandatory
(it's optional throughout), and never indexes your codebase automatically
— see the **Indexing** note in [prerequisites.md](prerequisites.md).
Verify with `bash install/test-bootstrap.sh` (isolated fake-HOME test
matrix, touches nothing under your real `~/.claude` or
`~/.config/opencode`).

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
