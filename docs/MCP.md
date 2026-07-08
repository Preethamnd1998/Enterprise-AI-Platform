# MCP Architecture — Enterprise AI Platform

**Version:** v4.3.0 | **Authority:** `shared/mcp/tool-allowlists.md`

MCP (Model Context Protocol) connects the AI to external systems. The platform uses a **strict allowlist** that fails closed: any tool not explicitly approved is denied.

---

## Architecture Overview

```
Claude Code session
  │
  ├── ~/.claude/settings.json ──── deny: ["mcp__*"]  (catch-all deny)
  │                                allow: [28 specific tools]  (explicit allow)
  │
  ├── .mcp.json (per repo, gitignored)
  │     ├── mcp__gitlab-reader   → read-only GitLab custom server
  │     ├── mcp__redmine-reader  → read-only Redmine server
  │     ├── mcp__canary_mongo_db → read-only MongoDB server
  │     └── mcp__postgres-reader → read-only PostgreSQL server
  │
  └── Credentials via ${env:VARNAME}  (never literals in .mcp.json)
```

All MCP servers are **read-only by construction**. The custom GitLab server (`gitlab-reader`) has no write tools. Database servers connect with read-only DB roles. The allowlist provides defense-in-depth: even if a server added a write tool, it would be denied by the catch-all.

---

## MCP Servers

### mcp__gitlab-reader (17 tools)

Custom Lifetrenz read-only GitLab server. Not the official GitLab MCP.

| Tool | Purpose |
|---|---|
| `get_file` | Read file content at path/ref |
| `get_commit_diff` | Diff for a specific commit SHA |
| `get_branch_diffs` | Branch vs merge-base diff |
| `get_merge_request_diffs` | MR file and hunk diffs |
| `list_merge_request_changed_files` | Changed file paths in an MR |
| `list_commits` | Commits on a branch or tag range |
| `get_merge_request` | Single MR metadata |
| `list_merge_requests` | MR list with filters |
| `get_issue` | Single GitLab issue |
| `list_issues` | Issue list with filters |
| `get_project` | Project metadata |
| `list_projects` | Project list |
| `list_repository_tree` | Directory listing at path |
| `get_tags` | Tag list |
| `get_pipeline` | Pipeline status |
| `list_pipelines` | Pipeline list |
| `get_repository_file` | Alias for get_file |

### mcp__redmine-reader (3 tools)

Read-only Redmine issue tracker integration.

| Tool | Purpose |
|---|---|
| `redmine_get_issue` | Single issue by ID |
| `redmine_list_issues` | Issue list with filters |
| `redmine_get_project` | Project metadata |

### mcp__canary_mongo_db (4 tools)

Read-only MongoDB connection. Requires a read-only DB role.

| Tool | Purpose |
|---|---|
| `find` | Query documents |
| `aggregate` | Aggregation pipeline |
| `list-collections` | Collections in a database |
| `list-databases` | Accessible databases |

### mcp__postgres-reader (4 tools)

Read-only PostgreSQL connection. Requires SELECT-only DB role.

| Tool | Purpose |
|---|---|
| `query` | SELECT-only SQL query |
| `list_tables` | Tables in a schema |
| `describe_table` | Column and type metadata |
| `list_schemas` | Schema list |

**Total: 28 allowed tools.** All other `mcp__*` tools are denied by the catch-all.

---

## Credential Configuration

Credentials are never stored in version-controlled files. The `.mcp.json` file is gitignored.

### Environment Variables Required

| Variable | Used by | Description |
|---|---|---|
| `GITLAB_PAT` | gitlab-reader | GitLab personal access token (read_api + read_repository only) |
| `GITLAB_BASE_URL` | gitlab-reader | GitLab instance URL, e.g. `https://git.lifetrenz.com` |
| `GITLAB_MCP_PATH` | gitlab-reader | Path to `gitlab-reader` server `index.js` |
| `REDMINE_API_KEY` | redmine-reader | Redmine API key (read-only user) |
| `REDMINE_BASE_URL` | redmine-reader | Redmine instance URL |
| `MONGO_URI` | canary_mongo_db | MongoDB connection string (read-only user) |
| `POSTGRES_CONNECTION_STRING` | postgres-reader | PostgreSQL connection string (read-only role) |

### Setup

1. Copy the template: `Copy-Item shared/mcp/.mcp.json.template .mcp.json`
2. Set environment variables in your shell profile or `.env` file
3. Never put literal credentials in `.mcp.json`

The `.mcp.json` template uses `${env:VARNAME}` syntax — Claude Code substitutes these at server launch time.

See `docs/mcp-setup.md` for the full step-by-step credential setup guide.
See `docs/secrets.md` for the secret management policy.

---

## Allowlist vs Denylist

The platform uses an **allowlist** (fails closed), not a denylist (fails open).

| Pattern | Behavior on new tool | Risk |
|---|---|---|
| Denylist | New tool is auto-allowed until someone adds it to deny | High — new write tools exposed by default |
| **Allowlist (current)** | New tool is auto-denied until someone adds it to allow | Low — new tools blocked by default |

This was the F4 defect in v3.0 (denylist) and was fixed in v3.1 with the allowlist pattern.

---

## Adding a New MCP Tool

To add a new tool to the allowlist:

1. Add the tool name to `shared/mcp/tool-allowlists.md` under the appropriate server
2. Add the same string to `adapters/claude/config/settings.json` `allow[]`
3. Update `adapters/claude/capability-map.yml` if it adds a new capability class
4. Run CI — `validate-registry` must pass
5. Open an MR; requires Platform Architect approval

**Do not add tools that:**
- Can write, create, update, or delete data
- Can push, merge, or modify version control state
- Can send messages, emails, or notifications
- Have unclear scope

---

## Platform Support

MCP is available only on Claude Code. Copilot and OpenCode do not have MCP hook APIs.

| Platform | MCP support |
|---|---|
| Claude Code | Full — 4 servers, 28 tools |
| Copilot | None — no MCP hook API |
| OpenCode | None — no MCP hook API |

For security-sensitive tasks (bug fixes requiring GitLab history, data corrections requiring DB reads), use Claude Code.

---

## References

- `shared/mcp/tool-allowlists.md` — authoritative tool allowlist (28 tools)
- `docs/mcp-setup.md` — full credential setup guide
- `docs/secrets.md` — secret management policy
- `adapters/claude/config/settings.json` — allowlist implementation
- `docs/security.md` — MCP security threat model
