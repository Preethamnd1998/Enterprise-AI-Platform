<!-- SOURCE for .github/copilot-instructions.md — vendored into each repo by adapters/copilot/install.ps1.
     The block between the contract:start/end markers is replaced by the installer on each install.
     Content outside the markers (repo profile section) is preserved by the installer. -->

<!-- enterprise-ai-platform:kernel:start -->
# Enterprise AI Platform — Execution Contract (kernel)

Single reasoning agent; no sub-agents unless `agents=N` (max 3) is passed. Bundle root: `.github/ai-platform/` (standards, rules, knowledge, templates, prompts, contract.md).

1. Analyze only what the task requires. Never bulk-load or scan the repository.
2. Deterministic discovery: resolve the exact change set from the input (Redmine / MR / commit / branch); never scan to find it.
3. Hunks not files. Signatures not bodies for unchanged neighbours. Depth-1 dependency expansion only.
4. Prove completeness AND no regression before "done" (contract §7–§8).

**No-scan (hard):** a file enters scope only if it is in the change set, something already loaded references it, or naming/package convention ties it to a loaded symbol. Never enumerate.

**Graph first (F-KG):** before any Grep/Glob over source to establish a flow, endpoint, service/Kafka dependency, DB impact or symbol usage, use the `unified-trace` MCP (merges the Knowledge Graph and Code Cortex; auto-discovers indexed projects): `saga` (complete UI→API→service→Feign/Kafka→DB chain; `gaps` lists every unfollowable link — see `.github/ai-platform/knowledge/architecture/saga-tracing.md`), `trace`, `trace_usages`, `trace_impact`, `index_status`. For a token-budgeted topic overview call the knowledge-graph MCP's `get_context_pack(topic, max_tokens≤1500)`. Results are an index, not truth: Read only the cited file:line ranges (offset/limit) and keep each fact's confidence (VERIFIED / INFERRED / UNRESOLVED). Fall back to a scoped scan only when the graph is unavailable or returns unresolved.

**Context discipline (F-CTX):**
- Never re-read a file or re-run a search already summarised this session; keep the summary, drop the raw payload.
- Builds, tests, log tails and long git output run through `eap-run <cmd>` (`shared/core/context/eap-run.sh` in the platform repo) (full output kept in a log; only exit code, errors, failing tests and root-cause frames are printed). Otherwise cap with `| tail -n 80`.
- Context budget 150k tokens (`CTX_BUDGET`). When the prompt-time meter reports over budget: refresh the checkpoint `<project>/.claude/checkpoints/current.md` (requirement, decisions, files touched, next step; ≤40 lines under the agent-state marker) and run `/compact`. On resume or after compaction, Read that checkpoint first instead of re-deriving context.
- Skills: the SKILL.md is an index — open its `references/` files only for the mode the task needs.

**Lazy standards / rules / knowledge:** Read only what the change set needs from `.github/ai-platform/`: `standards/coding-standards.md` is mandatory for any code change, then standards by language/layer touched; `rules/` by task type (coding-style, testing, security, code-review); `knowledge/` via `company-profile.md`'s topic table. Never bulk-load a directory. Writing/reviewing tests → `standards/testing/README.md` first.

**Gates:** Phase 1 (Discovery & Analysis) runs in `auto` mode by default — output the §12 analysis blocks, then continue straight into execution. STOP and ask for approval only when the §9 risk gate is High/Critical (DB/Flyway, permissions, security, auth, billing/financial/patient data, application-scope changes), when `auto=false` is passed, or when a command marks a step approval-only (data-correction scripts are never executed). MCP is read-only by allowlist; write-capable MCP tools stay blocked.

**Arguments:** `key=value` pairs — `redmine`, `mr`, `commit`, `branch`, `release`, `target`, `component`, `mode`, `agents`, `auto`. Ask one clarifying question if a required key is missing, then proceed.
<!-- enterprise-ai-platform:kernel:end -->

## Repo profile
<!-- Customize this section per repo. It is preserved across platform updates. -->
Module boundaries and shared packages are declared in `.github/ai-platform/REPO.md`.
