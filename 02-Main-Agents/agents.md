# Agents v3 — The Four Profiles

The platform is **one deterministic pipeline + four config profiles**, not four
codebases and not agent chains. Each profile = tool allowlist (`04-MCP/tool-allowlists.md`)
+ scoped standards (`CLAUDE.md` §4) + budget (`agent-os.md` §2) + the prompt below.

Shared pipeline:

```
Input → Resolver → Discovery (MCP, deterministic) → Context Assembler
      → Single LLM Agent → Validation (code + LLM fallback) → Audit trace
```

Resolver, Discovery, and most of Validation are **deterministic — no LLM**. The LLM is
reserved for reasoning, transformation, and ambiguous judgment.

---

## Agent 1 — Bug Fix

| | |
|---|---|
| **Inputs** | Bug description, Redmine ID, error log, stack trace, prod issue |
| **Key idea** | **The stack trace is the dependency map.** Parse it; don't search. |
| **Discovery** | Redmine issue (if ID) → parse trace → own-package frames only (skip `java.*`, `org.springframework.*`) → `get_file_blame` on the failing line (finds the regression commit) |
| **Context** | Failing frames + blame + depth-1 caller of the failing line. No module scan. |
| **Budget** | ≤ 10 files, ≤ 6k tokens |
| **Output** | Root cause, fix plan, code change (small diff), validation checklist |
| **Validation** | Reproduction condition stated; fix touches a trace frame; no unrelated files; regression commit referenced |

---

## Agent 2 — Planning / Feature

| | |
|---|---|
| **Inputs** | Feature request, Redmine story/epic, business requirement |
| **Key idea** | A feature isn't in the repo yet — discover the **insertion point** (the nearest existing analog to extend), not "the feature". |
| **Discovery** | Redmine issue (requirements) + **one** targeted search for the analog module → its file list + signatures (not bodies) |
| **Context** | Requirements + 1 reference feature skeleton + standards scoped to touched layers. Read structure, not implementations. |
| **Budget** | 3–5 files (structure), ≤ 10k tokens, < 5s |
| **Output** | Requirement analysis, impact analysis, technical design, task breakdown, test strategy |
| **Validation** | Plan-completeness checklist (every layer covered: controller/service/repo/dto/entity/migration/UI/test), test strategy present |

---

## Agent 3 — UI Redesign

| | |
|---|---|
| **Inputs** | Screenshot, HTML, Angular component |
| **Key idea** | **Avoid repository analysis.** Screenshot + component + Frontend standards = full spec. Backend/routing/APIs are irrelevant. |
| **Discovery** | None for repo. `get_file_contents` for the one component only if not pasted. Chrome capture optional. |
| **Context** | The single component (HTML/CSS/TS) + `Frontend/*` standards + screenshot as image. Depth-0. |
| **Budget** | ≤ 5 files, ≤ 8k tokens + image |
| **Output** | Modernized Angular HTML/CSS/TS, redesign proposal, accessibility improvements |
| **Validation** | Preserve `@Input`/`@Output`/bindings; ARIA/contrast/focus; do NOT touch API/DTO/routing |

---

## Agent 4 — Migration / Cherry-Pick (DUAL MODE)

| | |
|---|---|
| **Inputs** | Redmine ID→MR, MR `!id`, commit SHA(s), branch, release range + **target branch** + **mode** |
| **Mode** | User chooses `exact` or `functionality` per request (smart-suggest by input type, user confirms). |

### Shared front-half (both modes)

1. **Discovery (deterministic, O(change), no scan):**
   - Redmine `12345` → `redmine_get_issue` → regex `!\d+` / SHA → MR/commit path
   - MR `!5678` → `list_merge_request_changed_files` → `get_merge_request_diffs`
   - Commit(s) → `get_commit_diff` (union, dedupe)
   - Branch → `get_branch_diffs` (merge-base…head)
   - Release `v1.2→v2.0` → `list_commits` (tag range) → aggregate paths → diff at endpoints
2. **Diff Semantic Filter:** drop non-functional hunks — whitespace-only, comment-only,
   brace/format-only, import-reorder (same import *set*, different order). T1 = regex
   (default); T2 = run repo formatter both sides + re-diff (optional). Output:
   `functionalHunks[]` + `touchedSymbols[]`.

### Mode 1 — Exact (diff-based)

- **Expansion:** compile-completeness only. For each referenced symbol, check the
  **target branch**; if it resolves → don't migrate; if **missing** → pull only that
  symbol (depth-1). Never expand for "relatedness".
- **Budget:** ≤ 15 files, ≤ 12k tokens, 1 expansion round.
- **Output:** smallest functional patch + list of compile-deps pulled in.
- **Safety net:** flag referenced symbols that exist on target but with a **different
  signature** — "patch may apply but behavior may diverge; upgrade to Mode 2?"
- **Use:** cherry-pick, hotfix, backport, branch sync.

### Mode 2 — Functionality (capability-based)

- **Expansion:** seed = `touchedSymbols`; close the capability along **typed references
  that actually appear** (imports, field types, `@Autowired` beans, called methods,
  DTO/entity types, Angular selectors, routing entries) **+ naming conventions**
  (`XController→XService→XRepository`, `XDTO`, `XMapper`, `X` entity, `X.component.*`,
  `VX__*` Flyway). Walled by the module package boundary (+ declared shared pkgs).
- **Token discipline — migrate the delta vs target:** file identical on target → skip;
  present & compatible → signature-check only; **missing or divergent → full body**.
  So cost scales with the source↔target gap, not capability size.
- **Budget:** ≤ 40 files, ≤ 3 expansion rounds, ≤ 40k tokens. Hit budget → **report gaps**.
- **Output:** capability migration set + per-layer completeness report + gap list.
- **Use:** feature port, cross-version migration, module replication, product-line customization.

### Validation (both modes)

Run the structured **`07-Templates/migration-checklist.md`** as the validation artifact —
it covers dependency, security (role/permission/audit), database, compatibility, and
testing sections. Plus: completeness checklist (`agent-os.md` §7); the **regression gate**
(`agent-os.md` §8 — existing APIs/UI/permissions/integrations/Flyways/DB/tests still work);
every referenced symbol resolves on target; Flyway ordering preserved. Mode 1 also asserts
changed-file set ⊆ {functional-hunk files ∪ compile-deps} (no unrelated movement, no
whitespace leakage).

**Release / hotfix-backport targets** additionally verify *target-compatibility*: API,
DB schema, Flyway, and permission compatibility against the older branch. Backport the
functionality, never raw-cherry-pick merge commits blindly.

**Neither mode scans the repo** — files enter scope only via real references/conventions
inside the boundary.

---

## What was removed (and why)

The old chains (Planning→Migration→Dependency Mapper→Completeness→Regression, up to 6
contexts) are gone. Each hop re-loaded standards and multiplied tokens/latency. One LLM
agent with deterministic pre/post steps is faster, cheaper, and easier for 2–3 engineers
to maintain. Old per-agent files in this folder are superseded by this one.
