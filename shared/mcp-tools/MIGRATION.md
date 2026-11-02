> **Superseded (2026-11-02):** the Knowledge Graph Generator was NOT moved into this repo. It remains its own repository; this file records an exploratory copy that is gitignored here. KG changes were committed to knowledge-graph-generator (branch `feature/gateway-prefix-overrides-engine-merge`, MR !1). Historical record below.

# MCP consolidation — migration record

Copied (not moved) on 2026-11-02. Originals untouched; no commit/push done.

| Component | Original path | Remote | Branch | SHA | Worktree at copy |
|---|---|---|---|---|---|
| knowledge-graph-generator (+ vendored code-cortex/) | `local-ai-environment/knowledge-graph-generator` | https://git.lifetrenz.com/Preetham.ND/knowledge-graph-generator.git | main | 7c2ab47 | dirty (16 files: 8 M, 8 ?? — all included) |
| code-cortex upstream (vendored inside the above) | github.com/tigercosmos/code-cortex-mcp | MIT | v0.21.0 | 5a653df (see code-cortex/VENDORED_FROM.md) | n/a |
| unified-trace-mcp, opencode-mcp-bridge, kafka-mcp | already in this repo | this repo | main | 74a75c3 | dirty (pre-existing) |
| `local-ai-environment/code-cortex-mcp` (outer upstream clone) | github.com/tigercosmos/code-cortex-mcp | | main | 1ac77fd | NOT copied — duplicate of vendored copy; kept as backup |

## Method
`git ls-files --cached --others --exclude-standard` in the source repo -> `rsync --files-from`.
Result: 6683 files, ~1.2 GB, identical to source (verified with `diff -rq`).

## Not copied (generated / machine-local / ignored upstream)
`.git`, `.venv-mcp`, `output/` (672 MB DB, rebuilt by indexer), `kg-config.env`,
`__pycache__`, `.pytest_cache`, `.DS_Store`, `code-cortex/build/`, `code-cortex/.claude/`,
`code-cortex/docs/TEST_PLAN.md` (gitignored upstream), installed binaries.

## Preserved
`code-cortex/{LICENSE,THIRD_PARTY.md,UPSTREAM_SYNC.md,VENDORED_FROM.md}` unchanged.

## Size analysis (1.1 GB tracked code-cortex)
~1.1 GB is `internal/cbm` — mostly generated tree-sitter `vendored/grammars/*/parser.c`
(largest: lean 102 MB, systemverilog 61 MB). They are compiled by CMake, so removing any
breaks the source build. Only `docs/benchmarks` (129 MB, ~5000 files) is not build-required;
kept anyway (no silent exclusion). Possible later reduction needs CMake edits — not done.

## Known leftovers (Phase 4)
Personal/Windows paths remain in KG docs (`README.md`, `AGENTS.md`, `MCP.md`),
`run-knowledge-graph.bat` comment, and `sync-projects.sh` default ROOT_PATH.
Scan for secrets: none found (matches were parser code / sqlite / tree-sitter sources).

## Runtime + index validation (2026-11-02)
- `npm run platform:install -- --apply --with-cortex`: in-repo `.venv-mcp` (Python 3.14.7, mcp installed) created; npm deps present; Code Cortex 0.21.1 already installed (`~/.local/bin`), not rebuilt.
- `sync-projects.sh` against the in-repo KG: 17 BE + 14 UI projects discovered; KG db 751 MB (legacy 704 MB, untouched); Code Cortex 31 projects indexed into an ISOLATED cache (`.cache/code-cortex`, 3.0 GB, gitignored) — default per-user cache untouched.
- Result: in-repo KG lacks gateway prefixes for core / ipd-clinical / ums because those services' CURRENT branches use `${SPRING_APPLICATION_NAME}` (or no name) in bootstrap.yml; the Oct-10 legacy index has them. Gateway-URL saga queries for those services fail on the new index (saga suite 7/13 vs 12/13 legacy). Live setup pinned to legacy with `KG_SOURCE=legacy` (paths.local.env) until approved. Legacy fallback NOT removable yet.
