# Context Optimization Architecture (v4.14)

Goal: fewer tokens per task with the same quality, by (1) loading less on every turn,
(2) retrieving code context through the graph instead of scanning, (3) keeping sessions
short and resumable, and (4) measuring all of it.

## Measured baseline (2026-11-13, 30 days of transcripts)

| Metric | Before |
|---|---|
| First-turn (always-on) context | 35k min · 65k median · 105k max |
| Context per turn | 318–328k median · 715k p90 · 967k max |
| Turns above 150k | 78–81 % |
| Tool-result tokens | Bash 67 % (grep/head/sed/cat/git output), Read 15 % |
| Graph-first ratio (unified-trace calls ÷ Grep/Glob/Read/Bash calls) | 0.002 |

Snapshot files: `Docs/MY PLANS/context-optimization/baseline-2026-11-13.{json,md,html}`.
Re-run after a week: `/usage-report tokens days=7 baseline=<that json>`.

## Layers

```
always-on   ~/.claude/CLAUDE.md = contract KERNEL only (≈3.7 KB) + plugin skill/command descriptions
on demand   plugin bundle ai-platform/ (contract §0–§18, standards, rules, knowledge, templates, prompts)
            skills: SKILL.md index first, references/ per mode (running-locally-skill is the model)
retrieval   unified-trace (EAP plugin) → spawns knowledge-graph (KG plugin) + Code Cortex; compact output by default
            knowledge-graph plugin exposed directly for get_context_pack(max_tokens≤1500) / search_knowledge
governor    bin/eap-run  — build/test/log output filter (exit code, errors, failing tests, root-cause frames, tail)
meter       hooks/scripts/ctx-meter.cjs — UserPromptSubmit advisory above CTX_BUDGET (150k), Stop → token record + checkpoint
memory      <project>/.claude/checkpoints/current.md (structural part auto, agent-state part by the agent) + auto-memory
mcp         bin/mcp-env — profiles (core, monitoring, db-<env>, mongo, plugin-provided) instead of 48 always-on servers
routing     command frontmatter `model:` — light commands run on Haiku/Sonnet, implementation commands inherit
dashboard   bin/ctx-report.py → Markdown / JSON / self-contained HTML; `/usage-report tokens`
```

## What changed and why

| Change | Token effect |
|---|---|
| User-level copies of plugin skills/commands/standards/knowledge removed; installer no longer creates them | each skill/command description was loaded twice per turn |
| `supermatt` synced plugin disabled, user-level mattpocock duplicates removed | 11 skills were loaded three times |
| CLAUDE.md = kernel only (was kernel + full v3 contract, 20.5 KB) | −≈4k tokens on every turn |
| Trail/graft hooks (9 hook entries) and cbm reminder hooks removed; Code Cortex search augmenter kept | less hook output per tool call; kernel already carries the graph-first rule |
| Global duplicates of unified-trace / opencode-bridge and the broken mattermost server removed from ~/.claude.json | plugin owns them; duplicate servers were starting twice |
| Project `.mcp.json` split into profiles; Mongo profile (10 servers failing on every start) not active by default | monitoring servers kept, as requested |
| unified-trace `trace`/`trace_usages`/`trace_impact`: `format: compact` default, `max_nodes` (60) | compact text is < 35 % of the JSON graph size (unit-tested) |
| Approval gate default = auto (risk gate High/Critical still stops; `auto=false` restores the stop) | one fewer round trip per command |
| Context discipline in kernel + ctx-meter advisory + checkpoint | sessions stop growing past the budget; resume costs one file read |
| eap-run | shell output is the largest tool-result source |

## Knowledge Graph plugin

`dist/plugins/claude-code/plugins/knowledge-graph` — MCP server `knowledge-graph` (launched by
`shared/core/launcher.js knowledge-graph`), the generator/indexer, and the `knowledge-graph`
skill. The EAP plugin's unified-trace resolves the same directory through path-resolver
`kgDir()` (registry `launchSpec` now uses the same function), so both plugins read one
`output/knowledge_graph.db`. Install: `claude plugin install knowledge-graph@eap-local`.

## Operating it

- `/usage-report tokens [days=N] [baseline=<json>] [html=<out>]` — dashboard.
- `bin/mcp-env list | use <profiles…> | add <profile>` — switch DB environments per task.
- `bin/eap-run -- mvn -q test` — filtered build/test output; full log path printed.
- Budget: `CTX_BUDGET`, log dir `USAGE_LOG_PATH`, checkpoint dir `CHECKPOINT_DIR` in `~/.claude/paths.env`.
- Cost in the report appears only for models listed in `bin/pricing.json` (edit it; nothing is guessed).

## Compatibility

Copilot and OpenCode adapters consume the same `shared/commands` (now auto-gate wording) and
the kernel through their own files; `${CLAUDE_PLUGIN_ROOT}` paths in the new `/usage-report
tokens` mode are Claude-specific (other clients run `shared/core/context/ctx-report.py` directly).
