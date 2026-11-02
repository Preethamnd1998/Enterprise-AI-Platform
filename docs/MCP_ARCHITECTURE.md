# MCP architecture

`shared/core/mcp-registry/registry.json` is the single source: id, description, runtime
(node|python|binary), entry, dependencies, env vars, platforms, healthcheck, permissions,
`expose` (offered to clients?) and `clients`.

| id | runtime | exposed | note |
|---|---|---|---|
| unified-trace | node | claude, cursor, opencode | spawns knowledge-graph + code-cortex |
| opencode-bridge | node | claude, cursor | sandboxed to PROJECTS_DIR / OPENCODE_BRIDGE_ALLOWED_ROOTS |
| kafka-mcp | node | no | needs per-env broker config; define in project `.mcp.json` |
| knowledge-graph | python (.venv-mcp) | no (internal) | `mcp_server_main.py`, in the separate knowledge-graph-generator repo |
| code-cortex | binary | no (internal) | `code-cortex-mcp(.exe)`; vendored source under knowledge-graph-generator/code-cortex (separate repo) |

Resolution (path-resolver): venv python `.venv-mcp/bin/python` | `.venv-mcp/Scripts/python.exe`;
Code Cortex: `UT_CODE_CORTEX_BIN` > `CODE_CORTEX_PATH` > `~/.local/bin` | `%LOCALAPPDATA%\Programs\code-cortex-mcp` > in-repo build > PATH.
Knowledge Graph selection (`KG_SOURCE` in paths.local.env): `auto` (default; in-repo once venv+index exist, else legacy sibling if runnable) | `legacy` | `in-repo`.
Code Cortex index store: per-user `~/.cache/code-cortex-mcp`; override with `CBM_CACHE_DIR` (forwarded by unified-trace).
Validate: `npm run mcp:doctor`; start every MCP for real: `npm run mcp:selftest`.

Knowledge Graph indexer notes:
- Gateway prefix = each service's `spring.application.name` (Spring Cloud Gateway discovery locator). Resolution: literal > env var > placeholder default > explicit override (`knowledge-graph-generator/gateway-prefix-overrides.json`, evidence required) > unresolved (flagged, never guessed). Duplicates/conflicts are reported; `KG_GATEWAY_STRICT=1` makes them errors; `KG_GATEWAY_PREFIX_OVERRIDES` selects another file.
- `DB_TABLE.metadata.engines` lists every access mechanism (jpa/sql/mongo); `engine` is the strongest non-sql one (absent = sql). Merging is order-independent.
- Index into an isolated folder with `KG_OUTPUT_DIR=<dir> sync-projects.sh`; Code Cortex store with `CBM_CACHE_DIR`. Parity findings: `docs/KG_PARITY_REPORT.md`.
