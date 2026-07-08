# Example Executions

**See also:** [`README.md`](../README.md) · [`prompt-guide.md`](../prompt-guide.md) · [`audit-and-metrics.md`](audit-and-metrics.md) · [`repo-onboarding.md`](repo-onboarding.md)

---

Each shows: input · MCP calls · context loaded · validation · output shape · Prompt Quality.

---

## `/bug-fix redmine=12345`

- **Input:** Redmine ID only
- **MCP:** `redmine_get_issue(12345)` → trace; `get_file_contents(OrderService.java, OrderController.java)`; `get_file_blame(OrderService:142)` — 3 calls
- **Context:** own-package trace frames + blame + depth-1 callee; lazy `backend/service.md` + `coding-standards.md`
- **Validation:** completeness + regression (order-place flow intact); changed files ⊆ frames
- **Output:** root cause · 1-file diff · both gates PASS · audit line · ~4–6k tokens

```text
Prompt Quality: 72/100 (Good)
Strengths:     Redmine ID provided
Missing:       Stack trace · expected behavior
Token impact:  Minor — 2 extra MCP calls to locate trace
```

---

## `/bug-fix context`

- **Input:** `context/` folder containing `logs.md` (stack trace) + `design.md` (expected behavior)
- **MCP:** `Read context/context.path` → external folder; `Glob` → reads both files; `get_file_contents` for own-package frames — 3 calls
- **Context:** full trace + expected behavior preloaded; lazy standards
- **Validation:** completeness + regression
- **Output:** root cause · diff · both gates PASS · ~3–4k tokens

```text
Prompt Quality: 91/100 (Excellent)
Strengths:     Stack trace · expected behavior · context folder used
Missing:       —
Token impact:  Minimal discovery needed
```

---

## `/new-development redmine=41800`

- **Input:** Redmine story ID
- **MCP:** `redmine_get_issue(41800)`; `get_file_contents` for nearest analog feature (insertion point) — 3–4 calls
- **Context:** requirements + analog skeleton + `coding-standards.md` + touched-layer standards
- **Validation:** plan-completeness (all layers enumerated); no code produced until approved
- **Output:** impact analysis · design · PARTS/PHASES/TASKS breakdown · ~6–10k tokens

```text
Prompt Quality: 68/100 (Moderate)
Strengths:     Redmine ID provided
Missing:       Design reference · acceptance criteria
Token impact:  Moderate — analog search required
```

---

## `/ui-design-update component=WardManagement context`

- **Input:** component name + context folder (design HTML + log file)
- **MCP:** `Read context.path` → external folder; `Glob` → reads design.html + logs.md; `get_file_contents(ward-management.component.{html,scss})` — 3 calls
- **Context:** current component + design target + bug log; lazy `frontend/component.md`
- **Validation:** redesign checklist — bindings/directives/pipes preserved; layout matches design
- **Output:** analysis · HTML/SCSS diff · checklist PASS · ~4–8k tokens

```text
Prompt Quality: 88/100 (Good)
Strengths:     Component named · design file provided · log included
Missing:       Expected vs actual behavior description
Token impact:  Minor
```

---

## `/migration mode=exact mr=!5678 target=release/2.4`

- **Input:** MR ID + mode + target branch
- **MCP:** `list_merge_request_changed_files(!5678)`; `get_merge_request_diffs(!5678)`; `get_file_contents(<touched files>@release/2.4)` — 3 calls
- **Context:** functional hunks (filter drops 1 import reorder) + target versions; lazy `migration/*`
- **Validation:** completeness + regression + changed-set ⊆ {hunk files ∪ compile-deps}; signature-drift probe
- **Output:** minimal patch (2 files) + compile-deps + both gates PASS + audit line · ~6–12k tokens

```text
Prompt Quality: 95/100 (Excellent)
Strengths:     MR ID · mode · target branch — all provided
Missing:       —
Token impact:  Minimal discovery
```

---

## `/migration mode=functionality redmine=12345 target=release/2.4`

- **Input:** Redmine ID + mode + target branch
- **MCP:** `redmine_get_issue(12345)` → `!8456`; `get_merge_request_diffs(!8456)`; bounded `get_file_contents` for capability closure + target delta checks — ≤ 10 calls
- **Context:** seed symbols → closure along refs+conventions within boundary; migrate only missing/divergent vs target
- **Validation:** `migration-checklist.md` + completeness + regression + target-compatibility
- **Output:** capability set (entity + Flyway created; controller/service signature-checked) · per-layer report · gaps (if any) · ~15–40k tokens

```text
Prompt Quality: 90/100 (Excellent)
Strengths:     Redmine ID · mode · target branch
Missing:       —
Token impact:  Minimal — semantic migration fully guided by Redmine
```

---

## `/data-correction "Patient bills wrong after upgrade"`

- **Input:** free text only
- **MCP:** DB queries to locate affected records — 3–5 calls
- **Context:** lazy standards; schema reads
- **Validation:** PRE + POST validation queries generated; rollback script included
- **Output:** correction scripts shown for manual review · ~5–8k tokens

```text
Prompt Quality: 38/100 (Poor)
Strengths:     —
Missing:       Table name · affected record ID · expected vs actual value · Redmine ticket
Token impact:  Large — 4 exploratory DB queries required to locate data
```
