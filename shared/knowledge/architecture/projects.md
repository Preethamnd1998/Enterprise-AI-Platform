# Project / Repository Inventory

All GitLab paths are rooted at `https://git.lifetrenz.com/novel/his-ehr/`.
"Local" = checked out under `D:\GitLab-Workspace\UI-BE`. Branch/environment
mapping is in [environments.md](./environments.md), not here.

## Backend services (`be/` group)

Common stack unless noted: Java, Spring Boot, Spring Cloud Consul discovery
(`canary-dev.lifetrenz.com:8500`), Spring Cloud Config client, Kafka messaging,
Actuator/Prometheus. Java version varies by service — see the Java column.

| Service | Local | GitLab repo | Purpose | DB | Java |
|---|---|---|---|---|---|
| gateway-service | ✅ | `be/gateway-service` | API Gateway (Spring Cloud Gateway), app name `apigateway` | — | 17 |
| auth-service | ✅ | `be/auth-service` | Authentication | Not verified | 17 |
| user-management-service | ✅ | `be/user-management-service` | Users/roles/identity | MongoDB `LTHS-USER-MGMT` | 17 |
| core-service | ✅ | `be/core-service` | Master/reference data — the most central service in the system | PostgreSQL `LOCAL-CORE` | **21** |
| appointment-service | ✅ | `be/appointment-service` | OPD scheduling | MongoDB `LTHS-OPD` | 17 |
| clinical-common-service | ✅ | `be/clinical-common-service` | Shared clinical domain logic (observations, allergies, assessments) | MongoDB `LTHS-UMC` | 17 |
| ipd-clinical-service | ✅ | `be/ipd-clinical-service` | IPD clinical docs, HIE/HL7/Malaffi/ABDM integration | MongoDB `LTHS-IPD-CLINICAL` | 17 |
| ipd-service | ✅ | `be/ipd-service` | IPD billing/admin — largest service by class count | PostgreSQL `LOCAL-IPD` (separate read/write datasource URLs configured) | **21** |
| inventory-service | ✅ | `be/inventory-service` | Inventory/pharmacy stock, Spring Batch | PostgreSQL `LOCAL-INV` | **21** |
| supplementary-service | ✅ | `be/supplementary-service` | Ambulance, housekeeping, chat/messaging | PostgreSQL `SUPDB` | **21** |
| rcm-service | ✅ | `be/rcm-service` | Revenue Cycle Management (prior-auth, claims) | PostgreSQL `LOCAL-RCMDB` | 17 |
| report-service | ✅ | `be/report-service` | Reporting, Spring Batch; reads across other services' DBs | PostgreSQL `LOCAL-REPRT` + cross-service read datasources (`LOCAL-IPD`, `LOCAL-CORE`, `LOCAL-INV`, `SUPDB`, `Local_Bloodbank_DB`) | 17 |
| notification-service | ✅ | `be/notification-service` | Email/SMS/WhatsApp notifications | MongoDB `LTHS-NOTIFICATION` (separate Atlas cluster) | 17 |
| file-store | ✅ | `be/file-store` | Object storage (S3/Alibaba/etc.) | Not verified (credential-only config) | 17 |
| config-service | ✅ (⚠ nested duplicate checkout, see below) | `be/config-service` | Spring Cloud Config Server | — | 11 |
| mobility | ✅ (no usable local source) | `be/mobility` | Mobility platform backend | MongoDB `LTHS-MBLTY` (separate Atlas cluster `cluster22`) | Not verified |
| relay | ✅ (no usable local source) | `be/relay` | Relay service | MongoDB `LTHS-Relay` | Not verified |
| cssd-service | — | `be/cssd-service` | CSSD (Central Sterile Services Department) | Not verified | Not verified |
| ai-service | — | `be/ai-service` | **Python** (confirmed via repo tree: `requirements.txt`, `run.py`, no `pom.xml`) — not Spring Boot | Not verified | N/A |
| lis-service | — | `be/lis-service` | Lab Information System | Not verified | Not verified |
| phlebotomy-service | — | `be/phlebotomy-service` | Phlebotomy | Not verified | Not verified |
| audit-service | — | `be/audit-service` | Audit | Not verified | Not verified |
| product-mgmt-service | — | `be/product-mgmt-service` | Product management | Not verified | Not verified |
| clinical-pharmacy-service | — | `be/clinical-pharmacy-service` | Clinical pharmacy | Not verified | Not verified |
| video-consult-service | — | `be/video-consult-service` | Video consultation | Not verified | Not verified |
| clinical-workflow-service | — | `be/clinical-workflow-service` | Clinical workflow | Not verified | Not verified |
| blood-bank-service | — | `be/blood-bank-service` | Blood bank | Not verified | Not verified |
| internal-relay-service | — | `be/internal-relay-service` | Distinct from `be/relay` | Not verified | Not verified |
| jasper-report-template | ✅ (lives under `lifetrenz-core/projects/` locally — a UI folder, despite being in the `be/` GitLab group) | `be/jasper-report-template` | Jasper report templates | N/A | N/A |

