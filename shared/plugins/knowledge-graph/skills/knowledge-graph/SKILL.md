---
name: knowledge-graph
description: Lifetrenz Knowledge Graph plugin: when to call get_context_pack/search_knowledge/resolve_ui_api directly vs unified-trace saga, output-size rules, index_status and re-indexing. Load for flow/API/DB overviews or when an index is STALE/NOT_INDEXED.
metadata:
  type: skill
  scope: code-intelligence
  plugin: knowledge-graph
---

# Knowledge Graph plugin

Two plugins share one index:

| Plugin | MCP server | Use for |
|---|---|---|
| `enterprise-ai-platform` | `unified-trace` (`saga`, `trace`, `trace_usages`, `trace_impact`, `index_status`) | the complete, confidence-tagged chain of one action across UI, services, Kafka and DB. **Default entry point.** |
| `knowledge-graph` (this) | `knowledge-graph` (`get_context_pack`, `search_knowledge`, `resolve_ui_api`, `find_api`, `get_api_context`, `trace_business_flow`, `get_business_flow`, `get_service_dependencies`, `get_database_impact`, `find_callers`, `find_dependencies`) | a **cheap overview** before any deep trace, or a single targeted lookup. |

unified-trace spawns this plugin's server internally (path-resolver `kgDir()`), so both read
the same `output/knowledge_graph.db`; re-indexing once refreshes both.

## Token rules (hard)

- Start a new topic with `get_context_pack(topic, service?, max_tokens=1500)` — one call, ≤1.5k
  tokens, lists services, entry API, main classes, tables and the flow chain.
- `search_knowledge(query, limit≤10)`, `find_api(..., limit≤10)`: never raise limits to "see
  everything".
- `find_callers` / `find_dependencies` / `get_service_dependencies`: `depth=1` unless a depth-2
  reason is stated.
- Results are an index. Read only the cited file:line; keep confidence tags.
- Do not call both `saga` and `trace_business_flow` for the same target; `saga` already merges it.

## When to use which

| Need | Call |
|---|---|
| "How does X work end to end?" | `unified-trace.saga(target)` |
| Quick orientation before planning | `get_context_pack(topic)` |
| UI constant → endpoint | `resolve_ui_api("CommonApiConstant.X")` |
| Endpoint → controller/service/repo/tables | `find_api(path=...)` then `get_api_context(query)` |
| Which tables a service/API/flow touches | `get_database_impact(service= / api= / flow=)` |
| Who depends on a service (Feign/Kafka) | `get_service_dependencies(service, direction)` |

## Index health and re-indexing

1. `unified-trace.index_status(project?)` → `INDEXED` / `STALE` / `NOT_INDEXED`. Trust results
   only when INDEXED.
2. Re-index only with the user's permission (it rewrites `output/knowledge_graph.db`):
   - all configured projects: `${CLAUDE_PLUGIN_ROOT}/mcp-tools/knowledge-graph-generator/sync-projects.sh`
     (Windows: `sync-projects.ps1`, or `run-knowledge-graph.bat`)
   - one repo: `python indexer.py --repo <path>` from that directory (uses `.venv-mcp`).
   - Code Cortex (AST side used by unified-trace): `code-cortex-mcp cli index_repository --repo_path <root>`.
3. Setup, env vars (`KG_DB_PATH`, `KNOWLEDGE_GRAPH_PATH`, `KG_SOURCE`) and troubleshooting:
   `${CLAUDE_PLUGIN_ROOT}/mcp-tools/knowledge-graph-generator/MCP.md` and `README.md`.
