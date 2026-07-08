# Secrets and Environment Variable Injection
**Status:** Phase B baseline  
**Date:** 2026-07-07 (TK-056)  

---

## Rule: Zero literal secrets in committed files

No token, password, connection string, or API key may appear in any committed file.
All secrets are injected at runtime via `${env:VARIABLE_NAME}`.

Violation = CI `no-literal-secrets` job failure (Phase B CI gate).

---

## How `${env:}` injection works in Claude Code

Claude Code reads `.mcp.json` (project-level) or `~/.claude/mcp.json` (global) at session start.
Any value matching `${env:VARNAME}` is substituted from the current process environment before
the MCP server is launched.

```jsonc
// .mcp.json — safe to commit (no literal values)
{
  "mcpServers": {
    "gitlab-reader": {
      "command": "node",
      "args": ["${env:GITLAB_MCP_PATH}/index.js"],
      "env": {
        "GITLAB_TOKEN": "${env:GITLAB_PAT}"
      }
    }
  }
}
```

The engineer sets the variable in their shell profile:

```powershell
# In $PROFILE (Windows — PowerShell profile)
$env:GITLAB_PAT       = "glpat-xxxxxxxxxxxxxxxxxxxx"
$env:GITLAB_BASE_URL  = "https://git.example.com"
$env:GITLAB_MCP_PATH  = "C:/tools/gitlab-mcp"

$env:REDMINE_URL      = "https://redmine.example.com"
$env:REDMINE_PAT      = "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"

$env:MONGO_READ_URI   = "mongodb+srv://readonly:<PASSWORD>@cluster.mongodb.net/?authSource=admin"
$env:POSTGRES_READ_URI = "postgresql://readonly:<PASSWORD>@host:5432/dbname"
```

```bash
# In ~/.bashrc or ~/.zshrc (Linux/macOS)
export GITLAB_PAT="glpat-xxxxxxxxxxxxxxxxxxxx"
export GITLAB_BASE_URL="https://git.example.com"
# etc.
```

---

## .env file (local development only)

For local development, create a `.env` file at the repo root. This file is
**gitignored** — never commit it.

```ini
# .env — local only, NEVER commit
GITLAB_PAT=glpat-xxxxxxxxxxxxxxxxxxxx
GITLAB_BASE_URL=https://git.example.com
GITLAB_MCP_PATH=C:/tools/gitlab-mcp

REDMINE_URL=https://redmine.example.com
REDMINE_PAT=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

MONGO_READ_URI=mongodb+srv://readonly:PASSWORD@cluster.mongodb.net/
POSTGRES_READ_URI=postgresql://readonly:PASSWORD@host:5432/dbname
```

A safe-to-commit example is provided at `.env.example`:

```ini
# .env.example — commit this file, not .env
GITLAB_PAT=<YOUR_GITLAB_READ_ONLY_PAT>
GITLAB_BASE_URL=<YOUR_GITLAB_BASE_URL>
GITLAB_MCP_PATH=<PATH_TO_GITLAB_MCP_SERVER>

REDMINE_URL=<YOUR_REDMINE_URL>
REDMINE_PAT=<YOUR_REDMINE_PAT>

MONGO_READ_URI=<READONLY_MONGODB_CONNECTION_STRING>
POSTGRES_READ_URI=<READONLY_POSTGRES_CONNECTION_STRING>
```

---

## PAT (Personal Access Token) requirements

| Service | Scope | Minimum permissions |
|---|---|---|
| GitLab | Personal or Project | `read_api`, `read_repository` — no write scopes |
| Redmine | API key | Read-only (no Redmine write API keys) |
| MongoDB | Atlas user or connection string | `readAnyDatabase` role — no write permissions |
| PostgreSQL | DB role | `SELECT` only — no `INSERT`, `UPDATE`, `DELETE` |

Using write-scoped tokens with the read-only MCP allowlist (settings.json) provides
defense in depth: the MCP server can only call listed read tools, AND the PAT cannot
authorize writes even if an unlisted write tool were somehow invoked.

---

## Ownership

| Variable | Owner | Where to get it |
|---|---|---|
| `GITLAB_PAT` | Each engineer (personal PAT) | GitLab → User Settings → Access Tokens |
| `GITLAB_BASE_URL` | Platform team | Internal wiki: AI Platform Setup |
| `GITLAB_MCP_PATH` | Each engineer | Local path after running `npm install -g gitlab-mcp` |
| `REDMINE_PAT` | Each engineer | Redmine → My account → API access key |
| `MONGO_READ_URI` | DBA / Ops (BUG-D2: assign owner) | Team secrets manager |
| `POSTGRES_READ_URI` | DBA / Ops (BUG-D2: assign owner) | Team secrets manager |

> **BUG-D2 open:** Secret/vault provisioning for team-shared connection strings has no
> assigned owner. Assign to Security/Ops before Phase B goes live on teams.

---

## CI secret scanning

Phase B adds a CI job that scans all committed files for patterns matching known token formats:
- GitLab PAT: `glpat-[0-9A-Za-z_-]{20,}`
- Generic API keys: long hex/base64 strings not in template placeholders
- MongoDB Atlas URI: `mongodb+srv://[^<][^>]*@`
- PostgreSQL connection: `postgresql://[^<][^>]*:[^<][^>]*@`

Any match in a committed file causes the job to fail. Committed `.mcp.json.template`
(with `${env:}` placeholders) passes. Committed `.mcp.json` with real values fails.

---

## Rollback

If a secret was accidentally committed:

```powershell
# 1. Rotate the token immediately (invalidate the leaked value)
# 2. Remove from git history:
git filter-branch --force --index-filter \
  "git rm --cached --ignore-unmatch path/to/file" HEAD
# 3. Force-push after team coordination
# 4. Update .gitignore to prevent recurrence
```

> See `docs/rollback.md` §V-G2 for .mcp.json-specific rollback procedure.