**config-service anomaly**: `UI-BE/config-service/config-service/` contains its own
independent `.git`/`pom.xml`/`src` — a nested duplicate checkout. Confirm which
copy is canonical before editing.

## Frontend apps (`ui/` group, top level — not `ui-library/`)

| App | Local | GitLab repo | Stack | Notes |
|---|---|---|---|---|
| lifetrenz-core | ✅ | `ui/lifetrenz-core` | Angular 17, PrimeNG 17.2 | The UI monolith — see below |
| doctor-portal | — | `ui/doctor-portal` | Angular 17 (`lths-doctor-portal`), PrimeNG | `ng serve --port 4400` |
| form-builder | — | `ui/form-builder` | Angular 14 (`lths-form-builder`), GrapesJS page builder | `ng serve --port 4502` |
| video-consult | — | `ui/video-consult` | Not verified — distinct from `ui-library/video-consult` | |
| hims-cc | — | `ui/hims-cc` | Angular 17 (package name `command-central`), PrimeNG | |
| license-management-system | — | `ui/license-management-system` | **React 19 + Vite + Tailwind CSS 3.4 + Radix UI** — not Angular | Confirmed via `package.json`: `react`, `react-dom`, `tailwindcss`, `@radix-ui/*`, `vite` |

`license-management-system` is the React/Tailwind app in this workspace — every
other UI app and library is Angular.

## Shared UI libraries (`ui/ui-library/` group)

Each is a separate GitLab repo, and each present locally is checked out inside
`lifetrenz-core/projects/<name>` with its **own independent `.git`** pointing at
`ui/ui-library/<name>.git` (confirmed for `masters` and `patient-lib`; no
`.gitmodules` at the `lifetrenz-core` root, so this is a manual multi-repo
checkout convention, not a git submodule). `angular.json` in `lifetrenz-core`
must declare a library for it to be built into any app bundle.

Per-repo detail (structure, real cross-file examples) for every one of these:
`Knowledge Repo/docs/repo knowledge/<name>.md`.

