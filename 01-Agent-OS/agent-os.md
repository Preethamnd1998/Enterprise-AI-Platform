# Agent OS — Consolidated Operating Policy v3

The single operating policy for the platform. It is the one source of truth for
budgets, discovery, dependency, validation, risk, and cost rules. The active v3
architecture is exactly four files:

- `CLAUDE.md` — entrypoint, task routing, lazy-loading rules
- `01-Agent-OS/agent-os.md` — this policy
- `02-Main-Agents/agents.md` — the four agent profiles + dual migration mode
- `04-MCP/tool-allowlists.md` — per-agent MCP tool exposure

No other policy, workflow, sub-agent, or archive file exists or should be referenced.

---

## 1. Prime directives

1. **Analyze only what the task requires.** Eager/whole-repo loading is forbidden.
2. **One main agent per task. No agent chains.** Discovery, dependency expansion,
   and validation are deterministic steps the single agent drives — not sub-agents.
3. **Deterministic discovery, not exploration.** Resolve the exact change set; never
   scan to find it.
4. **Prove completeness; never assume it.** (Lifetrenz rule.)

---

## 2. Budgets (hard limits — enforce, don't just request)

| Task | Max files | Token budget | Notes |
|---|---|---|---|
| Bug Fix | 10 | ≤ 6k working | Stack trace = the dependency map |
| Planning / Feature | 3–5 (structure only) | ≤ 10k | Read shapes, not implementations |
| UI Redesign | 5 | ≤ 8k + image | No backend/DB analysis |
| Migration — Exact | 15 | ≤ 12k | Diff-anchored, compile-gap depth-1 only |
| Migration — Functionality | 40 | ≤ 40k | Bounded capability closure (see §6) |

Other ceilings: ≤ 2 MCP servers/task, ≤ 10 MCP calls/task, ≤ 20 commits, ≤ 3 branch
comparisons. When a budget is hit: **stop, report what's covered and what's missing** —
never silently truncate, never auto-expand.

---

## 3. File & context discipline

- **Hunks not files; signatures not bodies** for unchanged neighbors.
- **Never re-read** a file already analyzed this session — reuse its summary.
- Re-read only if: the file changed, the user requests it, or prior findings were invalidated.
- Discard raw MCP payloads after extracting what you need; keep summaries.
- Ignore by default: `node_modules`, `dist`, `build`, `target`, `coverage`, logs,
  generated/binary/vendor files.

---

## 4. Dependency expansion

- **Depth-1 by default**: only the symbols the change directly references.
- Deeper expansion is an **explicit, budget-charged, logged** tool action that must
  state why it's needed. No automatic depth-2.
- Stay inside the **feature/module boundary**; do not wander into sibling modules
  (billing, pharmacy, inventory…) unless a real reference crosses into them.

---

## 5. Lazy standards loading

Load `00-Enterprise-Knowledge` slices scoped to the languages in the change set only
(see `CLAUDE.md` §4). Standards load **once** per session and are reused — never reloaded.

---

## 6. Migration — dual mode (the agent's defining choice)

Mode is chosen by the user per request; both share discovery + the diff semantic filter,
and diverge only at expansion. Full profile in `02-Main-Agents/agents.md`.

- **Mode 1 — Exact (diff-based):** migrate only functional hunks (drop whitespace,
  comment-only, import-reorder, formatting). Expand depth-1 **only** when a referenced
  symbol is missing on the target (compile-completeness). Output = smallest patch.
- **Mode 2 — Functionality (capability-based):** seed from diff symbols, then close
  the capability along **typed references + naming conventions**, walled by the module
  boundary and capped by budget (§2). Migrate only the capability's **delta vs target**
  (skip files already identical/compatible on target). Completeness-first; report gaps.

Neither mode scans the repo: files enter scope only via real references/conventions
inside the boundary.

---

## 7. Completeness validation (gate before "done")

Validate functionality, not file count. Migration/feature completeness checklist:

Controller · Service · Repository · DTO · Mapper · Entity · Enum · Constants · Validator ·
SQL · Flyway (exists + ordered) · Angular Component · UI Service · Model · Route ·
Permission · Translation · Audit logic · Tests.

PASS only when every **applicable** check is satisfied and no referenced symbol is
missing on target. Cheap checks (compile/lint/Flyway order) run as deterministic steps;
the LLM judges only genuinely ambiguous cases.

---

## 8. Regression validation gate (mandatory — distinct from completeness)

Completeness proves the change *added* everything it needs. Regression proves it
*broke nothing that already worked*. Both gates must pass. Every feature, migration,
bug fix, and redesign must verify:

- **Existing APIs** still work (signatures, contracts, status codes unchanged unless intended).
- **Existing UI flows** still work (navigation, forms, bindings intact).
- **Existing permissions** still work (no role/scope regressions).
- **Existing integrations** still work (Kafka, downstream/cross-service calls).
- **Existing Flyways** remain valid (no reordering, no edits to applied migrations).
- **Existing database behavior** remains compatible (schema/query backward-compatible).
- **Existing tests** remain valid (existing unit/integration/regression tests still pass).

**Failure of any existing behavior = FAIL.** Completeness alone is insufficient; a
change that is "complete" but regresses existing behavior must not be marked done.

---

## 9. Risk gate (require approval before executing)

Auto-approved: Low/Medium (UI, styling, business logic, service/API edits).
Approval required: High/Critical — DB/Flyway changes, permissions, security, auth,
billing/financial/patient data, or anything at application scope.

---

## 10. Stop conditions

Stop when: objective met AND validation PASS; or root-cause confidence > 90% (then fix);
or a hard budget is reached (then report status). Do not keep exploring.

---

## 11. Targets

~85% token reduction · planning < 5s · zero repo-wide scans · smaller diffs ·
higher first-pass completeness · zero regressions. Cost is an engineering resource,
not unlimited.
