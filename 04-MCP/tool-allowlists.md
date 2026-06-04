# MCP Tool Allowlists v3

The platform exposes ~120+ MCP tools. Every tool schema injected into the prompt is
fixed token overhead **every turn**. This was a top-3 token sink. Rule:

> **Expose the smallest read-only toolset each agent needs. Hide everything else —
> especially every write/mutating tool.** This is read-only intelligence; the agent
> proposes changes, it does not push them.

Enforce this in the MCP client / agent config (tool filter), not in prose.

---

## Globally HIDDEN for all 4 agents (never needed, high risk)

Any tool that mutates state:

- **GitLab writes:** `create_*`, `update_*`, `delete_*`, `merge_merge_request`,
  `approve_*`, `unapprove_*`, `push_files`, `fork_repository`, `create_branch`,
  `create_or_update_file`, all `*_note*`, `*_emoji_reaction`, `*_draft_note`,
  `*_label`, `*_todo*`, `resolve_*`, `upload_*`, `*_ci_lint`.
- **Redmine writes:** `redmine_create_*`, `redmine_update_*`, `redmine_delete_*`,
  `redmine_log_time`.
- **DB/Mongo writes:** `insert-many`, `update-many`, `delete-many`, `drop-*`,
  `create-collection`, `create-index`, `rename-collection`, any non-`query`/non-`find`.
- **Browser automation writes:** `click`, `fill*`, `type_text`, `drag`, `upload_file`,
  `handle_dialog`, `navigate_page` (except read-only capture flows).

---

## Agent 1 — Bug Fix  (≤ 2 MCP servers)

**Allow:**
- `redmine-reader`: `redmine_get_issue`
- `gitlab-reader`: `get_file_contents`, `get_file_blame`, `get_commit`, `get_commit_diff`
- (UI bug only) `chrome-devtools`: `take_snapshot`, `list_console_messages`, `take_screenshot`
- (data bug only) one `*-db` `query` tool, read-only

**Hide:** everything else, incl. all GitLab MR/branch/tree/search tools (the stack
trace already names the files — no search needed).

---

## Agent 2 — Planning / Feature  (≤ 2 MCP servers)

**Allow:**
- `redmine-reader`: `redmine_get_issue`, `redmine_get_project`, `redmine_get_wiki_page`
- `gitlab-reader`: `search_repositories` (one analog lookup), `get_repository_tree`
  (one module, shallow), `get_file_contents`

**Hide:** all diff/commit/MR tools, all DB, all browser. Planning reads *structure*,
not diffs or implementations.

---

## Agent 3 — UI Redesign  (≤ 1 MCP server)

**Allow:**
- `gitlab-reader`: `get_file_contents` (the single component only, if not pasted)
- `chrome-devtools` (optional, read-only capture): `take_screenshot`, `take_snapshot`,
  `list_console_messages`

**Hide:** ALL backend, DB, GitLab diff/MR/commit/tree/search, all writes. The
screenshot + component + Frontend standards are the complete spec.

---

## Agent 4 — Migration / Cherry-Pick  (≤ 2 MCP servers)

**Allow (discovery — pick by input type):**
- `redmine-reader`: `redmine_get_issue` (to resolve linked MR/commits)
- `gitlab-reader`: `get_merge_request_diffs`, `list_merge_request_changed_files`,
  `get_merge_request_file_diff`, `get_commit_diff`, `get_branch_diffs`, `list_commits`,
  `get_file_contents` (target-branch check for conflicts / missing deps)
- (compat check) one `*-db` `query` tool, read-only — for SQL/Flyway verification

**Hide:** all GitLab write/merge tools (read + diff only), browser, issue/MR note tools.

---

## Why this matters

Hiding ~110 tools removes tens of thousands of fixed prompt tokens per turn before any
work begins — and removes the entire class of "agent accidentally pushed/merged"
incidents. It is the single cheapest high-impact change in the platform.
