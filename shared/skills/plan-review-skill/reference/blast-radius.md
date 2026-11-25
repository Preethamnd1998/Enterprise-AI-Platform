# Blast Radius Method

Goal: list everything the change can affect, with evidence, before judging "low risk".
Graph first: `unified-trace` `trace_impact` / `trace_usages` / `saga`, or `knowledge-graph`
`find_callers` / `get_database_impact`. Keep VERIFIED / INFERRED / UNRESOLVED tags. Fall back
to a scoped `grep` only when the graph is unavailable or UNRESOLVED.

## Inventory (fill every row, or write "none, checked by <how>")

| Axis | Question | How to find |
|---|---|---|
| Direct callers | Who calls each changed symbol? Count call sites. | `trace_usages`, `trail callers <sym> --depth 2` |
| Shared utility | Is it a util/base class used app-wide? (`isEditorValid`-style helpers have dozens of callers) | `grep -rl <symbol>`, count files |
| Copies | Is the file duplicated per app? Are the copies identical? | `md5` the same path across app repos |
| Submodule / library | Is the file in a submodule consumed by many apps? Which pointers must bump? | `.gitmodules`, `git ls-tree <ref> <path>` per consumer |
| Sibling apps with the same defect | Does the same bug exist elsewhere? | grep the defect pattern across all app repos and branches |
| UI parents/hosts | Which screens embed the component? Which routes? | grep selector, routing modules |
| Lifecycle/rendering | Does the change alter change detection, subscriptions, timers, dialogs? | read component + host |
| API contract | Request/response fields, status codes, consumers (Feign, WebClient, UI services) | `saga`, `find_api` |
| Database | Tables/collections, indexes, Flyway, data volume, existing rows affected | DB MCP counts, `get_database_impact` |
| Messaging | Kafka topics produced/consumed, consumer groups, ordering | grep topic, `saga_topic_flow` |
| Permissions / auth | New or changed permission checks; read-only gates; roles | grep permission constants |
| Audit / notifications / print / reports | Does the change touch audit trail, print templates, notifications, reports? | related skills (audit-skill, notification-link-skill) |
| Config / feature flags / per-customer | Customer-specific templates, settings, env differences (Medvista vs Aster) | settings tables, environments.md |
| Release path | Which branches, in what order, cherry-pick vs full release; which apps rebuild/redeploy | `branch-matrix.md` |
| Data already in the wild | Existing records that the change will mis-read or orphan | DB counts |
| Rollback | Can it be reverted alone? Data written by the new code readable by the old? | reasoning + evidence |

## Risk class (contract §9)

Assign LOW / MEDIUM / HIGH / CRITICAL with the reason. HIGH/CRITICAL: DB/Flyway, permissions,
auth/security, billing/financial/patient data, application-wide scope. A UI-only change to a
shared library consumed by N apps is at least MEDIUM; mark HIGH when it touches clinical
documentation save paths or print output.

## Regression matrix (output)

| Consumer / area | Why affected | Minimum test | Priority |
|---|---|---|---|

Pick a **sample** when consumers are identical copies (state the sample and why it is
representative), but test every distinct variant (different branch lineage, customer config,
or build type).

## Scoring hooks

- Complete inventory + matrix + rollback → D5 15.
- Plan lists only the app it was written in while the code is shared → D5 ≤ 7 and the cap
  "shared code, no consumer list" applies.
- A regression check aimed at a consumer that is not affected (or already fixed) is wasted
  effort: note it, do not count it as coverage.
