# Knowledge Graph MCP — Setup & Pipeline

How the `knowledge-graph` MCP server (referenced by the contract kernel's
**Knowledge-graph first (F-KG)** rule) gets its data, and how to keep it
current. This is a company/machine-specific integration, not something the
generic platform ships — document your own paths here if you set this up
for a different workspace.

## The pipeline

```text
Source repositories (UI-BE, lifetrenz-core, ...)
        │  read-only — the indexer never writes into these
        ▼
Knowledge Graph Generator          (a separate repo: indexer.py, kg_indexer/)
        │  full reindex on every run — kg-config.env controls what's included
        ▼
Knowledge Graph DB                 (knowledge_graph.db — a plain SQLite file)
        │  OUTPUT_DIR in kg-config.env decides where this lands
        ▼
Knowledge Graph MCP Server         (mcp_server/, in the same generator repo)
        │  KG_DB_PATH env var points it at the .db file above
        ▼
Claude Code (this platform)        (contract kernel F-KG: use it before scanning)
```

On this machine: the generator lives at
`D:\GitLab-Workspace\Knowledge Graph Generator`, configured
(`kg-config.env`, `OUTPUT_DIR=`) to write the combined graph to
`D:\GitLab-Workspace\Knowledge Repo\Knwoledge graphs\knowledge_graph.db` —
inside the company knowledge workspace (see `company-profile.md`'s
knowledge table), not inside the generator repo's own `output/` folder. The
MCP server is registered in the workspace's shared `.mcp.json` with
`KG_DB_PATH` pointing at that same file.

## Keeping the graph current

The graph is a **snapshot**, not live — it reflects the code as of the last
`python indexer.py` run (or `run-knowledge-graph.bat`). It does not
auto-update on every commit. Practical implications:

- After a significant merge/refactor in the indexed services, the graph can
  go stale — `get_source_evidence`'s file/line pointers may drift, and a
  newly-added endpoint/flow simply won't be found (`not_found`, not a wrong
  answer) until the next reindex.
- Re-running is safe and cheap relative to a full-repo AI scan: each
  target's `.db` file is fully rebuilt from scratch (see the generator's own
  README, "Re-running / incremental behavior") — never appended to.
- There's no CI hook wiring the reindex to a merge event in this setup —
  re-running is a manual step. If graph staleness becomes a recurring
  problem, that's the next thing to automate (out of scope here).

## What the platform actually gets from it

Twelve read-only tools (`find_service`, `get_service_context`,
`get_service_dependencies`, `find_api`, `get_api_context`, `resolve_ui_api`,
`get_business_flow`, `trace_business_flow`, `get_database_impact`,
`find_callers`, `find_dependencies`, `search_knowledge`,
`get_source_evidence`, `get_context_pack`) — see the generator repo's
`MCP.md` §6–§8 for full parameters and example output. Every fact is tagged
`VERIFIED` (a real graph edge/parsed annotation), `INFERRED` (a documented
heuristic — e.g. a table name guessed by stripping `Repository` off a class
name), or `UNRESOLVED`/`unknown` (a reference exists but didn't resolve) —
the kernel rule requires keeping this distinction visible, never presenting
`INFERRED`/`UNRESOLVED` as certain.

**Why "check it first" saves tokens:** a single `get_context_pack` or
`trace_business_flow` call returns exact file/class/method pointers and a
confidence-tagged call chain in one round trip, replacing what would
otherwise be a `search_repositories` + several `get_repository_tree`/
`get_file_contents` calls to build the same picture by scanning. It does
**not** replace reading real source before editing — the graph is a
navigation/index layer (see `CLAUDE.md`'s "Graph → targeted source read"
section), not implementation truth; open the exact files/symbols it returns,
smallest region first, and expand only when the graph can't answer or a fact
needs source verification.

## If the server isn't connected

Every command that references this pattern falls back to its normal
scan-based discovery (`search_repositories`/`get_repository_tree`/
`get_file_contents`, or the environment-appropriate DB MCP) — the
knowledge-graph server is an optimization, not a dependency. Nothing in this
platform requires it to function.

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
