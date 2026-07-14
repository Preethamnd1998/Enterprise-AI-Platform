# Quick Start — Enterprise AI Platform v4.3

**Time to first command: ~15 minutes**

This guide installs the platform on Claude Code (the primary platform) and walks you through your first command. For other platforms, see the [platform-specific guides](#next-steps).

---

## Prerequisites

Before you start, verify:

```powershell
node --version                    # Must be v18 or higher
$PSVersionTable.PSVersion         # 5.1 (Windows built-in) or pwsh 7+ both work
git --version                     # Must be 2.40 or higher
claude --version                  # Claude Code CLI must be installed
```

If anything is missing, see [docs/prerequisites.md](docs/prerequisites.md).

---

## Step 1 — Clone the Platform Repo

```powershell
git clone https://gitlab.example.com/lifetrenz/enterprise-ai-platform.git
cd enterprise-ai-platform
```

> Replace the URL with your internal GitLab URL.

---

## Step 2 — Global Install (once per machine)

The global install injects the contract kernel into `~/.claude/CLAUDE.md` and installs all 8 commands for every Claude Code session on this machine.

```powershell
pwsh install/install-claude.ps1
```

**Expected output:**
```
==> Global install: Enterprise AI Platform v4.3.0
  OK Created ~/.claude/CLAUDE.md with contract
  OK Installed commands to ~/.claude/commands/
  OK Installed standards to ~/.claude/standards/
  OK Wrote global allowlist to ~/.claude/settings.json
```

Verify the install:
```powershell
# Check the contract was written
Get-Content "$env:USERPROFILE\.claude\CLAUDE.md" | Select-String "enterprise-ai-platform:kernel:start"

# Check commands are installed
ls "$env:USERPROFILE\.claude\commands\"
```

---

## Step 3 — Per-Repo Config (once per consuming repo)

The per-repo install adds hooks, audit logging, and the security settings to a specific repo. Run this once for each repo where you will use the platform.

```powershell
pwsh install/install-claude.ps1 -RepoPath C:\src\your-repo
```

**What gets installed:**
```
<your-repo>/
├── .claude/
│   ├── CLAUDE.md            # Module boundaries (edit this)
│   ├── settings.json        # MCP allowlist + hooks
│   ├── hooks/
│   │   ├── hash-check.js    # Contract integrity check (auto)
│   │   └── audit.js         # Session audit logger (auto)
│   └── audit/               # Session logs written here (gitignored)
```

> After install, open `.claude/CLAUDE.md` and fill in your repo's module boundaries. This is the only file you need to edit.

---

## Step 4 — Configure MCP (first time)

MCP gives the AI read-only access to GitLab and Redmine. Without this step, commands that need to read issues or MRs will work partially (local files only).

```powershell
# Copy the template to your repo
Copy-Item shared/mcp/.mcp.json.template C:\src\your-repo\.mcp.json
```

Open `.mcp.json` and set:
- `${env:GITLAB_PAT}` → your GitLab read-only personal access token
- `${env:GITLAB_BASE_URL}` → your GitLab instance URL
- `${env:GITLAB_MCP_PATH}` → path to the gitlab-reader MCP server binary

```powershell
# Set in your PowerShell profile ($PROFILE) so they persist
$env:GITLAB_PAT      = "glpat-xxxxxxxxxxxxxxxxxxxx"
$env:GITLAB_BASE_URL = "https://git.lifetrenz.com"
$env:GITLAB_MCP_PATH = "C:/tools/gitlab-mcp-reader"
```

> **Never commit `.mcp.json`** — it is gitignored. Secrets stay local.
> See [docs/mcp-setup.md](docs/mcp-setup.md) for full instructions including Redmine and database MCP servers.

---

## Step 5 — Run Your First Command

Open a new Claude Code session in your repo:

```
cd C:\src\your-repo
claude
```

Then run a command:

```
/bug-fix redmine=12345
```

**What happens:**
1. The AI reads the contract from `~/.claude/CLAUDE.md`
2. The hash-check hook verifies the contract is untampered
3. The AI runs Phase 1 — Discovery & Analysis (reads the Redmine ticket, finds the relevant files)
4. The AI presents a **Pre-Flight Check** and its analysis
5. The AI stops and asks: `Approve implementation? (approve / yes / proceed / implement)`
6. You type `approve`
7. The AI makes the changes and writes an Execution Summary
8. The audit hook logs the session to `.claude/audit/log.jsonl`

---

## Command Reference

| Command | Usage | What it does |
|---|---|---|
| `/bug-fix` | `/bug-fix redmine=12345` | Fix a bug from a Redmine ticket |
| `/bug-fix` | `/bug-fix mr=!456` | Fix a bug from a GitLab MR |
| `/migration` | `/migration mr=!456 target=main` | Migrate changes to target branch |
| `/new-development` | `/new-development redmine=789` | Implement a new feature |
| `/data-correction` | `/data-correction redmine=321` | Correct a data issue |
| `/ui-design-update` | `/ui-design-update redmine=654` | Apply a UI design change |
| `/test` | `/test` | Analyse test coverage and suggest tests |
| `/prompt-audit` | `/prompt-audit` | Score and improve your prompt quality |
| `/dev` | `/dev file=PLAN.md` | Execute a task Markdown file end to end |

**Common arguments:**
- `redmine=<id>` — discover scope from a Redmine ticket
- `mr=!<n>` — discover scope from a GitLab MR
- `commit=<sha>` — discover scope from a specific commit
- `branch=<b>` — discover scope from a branch
- `auto=true` — skip the approval gate (use only for low-risk, well-understood tasks)

---

## Verify Everything Works

```powershell
# Check global install
ls "$env:USERPROFILE\.claude\commands\"     # Should list 7 .md files

# Check per-repo install (in your repo)
ls .claude\hooks\                            # Should contain audit.js, hash-check.js
ls .claude\                                  # Should contain settings.json, CLAUDE.md

# Check settings (MCP allowlist)
Get-Content .claude\settings.json | ConvertFrom-Json | Select-Object -ExpandProperty permissions | Select-Object -ExpandProperty allow | Measure-Object
# Should output: Count = 28
```

---

## Next Steps

| Goal | Guide |
|---|---|
| Full Claude Code setup | [INSTALL-CLAUDE.md](INSTALL-CLAUDE.md) |
| Install for GitHub Copilot | [INSTALL-COPILOT.md](INSTALL-COPILOT.md) |
| Install for OpenCode | [INSTALL-OPENCODE.md](INSTALL-OPENCODE.md) |
| Set up MCP servers | [docs/mcp-setup.md](docs/mcp-setup.md) |
| Understand the approval gate | [GOVERNANCE.md](GOVERNANCE.md) §3 |
| Understand when to ask for approval | [docs/hitl-matrix.md](docs/hitl-matrix.md) |
| See worked command examples | [docs/example-executions.md](docs/example-executions.md) |
| Troubleshoot problems | [TROUBLESHOOTING.md](TROUBLESHOOTING.md) |
