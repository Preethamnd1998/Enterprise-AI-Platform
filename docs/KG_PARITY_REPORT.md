# Knowledge Graph parity — legacy vs in-repo (2026-11-02)

Indexes: **legacy** `local-ai-environment/knowledge-graph-generator/output` (built 2026-10-10) · **previous** `…/knowledge-graph-generator/output-gwfix` · **corrected** `…/output-engfix` (current source, 31 projects, 0 failures).
Live source stays `KG_SOURCE=legacy`.

| # | Difference | Class | Evidence / action |
|---|---|---|---|
| 1 | `core`, `ipd-clinical`, `ums` had no gateway prefix (placeholder `${SPRING_APPLICATION_NAME}`) | **1 Verified platform defect** — fixed | `kg_indexer/gateway_prefix.py` + `gateway-prefix-overrides.json`; 25 tests; prefixes now equal legacy for all 15 legacy services |
| 2 | `DB_TABLE.engine` lost when SQL path reached a table before JPA (first-writer-wins) | **1 Verified platform defect** — fixed | `_merge_engine_metadata`; reproduced with old code; 7 tests |
| 3 | 349 tables legacy=`sql`, corrected=`jpa` | **3 Corrected classification** | all 349 have both `jpa` and `sql` access (`engines=["jpa","sql"]`); legacy's first-writer rule hid the JPA side; precedence mongo > jpa > sql |
| 4 | Saga test 9 (`auto_follow_up_rule (sql)` vs `(jpa)`) | #2 consequence | passes 3/3 |
| 5 | Saga test 12 flaky | **1 Platform defect (non-determinism)** — fixed | UI-narrowing wall-clock budget; `UT_SAGA_UI_NARROW_BUDGET_MS`, `metadata.ui_narrowing`, tests fail loudly on timeout; 3/3 |
| 6 | Saga test 11 expected `/…/auto-follow-up-rules/add` | **4 Test expectation defect** — updated | Add route removed by unrelated commit `4ded944e`; creation migrated to list dialog, assignment to Apply screen; test rewritten (see below) |
| 7 | Saga hid the real "Save Assignment" click (`onAssignmentSaved`) | **1 Verified platform defect** — fixed | render capped at 4 handlers/component, silently; now 12 + explicit `… +N more` line |
| 7b | `saga_ui_trigger` intermittently returned **0 chains** (saga test 12/15 failed ~1 in 3 runs even after the budget fix) | **1 Verified platform defect** — fixed | `_service_dependents` scanned all ~133k `DEPENDS_ON` edges (≈2 s cold, repeated per hop) and tripped the KG per-call 5 s query limit; the error was then reported as "no UI calls this endpoint". Query now driven from `idx_nodes_service`/`idx_edges_source` (~0.02 s); a failed UI lookup is now a named gap + `metadata.ui_lookup_failed`, and tests fail on it. 10/10 repeat runs complete |
| 8 | 54 tables legacy-only | **2 Source drift + 5 extractor noise** | sampled first 10: mostly non-tables the older extractor accepted (`_id`, `patient.patientId`, `generate_series`, `get_bed_config`-style DB functions); the rest not individually classified (likely branch drift). Not forced to match |
| 9 | 33 tables new-only | **2 Source drift + 5 extractor noise** | real new tables (`customer_master_sync_state`, `inv_po_grn_excel_import_log`, …) plus ~5 false positives (`today`, `was`, `scratch`, `columns`, `pg_constraint` — prose/system-catalog/`*IT` test classes). Unresolved: add `IT.java` to ignored suffixes and extend `_PROSE_WORDS` (0.3% of tables) |
| 10 | Endpoints: legacy-only 40 (core 15, ipd-clinical 25), new-only 172 | **2 Expected source-branch drift** | sampled: `/sync/price-book/active-ids`, `/sync/tax-percent/active-ids` exist only in git history (`SYNC FUNCTIONALITY`), absent from current core-service source. new-only is dominated by `auth-service` (53) and `user-management-service` (+31), see 11 |
| 11 | `auth-service` / `public-gateway-service` appear; dependency lists gain `auth-service` links | **2 Indexing-scope drift** | the legacy config indexed neither service; they are real services (`ltauth`, `public-gateway`). Dependencies on `auth-service` are genuine `DEPENDS_ON/EXTENDS/IMPLEMENTS` edges |
| 12 | `ums` +31 endpoints, service-context counts differ | **2 Source drift** | `user-management-service` current branch is larger (355→502 classes) |
| 13 | UI projects indexed twice (`settings` and `settings/settings`) | **5 Unresolved** | the nested submodule checkout is indexed as two project labels, duplicating UI facts (saga repeats component blocks). Dedupe in the sync config or the saga render |
| 14 | `AutoFollowUpRulesComponent` exists in both `appointment-settings` and `system-settings` | Source fact | both have `Create New Rule` (`openAddRuleCard()`, html:32) |

Parity is **not** established: items 8–10 and 13 are explained but not eliminated, and service-context/dependency outputs were compared on samples only.

## Auto Follow-Up Rules — current workflow (verified against source + KG)
- **Rule create/edit** — `AutoFollowUpRulesComponent` (`/front-desk-management-settings/auto-follow-up-rules`): `Create New Rule` button → `openAddRuleCard()` opens the create dialog; its footer button calls `save()` (html:900; edit dialog html:519) → `SystemSettingsConstant.AUTO_FOLLOW_UP_RULES_POST_GET` (`core/auto-follow-up-rules`) → core-service `SystemSettingsController.saveAutoFollowUpRule`.
- **Rule assignment** — `ApplyFollowupRulesComponent` (`/front-desk-management-settings/apply-follow-up-rules`): `showAssignmentView()` opens the assign view; `Save Assignment` → `onAssignmentSaved()` (html:468) → `saveOrUpdateAssignment` → `SystemSettingsConstant.IPD_FOLLOW_UP_RULE_ASSIGNMENT` (`ipd/followup-rule/assignment`) → ipd-service `IpdAutoFollowUpRuleAssignmentController.saveOrUpdateAssignment`.
- **Legacy:** `AutoFollowUpRulesAddComponent` and route `/auto-follow-up-rules/add` (commit `ac0f75e8`, 2025-11-21); route removed by `4ded944e` (2026-01-19, unrelated). The component file still exists and still shows in KG output; it is not the creation screen.

## Unresolved: `belongsToSiteId` / `belongsToCustomerId`
- Backend (core-service, read-only analysis): `AutoFollowUpRules` record carries both; `SystemSettingsServiceImpl.saveAutoFollowUpRule` copies them to the entity on create **and update** (lines ~199-210, so an update without them sets NULL); `AutoFollowUpRuleRepository.getAutoFollowUpRule` filters `belongs_to_site_id = ?` / `belongs_to_customer_id = ?` when `siteId`/`customerId` request params are present.
- Old Add component sent both (`getSiteId()` / `getCustomerId()`) with `level="CUSTOMER_LEVEL"`. The list dialog's DTO sets `id, ruleName, level, checks, enable, siteId` only (`siteId` feeds the CTA, not `belongs_to_site_id`).
- The list screen's search form passes `siteId` to the GET when a site is chosen. Rules saved through the dialog would then have NULL `belongs_to_*` and be excluded from a site-filtered list — **possible functional gap, not confirmed** (needs a read-only look at `auto_follow_up_rule.belongs_to_site_id` data and the dialog's real payload). Assignment (`ipd/followup-rule/assignment`) does not obviously take over this field. **No application code was changed.**
