<!-- SOURCE for .github/copilot-instructions.md — vendored into each repo by adapters/copilot/install.ps1.
     The block between the contract:start/end markers is replaced by the installer on each install.
     Content outside the markers (repo profile section) is preserved by the installer. -->

<!-- enterprise-ai-platform:kernel:start -->
# EAP Execution Contract (kernel)

Single reasoning agent; no sub-agents unless `agents=N` (max 3). Bundle root `.github/ai-platform/` (contract.md §0–§18, standards, rules, knowledge, templates), tools `bin/`. Everything below the kernel is read ON DEMAND: only the section, standard, rule or knowledge file the current step cites.

1. Analyze only what the task requires; never bulk-load or scan the repository. Deterministic discovery: resolve the exact change set from Redmine / MR / commit / branch.
2. Hunks not files; signatures not bodies for unchanged neighbours; depth-1 dependency expansion only. A file enters scope only if it is in the change set, something loaded references it, or naming convention ties it to a loaded symbol.
3. Prove completeness AND no regression before "done" (contract §7–§8).

**Graph first:** before any Grep/Glob over source for a flow, endpoint, dependency, DB impact or symbol usage, use `unified-trace` (`saga`, `trace`, `trace_usages`, `trace_impact`, `index_status`); for a cheap overview use the knowledge-graph MCP's `get_context_pack(topic, max_tokens≤1500)`. Results are an index: Read only the cited file:line ranges, keep VERIFIED/INFERRED/UNRESOLVED tags. Scoped scan only when the graph is unavailable or unresolved.

**Context discipline:** never re-read a file or re-run a search already summarised; drop raw payloads. Builds, tests, log tails, long git output → `eap-run <cmd>` (shared/core/context/eap-run.sh) (else `| tail -n 80`). Budget 150k (`CTX_BUDGET`): when the meter warns, refresh `<project>/.claude/checkpoints/current.md` (agent-state section ≤40 lines) and `/compact`; after resume/compaction Read that checkpoint first. SKILL.md is an index — open `references/` only for the mode needed.

**Lazy loading:** `.github/ai-platform/standards/coding-standards.md` is mandatory for any code change, then standards by language/layer; `rules/` by task type; `knowledge/` via `company-profile.md`'s topic table; tests → `standards/testing/README.md` first.

**Gates:** auto by default — output the §12 analysis blocks, then execute. STOP for approval only when §9 risk is High/Critical (DB/Flyway, permissions, auth/security, billing/financial/patient data, application scope), when `auto=false`, or for approval-only steps (data-correction scripts are never executed). MCP is read-only by allowlist.

**Arguments:** `key=value` — `redmine`, `mr`, `commit`, `branch`, `release`, `target`, `component`, `mode`, `agents`, `auto`. One clarifying question if a required key is missing, then proceed.
<!-- enterprise-ai-platform:kernel:end -->

## Repo profile
<!-- Customize this section per repo. It is preserved across platform updates. -->
Module boundaries and shared packages are declared in `.github/ai-platform/REPO.md`.
