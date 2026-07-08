# Installation Guide — GitHub Copilot

**Platform:** GitHub Copilot | **Version:** v4.3.0 | **Capability:** Partial

GitHub Copilot does not have a plugin system, so the platform content is **vendored** (copied) into each consuming repository. All commands are available as Copilot chatmodes and prompt files.

> **Recommendation:** Use Claude Code for security-critical tasks (auth, PII, Flyway on PII tables). Copilot has no hook API and therefore no audit trail or contract hash-check. See [docs/hitl-matrix.md](docs/hitl-matrix.md).

---

## Prerequisites

| Tool | Minimum | Check | Install |
|---|---|---|---|
| GitHub Copilot | Business or Enterprise | GitHub settings | — |
| VS Code | Any recent | `code --version` | — |
| GitHub Copilot VS Code extension | ≥ 1.200 | VS Code Extensions | — |
| PowerShell | ≥ 7.0 (pwsh) | `pwsh --version` | [PowerShell releases](https://github.com/PowerShell/PowerShell/releases) |

### Copilot Custom Instructions Requirement

Platform commands require Copilot to read `.github/copilot-instructions.md`. This is supported in:
- **GitHub Copilot Business** and **Enterprise** — `copilot-instructions.md` is respected
- **GitHub Copilot Individual** — verify your Copilot version supports custom instructions

Custom chatmodes (`.github/chatmodes/*.chatmode.md`) require VS Code + GitHub Copilot extension ≥ 1.200.

---

## Supported Versions

| Component | Version |
|---|---|
| Platform | v4.3.0 |
| Copilot Instructions | `.github/copilot-instructions.md` |
| Chat modes | `.github/chatmodes/*.chatmode.md` |
| Prompt files | `.github/prompts/*.prompt.md` |
| Commands available | 7 (all commands) |

---

## Architecture — What Gets Installed

Copilot content is vendored directly into each consuming repo:

```
<repo>/
├── .github/
│   ├── copilot-instructions.md        # Contract kernel + command reference
│   ├── ai-platform/
│   │   ├── shared/
│   │   │   └── contract.md            # Full execution contract
│   │   ├── standards/                 # Coding standards (vendored)
│   │   │   ├── coding-standards.md
│   │   │   ├── backend/
│   │   │   ├── frontend/
│   │   │   └── migration/
│   │   ├── templates/                 # Checklist templates
│   │   ├── REPO.md                    # Per-repo module boundaries (edit this)
│   │   └── .platform-version          # Install stamp
│   ├── prompts/                       # Prompt files (@ prefix in chat)
│   │   ├── bug-fix.prompt.md
│   │   ├── migration.prompt.md
│   │   ├── new-development.prompt.md
│   │   ├── data-correction.prompt.md
│   │   ├── ui-design-update.prompt.md
│   │   └── prompt-audit.prompt.md
│   └── chatmodes/                     # Chatmode files (dropdown in Copilot Chat)
│       ├── bug-fix.chatmode.md
│       ├── migration.chatmode.md
│       ├── new-development.chatmode.md
│       ├── data-correction.chatmode.md
│       ├── ui-design-update.chatmode.md
│       └── prompt-audit.chatmode.md
```

---

## Installation Steps

### Step 1 — Clone the Platform Repo

```powershell
git clone https://gitlab.example.com/lifetrenz/enterprise-ai-platform.git
cd enterprise-ai-platform
```

### Step 2 — Run the Copilot Installer

```powershell
pwsh install/install-copilot.ps1 -RepoPath C:\src\your-service
```

The installer:
1. Vendors `shared/`, `standards/`, `templates/` into `.github/ai-platform/`
2. Writes `.github/ai-platform/REPO.md` (if not already present)
3. Writes `.github/copilot-instructions.md`
4. Copies prompt files to `.github/prompts/`
5. Copies chatmode files to `.github/chatmodes/`
6. Writes `.github/ai-platform/.platform-version` stamp

**Expected output:**
```
==> Configuring Copilot for repo: C:\src\your-service (platform v4.3.0)
==> Vendoring shared source into .github/ai-platform/
  OK vendored shared, standards, templates
  OK wrote .github/ai-platform/REPO.md (edit boundaries)
  OK installed copilot-instructions.md + prompts (/name) + chatmodes (dropdown)
  OK stamped .github/ai-platform/.platform-version = 4.3.0
  ! Copilot cannot hard-enforce MCP read-only. Enforce via read-only PATs on MCP servers.
```

### Step 3 — Edit Module Boundaries

Open `.github/ai-platform/REPO.md` and fill in your repo's module boundaries. This file is never overwritten by upgrades.

```markdown
## Repo: your-service-name
...
```

### Step 4 — Commit the Platform Files

The vendored content must be committed to the repo so Copilot can read it:

```bash
git add .github/
git commit -m "chore: install Enterprise AI Platform v4.3.0 (Copilot adapter)"
git push
```

### Step 5 — Configure MCP (Optional)

Copilot uses MCP servers configured in VS Code. Create `.vscode/mcp.json` in your repo:

```json
{
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
```

> Copilot cannot enforce an MCP allowlist — it has no `deny: ["mcp__*"]` equivalent. **Enforce read-only access at the credential level**: use read-only GitLab tokens and read-only DB users. See [docs/mcp-setup.md](docs/mcp-setup.md).

### Step 6 — Verify Installation

Open VS Code in your repo and:

1. Open GitHub Copilot Chat panel
2. Click the chat mode dropdown — you should see: **Bug Fix**, **Migration**, **New Development**, etc.
3. Type `@` in the chat input — you should see the prompt files listed

If chat modes are not visible, ensure your Copilot extension is up to date.

---

## Using Commands in Copilot

### Via Chatmode (recommended)

1. Open Copilot Chat
2. Click the **chat mode dropdown** (top of chat panel)
3. Select a mode (e.g., **Bug Fix**)
4. Type your task: `redmine=12345` or describe the issue

### Via Prompt File

In Copilot Chat, type:
```
@bug-fix redmine=12345
```

The prompt file loads the full `/bug-fix` command specification.

### Via Free Text

If neither chatmodes nor prompt files are available, paste the command invocation as free text. Copilot reads the instructions from `.github/copilot-instructions.md`.

---

## Platform Capability on Copilot

| Capability | Status | Notes |
|---|---|---|
| Contract kernel | ✅ Via `copilot-instructions.md` | Loaded by Copilot for every chat |
| All 7 commands | ✅ Via chatmodes + prompts | Available in dropdown and `@` prefix |
| Coding standards | ✅ Vendored | Copilot reads from `.github/ai-platform/standards/` |
| Approval gate | ✅ Contract enforces it | AI must wait for your approval |
| MCP read-only | ⚠️ Credential-only | No allowlist enforcement; use read-only tokens |
| Hook scripts | ❌ Not supported | Copilot has no hook API |
| Audit logging | ❌ Not supported | No `audit.js` equivalent |
| Contract hash-check | ❌ Not supported | No `hash-check.js` equivalent |
| Subagents | ❌ Not supported | Copilot is single-turn |

---

## Upgrade

To upgrade vendored content when a new platform version is released:

```powershell
# Pull latest platform repo
git -C <platform-repo> pull

# Re-run installer (overwrites vendored files; REPO.md is preserved)
pwsh install/install-copilot.ps1 -RepoPath C:\src\your-service

# Commit the updated files
git -C C:\src\your-service add .github/
git -C C:\src\your-service commit -m "chore: upgrade Enterprise AI Platform to vX.Y.Z"
```

---

## Rollback

```powershell
# Option A: restore from .prev files (if installer created them)
# (Copilot installer does not create .prev files — use git)

# Option B: revert to previous commit in consuming repo
git -C C:\src\your-service revert HEAD
```

See [docs/rollback.md](docs/rollback.md) §Scenario 12 for details.

---

## Troubleshooting

| Problem | Likely cause | Fix |
|---|---|---|
| Chatmodes not visible | Extension version too old | Update GitHub Copilot VS Code extension |
| Copilot ignores `copilot-instructions.md` | File not committed to repo | Commit and push `.github/copilot-instructions.md` |
| `@prompt-file` not showing in chat | Prompts not copied / not committed | Re-run installer; commit `.github/prompts/` |
| Copilot makes write calls via MCP | Read-only not enforced at credential level | Create a GitLab token with `read_api` scope only |
| Standards not loaded | Not vendored or path wrong | Re-run installer; verify `.github/ai-platform/standards/` exists |

---

## Known Limitations

| Limitation | Impact |
|---|---|
| No hook API | No audit trail, no contract hash-check |
| Vendored content (not linked) | Must re-run installer when platform updates |
| No per-tool MCP deny | Write tools must be blocked via read-only credentials |
| No subagents | Large multi-layer tasks are slower (no parallel analysis) |
| No auto=true equivalent | Approval gate relies entirely on the AI following instructions |

---

## FAQ

**Q: Do I need to commit `.github/` changes?**
Yes. Copilot reads files from the repository. The vendored content must be committed before Copilot can use it.

**Q: Will upgrading overwrite my REPO.md?**
No. The installer checks if `.github/ai-platform/REPO.md` already exists and leaves it unchanged. All other vendored files are always refreshed.

**Q: Can Copilot use the same MCP servers as Claude Code?**
Yes, if you configure `.vscode/mcp.json`. But Copilot cannot enforce the allowlist — enforce read-only at the token/credential level instead.

**Q: The chatmodes dropdown doesn't appear. What's wrong?**
Chatmodes require GitHub Copilot extension ≥ 1.200 in VS Code. Update your extension. If the feature is still not visible, check if your Copilot subscription includes custom chatmodes.
