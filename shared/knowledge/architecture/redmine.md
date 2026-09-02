# Redmine

## Projects

| Name | Identifier | Parent |
|---|---|---|
| LTHS2.0 | `lths2-0` | — ("Lifetrenz HIS v2.0") |
| GCC | `gcc` | LTHS2.0 ("Gulf Functionalities" — Aster/Ajyal work) |
| Lifetrenz | `smiles` | LTHS2.0 |
| MOBILITY | `mobility` | LTHS2.0 |
| Medvista | `ramaiah` | LTHS2.0 |

## `redmine-reader` MCP tools

- `redmine_get_issue(id, include)` — fetch one issue. `include` accepts
  `attachments`, `journals` (comma-separated).
- `redmine_list_issues(project_id, status_id, tracker_id, priority_id,
  assigned_to_id, sort, limit, offset)` — search/list issues.
- `redmine_search(q, ...)` — free-text search across issues, wiki, news, etc.
- `redmine_list_projects` / `redmine_get_project`
- `redmine_list_wiki_pages` / `redmine_get_wiki_page`
- `redmine_list_files` — project-level files (distinct from issue attachments).
- `redmine_get_user` / `redmine_list_users` / `redmine_get_current_user` / `redmine_get_my_account`
- `redmine_get_role` / `redmine_list_roles`
- `list_issue_relations` / `get_issue_relation` — related-issue traversal.
- `redmine_upload_file` then `redmine_upload_attachment` (or `redmine_create_issue`/`redmine_update_issue`
  with the resulting token) — attaching a new file to an issue.
- `redmine_create_issue`, `redmine_update_issue`, `redmine_delete_issue`,
  `redmine_log_time`, `redmine_update_wiki_page`, `create_issue_relation`,
  `delete_issue_relation`, `redmine_create_project`, `redmine_update_project`,
  time entry CRUD, `redmine_delete_wiki_page` — write tools; do not use without
  explicit instruction (MCP is restricted to the read-only allowlist by default).

## Reading attachments

`redmine_get_issue(id, include="attachments,journals")` returns an `attachments`
array on the issue:

```json
{
  "id": 167380,
  "filename": "Screenshot 2026-08-28 at 20.05.27.png",
  "filesize": 709419,
  "content_type": "image/png",
  "content_url": "http://localhost:3000/attachments/download/167380/Screenshot%202026-08-28%20at%2020.05.27.png",
  "thumbnail_url": "http://localhost:3000/attachments/thumbnail/167380",
  "author": {"id": 8, "name": "Guru Chaitanya"},
  "created_on": "2026-08-28T16:05:33Z"
}
```

Fetch the file itself from `content_url` — there is no separate "download"
tool, the URL is the mechanism. A screenshot can also be referenced inline in a
journal (comment) `notes` field as `![](filename.png)` markdown without a
matching top-level attachment entry — check both. `journals[].details` records
each attachment event as `{"property": "attachment", "name": "<id>", "new_value": "<filename>"}`.

Issues also regularly carry an attached `<issue-id>.md` or `implementation-plan.md`
file — a written plan for the fix, posted by the developer alongside a status
change (see the `journals` example under "MR tracking" below).

## Reading journals: newest finding wins

When a ticket has multiple journal (comment) entries, read them in the order
they were posted but **weight the newest information highest** when it
conflicts with the original description or an earlier comment. Priority order,
highest first: latest QA/testing findings → latest deployment/environment
failure notes → latest rejection comments → latest reproduction steps →
original description. Do not base root-cause reasoning solely on the original
description if newer comments exist — a ticket's understanding of its own bug
often evolves significantly between creation and the latest QA/RC/UAT failure
comment.

## MR tracking in comments

Developers post the GitLab merge request URL(s) for a fix directly into an issue's
journal (comment) when they implement it — one issue is frequently backed by
multiple MRs across multiple repos. Example, verbatim from a real issue's journal
`notes`:

