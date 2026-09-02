# Lifetrenz HIS — Architecture Knowledge Base (Entry Point)

> Audience: AI coding agents working on Redmine issues against this codebase.
> Sources: local repos under `D:\GitLab-Workspace\UI-BE`, the `knowledge-graph`
> MCP (Java/Angular static analysis), the `gitlab-reader` MCP, a live
> `redmine-reader` MCP, and direct user confirmation where noted. Anything not
> confirmed by one of these is marked **Not verified** — do not treat it as fact.
>
> Companion files: [projects.md](./projects.md) · [environments.md](./environments.md) ·
> [dependencies.md](./dependencies.md) · [redmine.md](./redmine.md) ·
> [running-locally.md](./running-locally.md) ·
> [repo knowledge/](../repo%20knowledge/README.md) (per-repo orientation +
> `knowledge-graph` MCP pointer, one file per git repo)
>
> Related, already-curated docs (not duplicated here — read directly when relevant):
> `Knowledge Repo/docs/Custom Flow knowledge/` (BOM, Pagination & Global Filter, Upload
> framework), `Knowledge Repo/docs/patterns/` (Angular / Spring Boot coding patterns),
> `Knowledge Repo/docs/standards/coding-standards.md`, `Knowledge Repo/docs/Testing/testing.md`.

## 1. System shape

```
                         ┌─────────────────────────────┐
   Browser  ─────────▶   │   lifetrenz-core (Angular)   │   UI monolith, ~30+ build targets
                         │   projects/<41 lib folders>  │   (opd-clinical-dev, rcm-dev, adt-dev, …)
                         └──────────────┬───────────────┘
                                        │ HTTPS (REST)
                                        ▼
                         ┌─────────────────────────────┐
                         │      gateway-service          │  Spring Cloud Gateway, app name `apigateway`
                         └──────────────┬───────────────┘
                                        │ routes to, via Consul service discovery
        ┌───────────────┬──────────────┼──────────────┬───────────────┬───────────────┐
        ▼               ▼              ▼              ▼               ▼               ▼
   auth-service   core-service   appointment-    clinical-common-  inventory-      ipd-service /
                  (central hub)  service         service           service         ipd-clinical-service
        │               │              │              │               │               │
        └───────────────┴──────────────┴──────────────┴───────────────┴───────────────┘
                    + notification-service, rcm-service, report-service,
                      supplementary-service, user-management-service, file-store
                                        │
                    ┌───────────────────┴───────────────────┐
                    ▼                                       ▼
             PostgreSQL (per-service db,               MongoDB Atlas (per-service db,
             e.g. LOCAL-CORE, LOCAL-INV,                e.g. LTHS-OPD, LTHS-UMC,
             LOCAL-IPD, LOCAL-RCMDB, SUPDB)             LTHS-IPD-CLINICAL, LTHS-USER-MGMT)

   config-service (Spring Cloud Config Server) ── serves config to every service above,
   reading from config-repo-local / the LTHS-Config-Files repo. All services also register
   with Consul (canary-dev.lifetrenz.com:8500) and communicate async via Kafka.
```

No sequence diagram or full ER model is maintained here by design — pull it
from the `knowledge-graph` MCP or a service's own `src/main/resources` when a
specific change needs it.

## 2. UI monolith model — read this before touching lifetrenz-core

`lifetrenz-core` is **one Angular 17 workspace**, not a set of independent apps.
Its `angular.json` defines a single `"lifetrenz"` application with **~30+ named
build/serve configurations** (`opd-clinical-dev`, `mis-dev`, `rcm-dev`, `adt-dev`,
`inpatient-dev`, `settings-dev`, `physiotherapy-dev`, `anesthesia-dev`,
`operation-theatre-dev`, …) — each configuration bundles a different subset of
the `projects/*` libraries into a deployable entry point. See
[running-locally.md](./running-locally.md) for how to actually run one.

Each `projects/<name>` folder is its **own independent git repository**, checked
out inside `lifetrenz-core/projects/<name>` with its own `.git` pointing at
`novel/his-ehr/ui/ui-library/<name>.git` on GitLab (no `.gitmodules` file exists
at the `lifetrenz-core` root — this is a manual multi-repo checkout convention,
not a git submodule setup). Treat each library as independently versioned and
independently branchable. Full library list, including several `ui/ui-library/*`
GitLab repos not yet wired into `angular.json` (`video-consult`, `artifacts`,
`settings-lib`, `scheduling-lib`): [projects.md](./projects.md).