| Library | Local content | In `angular.json` | Notes |
|---|---|---|---|
| adt | ✅ real | ✅ | |
| ambulance | ✅ real | ✅ | |
| anesthesia | ⚠ empty stub | ✅ | GitLab repo has real content on `development`, not checked out here |
| artifacts | — GitLab-only | — | bare scaffold, not wired into any app |
| audit | — GitLab-only | ✅ | bare scaffold |
| blood-bank | ⚠ empty stub | ✅ | GitLab has real content |
| clinical-casesheet | ✅ real | ✅ | most-depended-on UI library — see dependencies.md |
| clinical-pharmacy | ⚠ empty stub | ✅ | GitLab has real content; imports `ADRService`/`PatientData`/`CaseSheetData` directly from `@clinical-casesheet` |
| committee | ⚠ empty stub | ✅ | **no GitLab repo exists** — declared in `angular.json` but doesn't exist anywhere accessible |
| daycare-clinical | ✅ real | ✅ | |
| diet-management | ⚠ empty stub | ✅ | GitLab has real content |
| doctor-payout | ⚠ empty stub | ✅ | **no GitLab repo exists** |
| emergency | ✅ real | ✅ | |
| front-desk-management | ✅ real | ✅ | hosts the global-filter searchbar pattern |
| haemodialysis | ✅ real | ✅ | |
| home-care | — GitLab-only | ✅ | real feature library (Syncfusion + FullCalendar scheduling deps) |
| house-keeping | ✅ real | ✅ | |
| incident-management | ⚠ empty stub | ✅ | **no GitLab repo exists** |
| indent | ✅ real | ✅ | |
| infection | ✅ real | ✅ | |
| inpatient | ✅ real | ✅ | |
| inventory | ✅ real | ✅ | |
| jasper-report-template | ✅ real | — | **not an Angular library** — an Eclipse-project folder of JasperReports `.jrxml` templates, organized by domain and by tenant; classified under `be/` on GitLab despite living in this UI folder locally |
| lab-sample-collection | ⚠ empty stub | ✅ | GitLab has real content |
| lis-configuration | ⚠ empty stub | ✅ | GitLab has real content |
| lis-sample-tracking | ⚠ empty stub | ✅ | **no GitLab repo exists** |
| masters | ✅ real | ✅ | most-shared UI library (13 dependents) — see dependencies.md |
| mis-reports | ⚠ empty stub | ✅ | GitLab has real content |
| mortuary | ⚠ empty stub | ✅ | **no GitLab repo exists** |
| opd-clinical | ✅ real | ✅ | |
| operation-theatre | ⚠ empty stub | ✅ | GitLab has real content |
| ot-lib | ⚠ empty stub | — | GitLab repo exists, not declared in `angular.json` |
| patient-lib | ✅ real | — | present locally, not declared in `angular.json`; mostly a *consumer* of other libraries, not a widely-shared provider |
| pharmacy | ⚠ empty stub | ✅ | GitLab has real content |
| physiotherapy | ⚠ empty stub | ✅ | GitLab has real content |
| pre-surgery | ⚠ empty stub | ✅ | **no GitLab repo exists** |
| procurement | ✅ real | ✅ | |
| queue-management | ⚠ empty stub | ✅ | **no GitLab repo exists** |
| quotation-management | — GitLab-only | ✅ | bare scaffold |
| revenue-cycle-management | ✅ real | ✅ | has a real curated `public-api.ts` (most sibling libraries don't) |
| ris | ✅ real | ✅ | |
| scheduling-lib | — GitLab-only | — | bare scaffold; real package name is `@lifetrenz/schedule` |
| settings | ✅ real | ✅ | |
| settings-lib | — GitLab-only | — | bare scaffold, likely unrelated to the active `settings` library |
| support-ticket-management | ⚠ empty stub | — | GitLab has real content, not declared in `angular.json` |
| user-management | ✅ real | ✅ | UI library — distinct from the backend `user-management-service` |
| video-consult | — GitLab-only | — | `ui-library/video-consult` is **completely empty** (only a default README) — distinct from the `ui/video-consult` app, which does have content |
| workflow | ⚠ empty stub | ✅ | GitLab has real content |

**"⚠ empty stub" repos** (20 total, see table) are local folders with **no
real source** (no `package.json`, no `src/`) — confirmed by direct filesystem
check, not inferred. Of these, 7 (`committee`, `doctor-payout`,
`incident-management`, `lis-sample-tracking`, `mortuary`, `pre-surgery`,
`queue-management`) have **no matching GitLab repo either** (confirmed via
`gitlab-reader` 404s/zero search results) — despite being declared in
`angular.json`, these do not exist as real, buildable projects anywhere
accessible from this workspace. The other 13 empty-stub repos (`anesthesia`,
`blood-bank`, `clinical-pharmacy`, `diet-management`, `lab-sample-collection`,
`lis-configuration`, `mis-reports`, `operation-theatre`, `ot-lib`, `pharmacy`,
`physiotherapy`, `support-ticket-management`, `workflow`) do have real content
on GitLab — just not checked out to this local branch/worktree. Don't spend
time looking for source in the 7 that don't exist; ask before assuming a
feature described as living in one of them is real.

`angular.json` also declares `clinical-station`, `cms`, `cssd`, `lib`,
`linen-laundry`, `lis-result`, `mrd`, `oncology`, `qc`, `quality`,
`roster-management` — none of these have a matching `ui/ui-library/*` GitLab
project or a local checkout; treat them as not-yet-created/renamed.

### Library sizes (verified via `knowledge-graph get_service_context`)

| Library | Components | Services | Modules |
|---|---|---|---|
| settings | 364 | 132 | 92 |
| clinical-casesheet | 693 | 305 | 9 |
| masters | 337 | 203 | 81 |
| revenue-cycle-management | 282 | 125 | 21 |
| adt | 238 | 66 | 26 |
| front-desk-management | 208 | 61 | 24 |
| inventory | 205 | 60 | 164 |
| inpatient | 124 | 40 | 72 |
| procurement | 126 | 27 | 27 |
| ambulance | 93 | 31 | 16 |
| lifetrenz-core-root-app (the shell itself) | 100 | 85 | 59 |
| patient-lib | 67 | 46 | 3 |
| opd-clinical | 48 | 27 | 34 |
| ris | 43 | 53 | 25 |
| indent | 58 | 21 | 20 |
| user-management (UI) | 21 | 20 | 23 |

## `lifetrenz-core` — how the workspace fits together

- Local path: `UI-BE/lifetrenz-core`, GitLab repo `ui/lifetrenz-core`.
- One Angular 17 workspace; `angular.json` defines a single `"lifetrenz"`
  application with **~30+ named build/serve configurations**
  (`opd-clinical-dev`, `mis-dev`, `rcm-dev`, `adt-dev`, `inpatient-dev`,
  `settings-dev`, `physiotherapy-dev`, `anesthesia-dev`,
  `operation-theatre-dev`, …) — each bundles a different subset of the
  `ui-library` repos checked out under `projects/*`. How to actually run these:
  [running-locally.md](./running-locally.md).

## Other GitLab groups

| Project | Notes |
|---|---|
| `mobility/lab-courier-app` | Separate from `be/mobility`; not investigated |
| `utility-projects/filesyncagent` | Internal file-sync tooling, own repo, unrelated to the HIS product |
| `design-documents` | Design docs, not code |

## Non-service local folders under UI-BE

| Folder | What it is |
|---|---|
| `config-repo-local` | Local mirror of the Spring Cloud Config repo ("LTHS-Config-Files") — per-service `.properties` per environment. Not a service, no own `.git`. |
| `dev-proxy` | nginx reverse-proxy config — see [running-locally.md](./running-locally.md). |
| `report-service-fix-bed-config` | Empty folder, no matching GitLab project — not a real service. |

## Redmine projects

See [redmine.md](./redmine.md).
