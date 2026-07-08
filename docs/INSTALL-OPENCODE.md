# Installation Guide — OpenCode

**Platform:** OpenCode | **Version:** v4.3.0 | **Capability:** Partial

OpenCode is a terminal-native AI coding assistant. The platform supports OpenCode through an `AGENTS.md` injection approach and command shells. Use OpenCode when Claude Code and Copilot are unavailable, or in terminal-only environments.

> **Recommendation:** Use Claude Code for security-critical tasks. OpenCode has no hook API, no audit trail, and no per-tool MCP control. See [docs/hitl-matrix.md](docs/hitl-matrix.md).

---

## Prerequisites

| Tool | Minimum | Check | Install |
|---|---|---|---|
| OpenCode | Latest | `opencode --version` | [opencode.ai](https://opencode.ai) |
| PowerShell | ≥ 7.0 (pwsh) | `pwsh --version` | [PowerShell releases](https://github.com/PowerShell/PowerShell/releases) |
| Git | ≥ 2.40 | `git --version` | — |

---

## Supported Versions

| Component | Version |
|---|---|
| Platform | v4.3.0 |
| AGENTS.md approach | SP-04 confirmed |
| Command shells | 7 commands (≤20 lines each — thin glue) |
| MCP | Supported (no allowlist enforcement) |

---

## Architecture — What Gets Installed

```
<repo>/
├── AGENTS.md                              # Contract kernel + command reference
├── .opencode/
│   ├── ai-platform/
│   │   ├── shared/
│   │   │   ├── contract.md                # Full execution contract
│   │   │   └── commands/                  # 7 command definitions
│   │   └── standards/                     # Coding standards
│   ├── command/                           # OC command shells (≤20 lines each)
│   │   ├── bug-fix.md
│   │   ├── migration.md
│   │   ├── new-development.md
│   │   ├── data-correction.md
│   │   ├── ui-design-update.md
│   │   ├── test.md
│   │   └── prompt-audit.md
│   └── .platform-version.json             # Install stamp
```

---

## Installation Steps

### Step 1 — Clone the Platform Repo

```powershell
git clone https://gitlab.example.com/lifetrenz/enterprise-ai-platform.git
cd enterprise-ai-platform
```

### Step 2 — Run the OpenCode Installer

```powershell
pwsh adapters/opencode/install.ps1 -RepoPath C:\src\your-service
```

The installer:
1. Copies `shared/contract.md` to `.opencode/ai-platform/shared/contract.md`
2. Copies `shared/commands/` to `.opencode/ai-platform/shared/commands/`
3. Copies `shared/standards/` to `.opencode/ai-platform/standards/`
4. Copies command shells to `.opencode/command/`
5. Injects platform content into `AGENTS.md` (creates if absent, updates if present)
6. Writes `.opencode/.platform-version.json` stamp

**Expected output:**
```
Enterprise AI Platform — OpenCode Adapter Install
Platform root : D:\enterprise-ai-platform
Repo          : C:\src\your-service

OpenCode adapter install complete. Files changed: 24
```

**Dry-run first (recommended):**
```powershell
pwsh adapters/opencode/install.ps1 -RepoPath C:\src\your-service -DryRun
```

### Step 3 — Verify Installation

```powershell
# Check AGENTS.md was created/updated
Test-Path "C:\src\your-service\AGENTS.md"                         # Should be True
Select-String "enterprise-ai-platform:contract:start" "C:\src\your-service\AGENTS.md"  # Should match

# Check command shells
ls "C:\src\your-service\.opencode\command\"                        # Should list 7 .md files

# Check contract
Test-Path "C:\src\your-service\.opencode\ai-platform\shared\contract.md"  # Should be True
```

### Step 4 — Configure MCP (Optional)

OpenCode reads MCP configuration from `.opencode/config.json`. Add your MCP servers:

```json
{
  "mcp": {
    "servers": {
      "gitlab-reader": {
        "command": "node",
        "args": ["${env:GITLAB_MCP_PATH}/index.js"],
        "env": {
          "GITLAB_TOKEN": "${env:GITLAB_PAT}",
          "GITLAB_URL": "${env:GITLAB_BASE_URL}"
        }
      }
    }
  }
}
```

> OpenCode cannot enforce an MCP allowlist. Enforce read-only access at the credential level — use read-only tokens and DB users. See [docs/mcp-setup.md](docs/mcp-setup.md).

### Step 5 — Commit the Platform Files

```bash
git add AGENTS.md .opencode/
git commit -m "chore: install Enterprise AI Platform v4.3.0 (OpenCode adapter)"
git push
```

---

## Using Commands in OpenCode

OpenCode reads command shells from `.opencode/command/`. Invoke them by name:

```
/bug-fix redmine=12345
/migration mr=!456 target=main
/test
/prompt-audit
```

Each command shell in `.opencode/command/` is a thin glue file (≤20 lines) that references the full shared command specification in `.opencode/ai-platform/shared/commands/`.

---

## Platform Capability on OpenCode

| Capability | Status | Notes |
|---|---|---|
| Contract kernel | ✅ Via AGENTS.md | Injected between markers; preserved on upgrade |
| All 7 commands | ✅ Via command shells | Available as `/command-name` |
| Coding standards | ✅ Copied | Available in `.opencode/ai-platform/standards/` |
| Approval gate | ✅ Contract enforces it | AI must wait for your approval |
| MCP | ✅ Supported | No per-tool allowlist enforcement |
| Hook scripts | ❌ Not supported | OC has no hook API (SP-03) |
| Audit logging | ❌ Not supported | No `audit.js` equivalent |
| Contract hash-check | ❌ Not supported | No `hash-check.js` equivalent |
| Subagents | ❌ Not supported | OC does not support subagents |

---

## How AGENTS.md Works

OpenCode reads `AGENTS.md` from the repo root as additional system context, similar to Claude Code's `~/.claude/CLAUDE.md`. The platform injects the contract kernel between markers:

```markdown
<!-- enterprise-ai-platform:contract:start -->
# Enterprise AI Platform — Execution Contract (kernel)
...
<!-- enterprise-ai-platform:contract:end -->
```

If your repo already has an `AGENTS.md`, the installer merges the platform section into it using the markers — your existing content is preserved.

---

## Upgrade

```powershell
# Pull latest platform repo
git -C <platform-repo> pull

# Re-run installer (Force to refresh all files)
pwsh adapters/opencode/install.ps1 -RepoPath C:\src\your-service -Force

# Commit the updated files
git -C C:\src\your-service add AGENTS.md .opencode/
git -C C:\src\your-service commit -m "chore: upgrade Enterprise AI Platform to vX.Y.Z (OpenCode)"
```

---

## Rollback

```powershell
# Revert in the consuming repo
git -C C:\src\your-service revert HEAD

# Or manually remove platform section from AGENTS.md
# (Remove lines between the enterprise-ai-platform:contract:start/end markers)
```

---

## Troubleshooting

| Problem | Likely cause | Fix |
|---|---|---|
| Commands not recognized | `.opencode/command/` not set up | Re-run installer; verify `.opencode/command/` exists |
| AGENTS.md not loading | OpenCode version issue | Check OC reads AGENTS.md; update OC |
| MCP tools not available | MCP not configured in `.opencode/config.json` | Add MCP server config |
| Installer fails: engine not found | Platform root not detected | Run from within the platform repo directory |

---

## Known Limitations

| Limitation | Impact |
|---|---|
| No hook API | No audit trail, no hash-check |
| No per-tool MCP deny | Enforce read-only via credentials |
| Command shells are thin | Full command spec in `.opencode/ai-platform/` — OC must load both |
| No subagents | Large tasks run single-threaded |

---

## FAQ

**Q: Can I use OpenCode without MCP?**
Yes. Commands work with local files only. MCP adds issue/MR discovery.

**Q: What is the difference between the command shell and the full command file?**
The shell in `.opencode/command/` is ≤20 lines — it points to the full command spec in `.opencode/ai-platform/shared/commands/`. OpenCode reads both.

**Q: My AGENTS.md already has content. Will the installer overwrite it?**
No. The installer injects the platform section between markers without touching your existing content.

**Q: Does OpenCode support the auto=true argument?**
Yes. Include `auto=true` in your command arguments. The approval gate is enforced by the contract kernel, not by a hook — so it works on all platforms.