```
implemented and verified
https://git.lifetrenz.com/novel/his-ehr/be/ipd-clinical-service/-/merge_requests/2532
https://git.lifetrenz.com/novel/his-ehr/be/ipd-service/-/merge_requests/6368
https://git.lifetrenz.com/novel/his-ehr/be/core-service/-/merge_requests/3151
```

To find the commits/MRs for a task: call `redmine_get_issue(id, include="journals")`
and scan `journals[].notes` for `git.lifetrenz.com/.../-/merge_requests/<n>` URLs.
This is the standard way to trace a Redmine issue to its actual code change —
prefer it over guessing which commit implemented a fix. A later comment may also
say `cherry-picked to v2qa` (or another environment) — this records which
environment promotion (see `environments.md`) has picked up that specific MR.

## Status workflow (id → name, all live-verified)

```
                              ┌─ Pseudo Code: Ready for Review(8) → Approved(9) / Failed(10)
New(1) → FP: Ready for        │
Review(27) → Approved(28) →   ┴→ Dev in Progress(22) →
FP Scheduled(25) / Inprogress(26) / Failed(44)          Code Review: Pending(11)/Merge Pending(43)
                                                          → Approved(12) / Failed(13)
                                                                    │
                                                                    ▼
                                          Moved to Beta(17) → Beta Testing(14) → Passed(16) / Bug(15)
                                                                    │
                                                                    ▼
                                    Moved to RC(18) → RC Testing(19) → Passed(20) / Failed(21)
                                                                    │
                                                                    ▼
                                    Moved to QA(34) → QA Testing(35) → Passed(36) / Failed(37)
                                                                    │
                                                                    ▼
                                  Moved to UAT(38) → UAT Testing(39) → Passed(40) / Failed(41)
                                                                    │
                                                                    ▼
                                                                Closed(3)
```

Off-path / generic states that can occur at any point: `Scheduled`(4),
`In Progress`(2), `Need Clarity`(33), `Duplicated`(42).

| id | name | id | name |
|---|---|---|---|
| 1 | New | 21 | RC - Failed |
| 2 | In Progress | 22 | Dev in Progress |
| 3 | Closed | 25 | FP Scheduled |
| 4 | Scheduled | 26 | FP Inprogress |
| 8 | Pseudo Code - Ready for Review | 27 | FP Ready for Review |
| 9 | Pseudo Code - Approved | 28 | FP Approved |
| 10 | Pseudo Code - Failed | 33 | Need Clarity |
| 11 | Code Review - Pending | 34 | Moved to QA |
| 12 | Code Review - Approved | 35 | QA Testing |
| 13 | Code Review - Failed | 36 | QA Passed |
| 14 | Beta - Testing | 37 | QA Failed |
| 15 | Beta - Bug | 38 | Moved to UAT |
| 16 | Beta - Passed | 39 | UAT Testing |
| 17 | Moved to Beta | 40 | UAT Passed |
| 18 | Moved to RC | 41 | UAT Failed |
| 19 | RC - Testing | 42 | Duplicated |
| 20 | RC - Passed | 43 | Code Merge Pending |
| | | 44 | FP Failed |

This list was built by directly querying `redmine_list_issues(status_id=<n>)` for
every id and recording the name Redmine returned — not inferred from naming
patterns. It maps directly onto the environment promotion flow in
[environments.md](./environments.md): `Moved to RC` = pushed to `v2-qa`,
`Moved to QA` = pushed to `medvista-qa`, `Moved to UAT` = pushed to
`medvista-uat` or `aster-uat` depending on lineage.

## Custom fields seen on issues

`Blocked`, `QA`, `BA`, `Reported By`, `Customer/Env` (e.g. `"ASTER (UAT)"`,
`"Ajyal (UAT)"` — confirms these are tracked as real customer/environment values),
`Bucketization`, `Sprint Master`, `Reference Id`, `Complexity`, `Road Map`.
Trackers seen: `Development Task`, `Defect`, `Enhancement`.
