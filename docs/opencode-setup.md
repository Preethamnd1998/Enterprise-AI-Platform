# OpenCode Setup — Shared Knowledge/Trace Capabilities

OpenCode can be set up independently of Claude Code — it needs the `opencode`
binary and the same `knowledge-graph` / `code-cortex-mcp` sources bootstrap.sh
already clones/builds, nothing Claude-specific.

## What OpenCode gets

Same as Claude Code:
- `knowledge-graph` (wholesale — every tool on it is read-only by design)
- `code-cortex-mcp`, filtered to its 9 read tools (`search_graph`, `trace_path`,
  `get_code_snippet`, `get_architecture`, `search_code`, `query_graph`,
  `get_graph_schema`, `list_projects`, `index_status`) — the 5 mutating ones
  (`delete_project`, `index_repository`, `manage_adr`, `detect_changes`,
  `ingest_traces`) stay denied.
- `unified-trace` — the merged trace()/trace_usages()/trace_impact() layer.

What OpenCode does **not** get: `opencode-bridge`. That's Claude Code's
delegation bridge *to* OpenCode — it doesn't make sense for OpenCode to hold
a bridge to itself. This is a Claude-only capability, not installed for any
other adapter.

## Config block

Add to `~/.config/opencode/opencode.jsonc` (create it with just
`{"$schema": "https://opencode.ai/config.json"}` if it doesn't exist yet):

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "knowledge-graph": {
      "type": "local",
      "command": [
        "<KG_REPO>/.venv-mcp/bin/python",
        "<KG_REPO>/mcp_server_main.py"
      ],
      "environment": { "KG_DB_PATH": "<KG_REPO>/output/knowledge_graph.db" },
      "enabled": true
    },
    "code-cortex-mcp": {
      "type": "local",
      "command": ["<path to installed code-cortex-mcp binary>"],
      "enabled": true
    },
    "unified-trace": {
      "type": "local",
      "command": ["node", "<PLATFORM_REPO>/shared/mcp-tools/unified-trace-mcp/index.js"],
      "enabled": true
    }
  },
  "tools": {
    "code-cortex-mcp_*": false,
    "code-cortex-mcp_get_architecture": true,
    "code-cortex-mcp_get_code_snippet": true,
    "code-cortex-mcp_get_graph_schema": true,
    "code-cortex-mcp_index_status": true,
    "code-cortex-mcp_list_projects": true,
    "code-cortex-mcp_query_graph": true,
    "code-cortex-mcp_search_code": true,
    "code-cortex-mcp_search_graph": true,
    "code-cortex-mcp_trace_path": true
  }
}
```

Replace `<KG_REPO>`, `<path to installed code-cortex-mcp binary>`, and
`<PLATFORM_REPO>` with the actual paths on this machine (matching
`bootstrap.sh`'s `$KG_REPO`, `$CORTEX_REPO`, `$PLATFORM_REPO`).

`unified-trace-mcp` needs `npm install` run once inside
`shared/mcp-tools/unified-trace-mcp/` before OpenCode can spawn it
(same for `code-cortex-mcp`/`knowledge-graph`, which bootstrap.sh already
builds/configures as part of steps 5-6 regardless of which adapter uses them).

## Why this is a manual step today

Writing JSONC (a superset of JSON with comments) programmatically from a
bash script without clobbering a human-edited file's comments/formatting
isn't a small addition — bootstrap.sh detects whether this block is already
present (`grep -q '"unified-trace"'`) and tells you to add it here rather
than silently rewriting your config. Automating the write itself is a
reasonable follow-up once there's a real need for unattended OpenCode-only
provisioning.
