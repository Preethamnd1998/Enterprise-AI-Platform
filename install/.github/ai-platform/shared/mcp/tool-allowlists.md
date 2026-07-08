# MCP Tool Allowlists
**Authority:** This file is the single source of truth for all MCP tool allow/deny decisions.  
**Updated:** 2026-07-07 (Phase B)  

The `adapters/claude/config/settings.json` `allow[]` array is generated from this list.
Any tool NOT in this list is **denied** by `"mcp__*"` in the deny array.

---

## Allowlist by server

### `mcp__gitlab-reader` — Custom GitLab read-only server

All tools below are read-only. The custom server has no write tools by design.

| Tool | Purpose | Risk |
|---|---|---|
| `get_file` | Read file content at a path/ref | Low |
| `get_repository_file` | Alias for get_file | Low |
| `get_commit_diff` | Diff for a specific commit SHA | Low |
| `get_branch_diffs` | Diff between branch and merge-base | Low |
| `get_merge_request_diffs` | MR file+hunk diffs | Low |
| `list_merge_request_changed_files` | MR changed file paths | Low |
| `list_commits` | Commit list on a branch/tag range | Low |
| `get_merge_request` | Single MR metadata | Low |
| `list_merge_requests` | MR list with filters | Low |
| `get_issue` | Single GitLab issue | Low |
| `list_issues` | Issue list with filters | Low |
| `get_project` | Project metadata | Low |
| `list_projects` | Project list | Low |
| `list_repository_tree` | Directory listing at path | Low |
| `get_tags` | Tag list | Low |
| `get_pipeline` | Pipeline status/metadata | Low |
| `list_pipelines` | Pipeline list | Low |

**Blocked (not in allow, caught by `mcp__*` deny):**
- Any future write tools added to this server
- `create_*`, `update_*`, `delete_*`, `push_*`, `merge_*` — denied automatically

---

### `mcp__redmine-reader` — Redmine read-only server

| Tool | Purpose | Risk |
|---|---|---|
| `redmine_get_issue` | Single Redmine issue by ID | Low |
| `redmine_list_issues` | Issue list with filters | Low |
| `redmine_get_project` | Project metadata | Low |

---

### `mcp__canary_mongo_db` — MongoDB read-only

| Tool | Purpose | Risk |
|---|---|---|
| `find` | Query documents | Low |
| `aggregate` | Aggregation pipeline | Low |
| `list-collections` | List collections in a DB | Low |
| `list-databases` | List accessible databases | Low |

**Blocked:** `insertOne`, `updateOne`, `deleteOne`, `bulkWrite`, `drop` — denied by `mcp__*`.

---

### `mcp__postgres-reader` — PostgreSQL read-only

| Tool | Purpose | Risk |
|---|---|---|
| `query` | Read-only SQL SELECT query | Low* |
| `list_tables` | List tables in a schema | Low |
| `describe_table` | Column/type metadata | Low |
| `list_schemas` | List schemas | Low |

\* `query` must enforce SELECT-only at the DB user level (see `docs/mcp-setup.md`).
The read-only role prevents writes even if a non-SELECT query is attempted.

**Blocked:** `execute`, `insert`, `update`, `delete` — denied by `mcp__*`.

---

## Upgrade policy

To add a new tool to the allowlist:
1. Add the tool name to this file under the appropriate server
2. Add the same string to `adapters/claude/config/settings.json` `allow[]`
3. Add a capability-map entry if it adds a new capability class
4. Bump version in `adapters/claude/capability-map.yml`
5. PR must pass `validate-registry` CI job

**Never add a tool that:**
- Can write, create, update, or delete data
- Can push, merge, or modify version control state
- Can send messages, emails, or notifications
- Has unclear or undocumented scope

---

## Why allowlist, not denylist

A denylist **fails open**: any new tool added to an MCP server is automatically allowed
until someone adds it to the deny list. This was F4 defect in v3.0.

An allowlist **fails closed**: any new tool is automatically denied until someone
explicitly approves it. This is the F4 fix in v3.1+.

Reference: `docs/sp-01-result.md`, `docs/security.md`.
