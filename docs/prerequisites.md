# Toolchain Prerequisites (V-D1)
**Status:** Phase A baseline  
**Date:** 2026-07-07 (TK-048)  

---

## Required tools (all platforms)

| Tool | Minimum version | Purpose | Install |
|---|---|---|---|
| Claude Code CLI | ≥ 1.0.0 | Primary AI platform | `npm install -g @anthropic-ai/claude-code` |
| Node.js | ≥ 18 | Runs hook scripts (`audit.js`, `hash-check.js`) | [nodejs.org](https://nodejs.org) |
| PowerShell | ≥ 5.1 (Windows built-in) or pwsh 7+ | Runs installer scripts | Windows built-in; [github.com/PowerShell](https://github.com/PowerShell/PowerShell/releases) optional |
| Git | ≥ 2.40 | Version control; installer uses `git` status | [git-scm.com](https://git-scm.com) |

## Platform-specific

### Windows 11 (primary development environment)
| Tool | Version | Notes |
|---|---|---|
| PowerShell | 5.1 (`powershell.exe`, built in) or 7.4+ (`pwsh`) | Installer scripts are ASCII-only and run on either. |
| Windows Terminal | Any | Recommended for best Claude Code experience |
| Developer Mode | NOT required | Installer uses file copies, not symlinks (SP-07) |
| Admin privileges | NOT required | Normal user account sufficient |

### Linux / macOS (CI runners, team members)
| Tool | Version | Notes |
|---|---|---|
| bash | ≥ 5.0 | CI scripts use bash |
| pwsh | ≥ 7.4 | Only needed if you use the PowerShell installers directly; `adapters/claude/install.sh` and `install/bootstrap.sh` are native bash and need no PowerShell at all |
| sha256sum | System | Used by CI contract-hash-verify job |

### Knowledge Generator / Code Cortex / Unified Trace (optional, macOS/Linux)

Only needed if you want the `knowledge-graph`/`code-cortex-mcp`/`unified-trace`
MCP servers — `install/bootstrap.sh` detects and installs/configures all
three, but still needs these already on the machine:

| Tool | Version | Used by |
|---|---|---|
| Python | ≥ 3.10 (3.14 used on the verified macOS machine; on Windows use python.org/winget, not the Microsoft Store stub) | Knowledge Generator (regex-based indexer, zero pip deps) + its MCP server venv |
| Java | any recent LTS | Only if you build Code Cortex from source instead of using its prebuilt binary |
| curl | any | Code Cortex's `install.sh` prebuilt-binary download |

**Indexing is never automatic.** `install/bootstrap.sh` sets up the MCP
servers themselves, but a fresh Knowledge Generator database is never
built as part of bootstrap — it reports `NOT INDEXED / READY TO INDEX`
and leaves the actual `python3 indexer.py` run to you, explicitly, once
`kg-config.env` points at your real project paths. `bash install/bootstrap.sh --reindex`
opts into it explicitly if you want bootstrap to do that step too.

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
node --version               # Expected: v18.x or higher
$PSVersionTable.PSVersion    # Expected: 5.1+ (Windows built-in) or 7.x (pwsh)
git --version                # Expected: 2.40 or higher
claude --version             # Expected: 1.x
```

## CI/CD runner requirements

GitLab shared runners must have:
- `alpine:latest` image (for validate/security stage jobs)
- `node:20-alpine` image (for validate job)
- Internet access to pull images (or use internal registry mirrors)

The CI jobs do NOT require any secrets or authenticated services.

## Cross-platform runtime (self-contained repo)
Node ≥ 20 and Python ≥ 3.10 are the only hard prerequisites; `npm run platform:install -- --apply` creates `.venv-mcp` (never copy a venv between machines/OSes). Code Cortex needs its prebuilt binary (`--with-cortex`) or a C++23 toolchain to build from the vendored source. Verified on macOS only; see `docs/CROSS_PLATFORM_INSTALLATION.md`.