**Which libraries are actually shared?** `masters`, `clinical-casesheet`, and
`adt` are the most widely depended-upon UI libraries (13–15 other modules import
each of them, per the knowledge graph's real import edges). `patient-lib` is
mostly a *consumer* of other modules rather than a widely-shared provider.
Full lists in [dependencies.md](./dependencies.md).

## 3. Backend services — one-line map

| Service | Owns | DB |
|---|---|---|
| `gateway-service` | API gateway / routing | — |
| `auth-service` | Authentication | Not verified |
| `user-management-service` | Users, roles, identity | MongoDB `LTHS-USER-MGMT` |
| `core-service` | Master/reference data — the most-depended-on service in the whole system | PostgreSQL `LOCAL-CORE` |
| `appointment-service` | OPD scheduling | MongoDB `LTHS-OPD` |
| `clinical-common-service` | Shared clinical domain logic (observations, assessments, allergies, etc.) | MongoDB `LTHS-UMC` |
| `ipd-clinical-service` | IPD clinical documentation, HIE/HL7/Malaffi/ABDM integration | MongoDB `LTHS-IPD-CLINICAL` |
| `ipd-service` | IPD billing / administrative (largest service by class count) | PostgreSQL `LOCAL-IPD` |
| `inventory-service` | Inventory/pharmacy stock | PostgreSQL `LOCAL-INV` |
| `supplementary-service` | Ambulance, housekeeping, chat/messaging modules | PostgreSQL `SUPDB` |
| `rcm-service` | Revenue Cycle Management (prior-auth, claims) | PostgreSQL `LOCAL-RCMDB` |
| `report-service` | Reporting (Spring Batch); reads across most other services' DBs | PostgreSQL `LOCAL-REPRT` + cross-service read access |
| `notification-service` | Email/SMS/WhatsApp notifications | MongoDB `LTHS-NOTIFICATION` |
| `file-store` | Object storage (S3/Alibaba) | — |
| `config-service` | Spring Cloud Config Server | — |
| `mobility` | Mobility platform backend | MongoDB `LTHS-MBLTY` |
| `relay` | Relay service | MongoDB `LTHS-Relay` |

Full inventory (including 11 further `be/*` services that exist on GitLab with
no local checkout — `cssd-service`, `ai-service` (Python), `lis-service`,
`phlebotomy-service`, `audit-service`, `product-mgmt-service`,
`clinical-pharmacy-service`, `video-consult-service`, `clinical-workflow-service`,
`blood-bank-service`, `internal-relay-service`), tech stack, and git remotes:
[projects.md](./projects.md). Full dependency edges: [dependencies.md](./dependencies.md).

`UI-BE/config-service` contains a nested duplicate checkout
(`UI-BE/config-service/config-service/` has its own `.git`/`pom.xml`/`src`) —
confirm which copy is canonical before editing.

## 4. Environments

Real deployment branches: `development` → `V2-QA` → then forking into two
customer lineages — `Medvista-QA` → `Medvista-UAT` → `Medvista-PROD`
(RMH/Medvista), and `Aster-UAT` (Aster/GCC, and also **`ajyal-uat` — deployed
from this same `Aster-UAT` branch, not a branch of its own**) → `Aster-PROD`
(exists but not yet live). `development → v2-qa` and `v2-qa → medvista-qa` move
via controlled cherry-pick, not a full merge — every other promotion is a full
release from the prior environment. This has a direct consequence for Flyway
migrations: ordering can differ between branches because of the cherry-pick
steps, so always check the live migration history in the target environment
rather than assuming a version number is safe to reuse. Full detail:
[environments.md](./environments.md).

## 5. AI agent investigation workflow

```
1. Read Redmine issue (subject, description, acceptance criteria) — see redmine.md
2. Read attachments (screenshots, logs, SQL) — never assume irrelevant without checking
3. Check the issue's journal/comments for linked GitLab MR URLs — see redmine.md
4. Identify affected application/project — check projects.md
5. Check local repo first (D:\GitLab-Workspace\UI-BE); if unavailable/stale, use GitLab
6. Identify correct branch/environment for the issue — see environments.md
7. Knowledge-graph first: resolve_ui_api / search_knowledge / get_context_pack to trace
   UI constant → endpoint → controller → service → repository/DB, before any grep
8. Read only the exact files/methods the graph names (smallest useful region first)
9. Check shared-library / cross-service dependencies — see dependencies.md
10. Expand to a neighbor file only when the code you just read actually references it
11. Only then propose or make the code change
```

This mirrors the project's own `CLAUDE.md` "Knowledge graph first" contract — the
graph is a navigation/index layer, not implementation truth; always confirm by
reading the real file before editing.

## 6. Databases at a glance

- **PostgreSQL, one schema per service** (verified locally): `core-service`,
  `inventory-service`, `ipd-service`, `rcm-service`, `supplementary-service`,
  `report-service` each own a distinct local DB name — no shared schema in the
  `development` profile.
- **MongoDB Atlas, one database per service, mostly one shared cluster**:
  `appointment-service`, `clinical-common-service`, `ipd-clinical-service`,
  `user-management-service` share `cluster0.scxkf.mongodb.net` but with distinct DB
  names (logical, not physical, separation). `notification-service` and `mobility`
  use separate Atlas clusters.
- `auth-service`, `file-store`, `gateway-service`, `config-service`: no
  application database found in local config (stateless / credential-only) — Not
  verified beyond that.

Full table: [projects.md](./projects.md).

## 7. Technology stack

- **Backend**: Java, Spring Boot. Java version varies by service — verified via
  each `pom.xml`: most services are Java 17, `core-service` /
  `inventory-service` / `ipd-service` / `supplementary-service` are Java **21**,
  `config-service` is Java **11**. `ai-service` is **Python** (no `pom.xml`;
  `requirements.txt` + `run.py`), not Spring Boot.
- **UI**: Angular 17 + PrimeNG 17 across `lifetrenz-core` and every
  `ui-library`/`ui/*` app except one. `ui/license-management-system` is
  **React 19 + Vite + Tailwind CSS + Radix UI** — the one non-Angular frontend
  in this workspace.
