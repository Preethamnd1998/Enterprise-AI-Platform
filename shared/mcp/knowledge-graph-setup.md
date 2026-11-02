# Knowledge/Code-Graph MCP — Setup & Pipeline

How the `unified-trace` MCP server (referenced by the contract kernel's
**Knowledge-graph first (F-KG)** rule) gets its data, and how to keep it
current. This is a company/machine-specific integration, not something the
generic platform ships — document your own paths here if you set this up
for a different workspace.

## The pipeline

```text
Source repositories (UI, BE, ...)
        │  read-only — neither indexer ever writes into these
        ├──────────────────────────────┬─────────────────────────────┐
        ▼                              ▼
Knowledge Graph Generator      Code Cortex               (two separate repos,
  (indexer.py, kg_indexer/)     (prebuilt binary)          see install/bootstrap.sh)
        │  kg-config.env           │  index_repository
        │  controls what's         │  per project, one
        │  included                │  graph db per project
        ▼                          ▼
knowledge_graph.db          ~/.cache/code-cortex-mcp/*.db
  (one combined SQLite         (one db per indexed
   file, KG_DB_PATH)            project, auto-discovered
        │                       via list_projects)
        └──────────────┬────────────────┘
                        ▼
              unified-trace MCP server
  (shared/mcp-tools/unified-trace-mcp/index.js — spawns BOTH of the above
   as its own internal stdio clients; NEITHER is separately registered
   with Claude Code)
                        │
                        ▼
              Claude Code (this platform)
        (contract kernel F-KG: use it before scanning)
```

**Why only one MCP server, not three:** `unified-trace` spawns the
knowledge-graph Python process and the `code-cortex-mcp` binary itself
(`getCodeCortexClient`/`getKnowledgeGraphClient` in `index.js`) — a separate
top-level `claude mcp add knowledge-graph`/`claude mcp add code-cortex-mcp`
registration would just be a second, redundant path to the same data, and
gives an agent two extra tool namespaces to remember to check. `bootstrap.sh`
deliberately builds/installs both (steps 5 and 6) but only registers
`unified-trace` (step 6b) as a Claude Code MCP server.

**No project/repo name list to maintain:** `unified-trace` calls Code
Cortex's own `list_projects` at call time to discover which projects are
indexed, rather than relying on a hardcoded list — index a new project with
`index_repository` and `unified-trace` picks it up on the very next call, no
config change needed. `UT_CODE_CORTEX_PROJECTS` (an env var on the
`unified-trace` registration) is an escape hatch to force a fixed list — set
it only to deliberately scope/narrow a call, not as routine maintenance.

## Keeping the graph current

Both underlying indexes are **snapshots**, not live:

- Knowledge Generator: incremental (unchanged files are skipped). Don't edit
  configs by hand for a new project — run
  `bash ../knowledge-graph-generator/sync-projects.sh` (Windows: `sync-projects.ps1`; set `PROJECTS_DIR` in `paths.local.env` first; `KG_OUTPUT_DIR` / `CBM_CACHE_DIR` index into an isolated location; no names needed: it
  discovers every `Projects/BE/*/pom.xml` and `Projects/UI/*/angular.json`,
  indexes both indexers, is safe to re-run, and removes duplicate edges).
  Each UI repo runs from its own throwaway config (`KG_CONFIG_PATH`) and its
  non-monolith libraries are stored as `<repo>/<library>`, which is what keeps
  embedded copies of shared libraries from overwriting each other. Never run
  with `INCREMENTAL=false` unless you intend a full rebuild — it deletes the DB.
  DB persistence is modelled for SQL strings, JPA (`@Entity`/`@Table`) and Mongo
  (`@Document`, `MongoRepository`/`MongoTemplate`).
- Code Cortex: one index per project (`index_repository` with `repo_path`),
  incremental per project — re-running only re-parses changed files.
- Neither is wired to a CI/merge hook here — reindexing is a manual step.
  `unified-trace`'s own `index_status` tool (optionally with an explicit
  `project` param) reports whether a project's index is `STALE` relative to
  its working tree, without triggering a reindex itself.

## What the platform actually gets from it

Five tools, each merging both sources internally:

- `saga(target, …)` — the COMPLETE flow of one action: UI trigger → endpoint →
  service methods (interface→impl followed) → Feign/WebClient/Kafka hops into
  other services → DB reads/writes, plus `gaps` for every link that couldn't be
  followed. Start here for "what happens when…". See
  [saga-tracing.md](../knowledge/architecture/saga-tracing.md).
- `trace(query, direction, depth)` — a UI API constant, an endpoint
  (`POST /bed/sitemaster`), or a symbol/class/method name. Resolves through
  Knowledge Generator's UI<->API<->architecture layer and/or Code Cortex's
  exact AST call graph, whichever applies to the query shape.
- `trace_usages(symbol, depth)` — every caller (Code Cortex, exact call-site
  level) plus any UI/API references (Knowledge Generator) for a shared
  symbol.
- `trace_impact(target, depth)` — direct+indirect callers/callees, affected
  APIs/UI, and inferred DB tables for a symbol/API/table.
- `index_status(project?)` — read-only health check; `project` omitted
  checks every auto-discovered project.

Every fact is tagged `VERIFIED` (a real graph edge/parsed annotation),
`INFERRED` (a documented heuristic), or `UNRESOLVED`/`unknown` (a reference
exists but didn't resolve) — the kernel rule requires keeping this
distinction visible, never presenting `INFERRED`/`UNRESOLVED` as certain.

**Why "check it first" saves tokens:** a single `trace`/`trace_impact` call
returns exact file/class/method pointers and a confidence-tagged call chain
in one round trip, replacing what would otherwise be several
`search_repositories`/`get_repository_tree`/`get_file_contents` calls to
build the same picture by scanning. It does **not** replace reading real
source before editing — the graph is a navigation/index layer (see
`CLAUDE.md`'s "Graph → targeted source read" section), not implementation
truth; open the exact files/symbols it returns, smallest region first, and
expand only when the graph can't answer or a fact needs source verification.

## If the server isn't connected

Every command that references this pattern falls back to its normal
scan-based discovery (`search_repositories`/`get_repository_tree`/
`get_file_contents`, or the environment-appropriate DB MCP) — `unified-trace`
is an optimization, not a dependency. Nothing in this platform requires it
to function. (An older/partial install might still have the standalone
`knowledge-graph`/`code-cortex-mcp` servers registered instead — see the
contract kernel's F-KG rule for that fallback order.)

## Where "check it first" is wired into the platform

The contract kernel's F-KG rule applies globally. Reinforced explicitly (not
just relying on kernel recall) in each command's own discovery phase:
`bug-fix.md`, `new-development.md`, `migration.md` (mode=functionality
cross-service impact), `data-correction.md` (`get_database_impact` before
live schema inspection), `ui-design-update.md` (both Angular and Flutter
analog-component lookup), `dev.md`, `planning-engine.md` (shared by
`/planning` and referenced by other commands' Phase 1), `plan-reviewer.md`
(verifying a plan's code claims), `redmine-bulk-report.md` (Step 4 code
lookup), and `knowledge-capture.md` (citation verification before writing).
