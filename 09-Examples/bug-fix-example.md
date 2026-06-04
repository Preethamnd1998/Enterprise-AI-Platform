# Bug Fix Example (v3)

## Input

Error: `Failed to convert 'pageSize' with value '[object Object]'`
Module: `lib-bom-configuration`

## Bug Fix Agent (single agent, deterministic steps)

**Discovery (stack trace = dependency map):** trace points to the pagination change
handler in `bom-configuration.component.ts`. Blame on the failing line shows the recent
`pageSizeChange` wiring. Files read: component.ts + the pagination component (2 files).

**Root cause:** `pageSizeChange` emits `{ label: "20", value: 20 }`; the API expects
`20`. The component sends the whole object.

**Fix (small diff):**
```
- pageSize: selectedPageSize
+ pageSize: selectedPageSize.value
```

**Validation:**
- Completeness (§7): change present, no missing artifacts.
- Regression (§8): existing pagination flow, API contract, other callers unaffected.

Status: **PASS** — 2 files, well under budget.
