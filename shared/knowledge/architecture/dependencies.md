# Dependency Map

> All edges below are **Verified** via the `knowledge-graph` MCP server
> (`get_service_context`), which derives them from actual imports/Feign clients in
> source, not guesses. Each service/library was queried individually — see
> [projects.md](./projects.md) for what each node is. Only architecturally relevant
> edges are listed (per-class imports are not).

## Backend service → backend service

`core-service` is the hub almost everything else calls into or is called from.

| Service | Depends on (calls) | Depended on by (dependents) |
|---|---|---|
| gateway-service | — (routing layer, no domain deps recorded) | — |
| auth-service | appointment-service, core-service, user-management-service | core-service, inventory-service, ipd-clinical-service, ipd-service, supplementary-service, user-management-service |
| core-service | appointment-service, auth-service, clinical-common-service, file-store, inventory-service, ipd-clinical-service, ipd-service, notification-service, user-management-service | nearly every backend service **and** nearly every UI library (see below) |
| appointment-service | core-service, notification-service | auth-service, clinical-common-service, core-service, file-store, inventory-service, ipd-clinical-service, ipd-service, notification-service, rcm-service, report-service, and most UI libraries |
| clinical-common-service | appointment-service, core-service, file-store, inventory-service, ipd-clinical-service, ipd-service, report-service | core-service, file-store, inventory-service, ipd-clinical-service, ipd-service, notification-service, rcm-service, report-service, supplementary-service, user-management-service |
| inventory-service | appointment-service, auth-service, clinical-common-service, core-service, ipd-clinical-service, report-service | core-service, ipd-clinical-service, ipd-service, notification-service, report-service, supplementary-service, user-management-service |
| ipd-clinical-service | appointment-service, auth-service, clinical-common-service, core-service, inventory-service, ipd-service, notification-service, report-service | core-service, inventory-service, ipd-service, notification-service, rcm-service, report-service, supplementary-service |
| ipd-service | appointment-service, auth-service, clinical-common-service, core-service, inventory-service, ipd-clinical-service, notification-service, report-service | core-service, ipd-clinical-service, notification-service, rcm-service, report-service, supplementary-service |
| notification-service | appointment-service, clinical-common-service, core-service, file-store, inventory-service, ipd-clinical-service, ipd-service, report-service | appointment-service, core-service, ipd-clinical-service, ipd-service, supplementary-service, user-management-service |
| rcm-service | appointment-service, clinical-common-service, core-service, file-store, ipd-clinical-service, ipd-service | revenue-cycle-management (UI) only |
| report-service | appointment-service, clinical-common-service, core-service, file-store, inventory-service, ipd-clinical-service, ipd-service | core-service and most UI libraries (it's a read sink for reporting) |
| supplementary-service | appointment-service, auth-service, clinical-common-service, core-service, inventory-service, ipd-clinical-service, ipd-service, notification-service | (none recorded as calling back into it) |
| user-management-service | appointment-service, auth-service, clinical-common-service, core-service, inventory-service, notification-service | auth-service, core-service, user-management (UI) |
| file-store | appointment-service, clinical-common-service, core-service | clinical-common-service, core-service, notification-service, rcm-service, report-service, and several UI libraries |

**Practical reading for an AI agent:** a change to `core-service`'s public API is the
highest-blast-radius change in the backend — almost every other service and most UI
libraries call it. `rcm-service` and `supplementary-service` are comparatively
leaf-like (few/no backend dependents), lower blast radius.

## UI library → UI library (inside `lifetrenz-core/projects`)

| Library | Depends on (imports) | Depended on by |
|---|---|---|
| `masters` | adt, ambulance, clinical-casesheet, core-service, file-store, front-desk-management, indent, inventory, ipd-clinical-service, ipd-service, lifetrenz-core-root-app, notification-service, report-service, settings, user-management-service | adt, ambulance, clinical-casesheet, front-desk-management, indent, inpatient, inventory, opd-clinical, patient-lib, procurement, revenue-cycle-management, ris, settings (**13 dependents — most shared UI library**) |
| `clinical-casesheet` | adt, ambulance, core-service, file-store, indent, inpatient, ipd-clinical-service, ipd-service, masters, settings, user-management | adt, ambulance, front-desk-management, indent, inpatient, inventory, lifetrenz-core-root-app, masters, opd-clinical, patient-lib, procurement, revenue-cycle-management, ris, settings, user-management (**15 dependents — most-depended-on UI library overall**) |
| `adt` | ambulance, clinical-casesheet, core-service, inventory, ipd-service, masters, opd-clinical, patient-lib, report-service, supplementary-service | clinical-casesheet, front-desk-management, indent, inpatient, inventory, masters, opd-clinical, patient-lib, procurement, revenue-cycle-management, ris, settings, user-management (**13 dependents**) |
| `front-desk-management` | adt, ambulance, appointment-service, clinical-casesheet, core-service, file-store, inventory, ipd-clinical-service, ipd-service, masters, notification-service, opd-clinical, patient-lib, report-service, supplementary-service | indent, inpatient, inventory, masters, opd-clinical, patient-lib, procurement, revenue-cycle-management, settings |
| `settings` | adt, ambulance, appointment-service, clinical-casesheet, core-service, file-store, front-desk-management, indent, inpatient, ipd-clinical-service, ipd-service, masters, report-service, revenue-cycle-management, user-management-service | clinical-casesheet, inpatient, masters, opd-clinical, user-management |
| `patient-lib` | adt, ambulance, appointment-service, clinical-casesheet, core-service, file-store, front-desk-management, indent, inventory, inventory-service, ipd-service, masters, notification-service, opd-clinical, report-service, supplementary-service, user-management-service | adt, front-desk-management, revenue-cycle-management (**only 3 — heavy consumer, not a widely-shared provider**) |
| `revenue-cycle-management` | adt, ambulance, clinical-casesheet, clinical-common-service, core-service, file-store, front-desk-management, inventory, ipd-clinical-service, ipd-service, masters, patient-lib, rcm-service, report-service | settings |
| `inpatient` | adt, ambulance, clinical-casesheet, core-service, front-desk-management, indent, masters, settings, supplementary-service | clinical-casesheet, opd-clinical, ris, settings |
| `inventory` (UI) | adt, ambulance, appointment-service, clinical-casesheet, core-service, file-store, front-desk-management, indent, inventory-service, ipd-clinical-service, ipd-service, masters, report-service, user-management-service | adt, front-desk-management, masters, patient-lib, procurement, revenue-cycle-management |
| `indent` | adt, appointment-service, clinical-casesheet, core-service, file-store, front-desk-management, inventory-service, ipd-clinical-service, ipd-service, masters, user-management-service | ambulance, clinical-casesheet, inpatient, inventory, masters, opd-clinical, patient-lib, procurement, settings, user-management |
| `ambulance` | clinical-casesheet, clinical-common-service, core-service, file-store, indent, ipd-clinical-service, ipd-service, masters, supplementary-service | adt, clinical-casesheet, front-desk-management, inpatient, inventory, masters, opd-clinical, patient-lib, revenue-cycle-management, ris, settings |
| `opd-clinical` | adt, ambulance, clinical-casesheet, front-desk-management, indent, inpatient, masters, settings | adt, front-desk-management, patient-lib |
| `procurement` | adt, appointment-service, clinical-casesheet, core-service, file-store, front-desk-management, indent, inventory, inventory-service, ipd-clinical-service, ipd-service, masters, report-service, user-management-service | (none recorded) |
| `ris` | adt, ambulance, appointment-service, clinical-casesheet, clinical-common-service, core-service, file-store, inpatient, inventory-service, ipd-clinical-service, ipd-service, masters, report-service, user-management-service | (none recorded) |
| `user-management` (UI) | adt, clinical-casesheet, core-service, indent, lifetrenz-core-root-app, notification-service, settings, user-management-service | clinical-casesheet, lifetrenz-core-root-app |
| `lifetrenz-core-root-app` (shell) | adt, ambulance, appointment-service, clinical-casesheet, clinical-common-service, core-service, file-store, indent, inventory-service, ipd-clinical-service, ipd-service, notification-service, report-service, supplementary-service, user-management, user-management-service | adt, ambulance, clinical-casesheet, front-desk-management, indent, inpatient, inventory, masters, opd-clinical, patient-lib, procurement, revenue-cycle-management, ris, settings, user-management |

**Practical reading for an AI agent:** `masters` and `clinical-casesheet` are the
UI's true shared/foundational libraries (13–15 dependents each) — a breaking change
there ripples across most clinical/admin modules. `adt` is a close third. Despite
its name suggesting a shared "patient" concern, `patient-lib` is mostly a *consumer*
of other libraries (imports ~17 things) with only 3 recorded dependents — don't
assume it's safe to change broadly just because of the name, but also don't
over-scope a review of it expecting wide fan-out.

## UI library → backend service (cross-cutting)

Every UI library above lists specific backend services in its dependency column
(e.g. `masters` → core-service, file-store, notification-service, report-service,
user-management-service, ipd-clinical-service, ipd-service; `front-desk-management`
→ appointment-service, core-service, file-store, ipd-clinical-service, ipd-service,
notification-service, report-service, supplementary-service). There is no single
UI→gateway→service fan-out table maintained here because it's large and
per-library — use `knowledge-graph get_service_context` or `resolve_ui_api` for the
specific UI library or API constant relevant to the change at hand, per the
"Knowledge graph first" workflow in [architecture.md](./architecture.md).

