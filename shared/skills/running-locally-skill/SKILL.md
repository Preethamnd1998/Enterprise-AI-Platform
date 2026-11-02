---
name: running-locally-skill
description: |
  How to run the Lifetrenz lifetrenz-core monolith and its backend services locally — fully
  local, hybrid (local UI/BE mixed with canary-dev via dev-proxy), or pointed entirely at
  canary-dev. Covers which npm start-* script to use, environment.local.ts baseUrl/appDomain
  wiring, the dev-proxy port table (local port -> service), start-local.bat usage, STS/Eclipse
  run-configuration env vars and VM args for a locally-run Spring Boot service, and Feign's
  explicit-URL requirement with Consul discovery disabled. MUST be loaded by any agent or
  developer asked to start/run/debug a Lifetrenz service or UI module locally, diagnose why a
  locally-run service can't reach another service, or figure out which local port a given
  backend service listens on.
metadata:
  type: skill
  scope: local-dev-environment
  stack: angular, spring-boot, docker, consul
  audience: frontend-agents, backend-agents, debugging-agents
  source: "Reclassified from shared/knowledge/architecture/running-locally.md (procedural content, not descriptive fact) during the shared/skills + shared/knowledge + shared/standards reorganization, 2026-10-13. See shared/reports/ for the full audit."
---

# Running the Application Locally

Three modes: fully local, hybrid (local UI/BE mixed with canary-dev backends via
a proxy), or run everything against canary-dev. This doc covers the first two.

## Split projects vs. the monolith (status as of 2026-09-20)

Most modules have split out of this `lifetrenz-core` monolith into their own
standalone GitLab repos under `ui/<name>` (each with its own embedded copy of
`lifetrenz-core`) — see the split-status table in
[projects.md](../../knowledge/architecture/projects.md#split-status-per-module). For an already-split
module, run/deploy it from its own repo's checkout, not from here.

This doc (the `lifetrenz-core` monolith checkout) still applies to:
- modules that haven't split yet (per the split-status table — e.g.
  `callcenter`, `consulting-services`, `cssd` as of this writing), and
- the local copy of `lifetrenz-core` itself, kept specifically for running
  those not-yet-split modules, since developer access to the canonical
  `ui/lifetrenz-core` repo was removed once most modules split out (access
  comes back once Phase 2 turns it into a shared library — see projects.md).

## Fully local

**Backend**: run `config-service`, `auth-service`, `gateway-service`,
`core-service` (master data), `user-management-service` (login), plus whichever
other services the feature you're working on needs. Also requires Kafka,
Zookeeper, and Consul running locally.

**UI**: from `UI-BE/lifetrenz-core`, `npm run start` launches the root Angular
app; which feature sub-projects actually load depends on what's *not*
commented out in `app-routing.module.ts` — normally only the projects you need
are left uncommented. To run a single project on its own (nothing else loads),
use its dedicated script: `npm run start-<project>`.

`lifetrenz-core/package.json` defines the available scripts — check it directly
for the current list. As of this writing it includes (non-hybrid) start scripts
for: `ambulance`, `mis`, `mrd`, `umgt`, `adt`, `settings`, `fdm`, `home-care`,
`opd`, `emergency`, `inpatient`, `masters`, `infection`, `rcm`, `physiotherapy`,
`ris`, `anesthesia`, `operation-theatre` (e.g. `npm run start-adt`,
`npm run start-masters-dev`). Each maps to an `angular.json` build
configuration and a `proxy.*.json` file that decides which backend the calls
go to (`proxy.conf.json` = local ports, `proxy.dev.json` = canary-dev,
`proxy.vista-dev.json` = Medvista dev).

**`environments/common/environment.local.ts` — `baseUrl`/`appDomain` depend on
mode.** As checked in, this file is wired for *hybrid*/canary-BE use:
```
baseUrl: 'https://canary-dev.lifetrenz.com/api-gateway/',
appDomain: 'http://lcanary-dev.lifetrenz.com/#/login',
```
(the `appDomain` host has a stray leading `l` — `lcanary-dev` — that's an
existing typo in the file, not a second real host). Leave these canary-dev
values as-is when running hybrid, or when pointing the UI at canary-dev/BE
directly. For a genuinely *fully local* run (all BE services local, per the
"Fully local" section above), point both at the local gateway instead before
serving/building — matching the direct-port style already used elsewhere in
this same file (e.g. `imageBasePath: 'http://localhost:55004/'`):
```
baseUrl: 'http://localhost:55002/',
appDomain: 'http://localhost:55002/#/login',
```
(55002 = `gateway-service`, per the port table below.) Not independently
verified against the gateway's actual context-path config — confirm the
exact path segment against a working fully-local run before relying on it.

## Hybrid (local services + canary-dev for the rest)

**Backend**: `UI-BE/dev-proxy` is an nginx container that forwards fixed local
ports to `canary-dev.lifetrenz.com`'s API gateway per service — so any service
you are *not* running locally is transparently served from canary-dev. To run a
service locally instead, comment out its port line in
`UI-BE/docker-compose.dev-proxy.yml` (so nginx stops claiming that port) and
add/uncomment its hostname line in `C:\Windows\System32\drivers\etc\hosts` (so
Feign calls to that hostname resolve to `127.0.0.1` — your local instance —
instead of through the proxy). Both files carry the mapping between a
service's short name and its port:

| Short name | Port | Service |
|---|---|---|
| config-server | 55000 | config-service |
| ltauth / auth | 55001 | auth-service |
| apigateway | 55002 | gateway-service |
| core | 55003 | core-service |
| clinical | 55004 | clinical-common-service |
| ums / usermgmt | 55006 | user-management-service |
| appointment | 55009 | appointment-service |
| relay | 55010 | relay |
| cdss | 55012 | clinical decision support — not in the backend service inventory yet, name inferred from short name only |
| diet | 55013 | diet backend — not in the backend service inventory yet (only the `diet-management` UI module is documented); name inferred |
| report | 55014 | report-service |
| inventory | 55015 | inventory-service |
| lis | 55020 | lis-service |
| cps | 55021 | clinical-pharmacy-service — confirmed via the knowledge-graph indexer's own Feign/gateway-prefix discovery when `BE/clinical-pharmacy-service` was indexed (2026-09-20) |
| cws | 55022 | clinical-workflow-service (inferred from short name — not independently confirmed) |
| roster | 55023 | roster-mgmt-service (per `start-local.bat`'s supported service list) |
| interface | 55024 | unclear which service this is — not matched to anything in the backend inventory, verify before relying on it |
| phlebotomy | 55026 | phlebotomy-service |
| notification | 55027 | notification-service — **corrects this doc's previous entry, which had notification at 55039 (that port actually belongs to `supplementary`, below)** |
| bloodbank | 55028 | blood-bank-service |
| queue | 55029 | queue/queue-management |
| reportetl | 55030 | report ETL — not in the backend service inventory yet; name inferred |
| audit | 55031 | audit-service |
| file-store | 55032 | file-store |
| ipd-clinical | 55036 | ipd-clinical-service |
| ccs | 55037 | clinical-common-service (alt entry) |
| supplementary | 55039 | supplementary-service |
| rcm | 55040 | rcm-service |
| qc | 55041 | unclear which service this is — matches the `qc` UI module name in projects.md's split-status table but not confirmed as its backend; verify before relying on it |
| doctor-payout | 55042 | doctor-payout backend — not in the backend service inventory yet (only the `doctor-payout` UI module is documented); name inferred |
| provider-postbox | 55043 | provider-postbox |
| abdm | 55044 | ABDM integration backend (see `custom-flows/abdm/` knowledge docs) |
| cssd | 55045 | cssd-service |
| public-gateway | 55049 | unclear purpose — separate from `apigateway`, not matched to anything in the backend inventory, verify before relying on it |
| ai-service | 33393 | ai-service — non-standard port range and registered against the `canary-dev.lifetrenz.com` hostname rather than a container address like the others; verify before assuming this is reachable the same way |
| doc-pilot-api | 33395 | not in the backend service inventory — same non-standard port/address pattern as `ai-service`, verify |
| meet-transcriber | 33397 | not in the backend service inventory — same non-standard port/address pattern as `ai-service`, verify |
| internal-relay-service | 56001 | internal-relay-service (distinct from `relay`, port 55010) |
| mobility | 55019 | mobility |

Source: live Consul catalog on canary-dev
(`http://canary-dev.lifetrenz.com:8500/v1/catalog/services` +
`/v1/catalog/service/<name>`), captured 2026-09-20. **`ipd` (IPD
billing/admin, `ipd-service`) was not present in this catalog snapshot at
all** — this doc previously listed it at port 55033; that port could not be
re-confirmed live, so treat it as unverified until checked again (the service
may simply have been down at capture time, or now registers under a different
name). Every row above marked "not matched"/"unclear"/"inferred" is a gap
between this live port list and the documented backend service inventory in
[projects.md](../../knowledge/architecture/projects.md) — worth reconciling next time that inventory is
revisited, not something to treat as settled fact yet.

Start/stop the proxy: `docker compose -f docker-compose.dev-proxy.yml up -d` /
`down` (run from `UI-BE`).

Run a backend service locally, from a terminal, using `UI-BE/start-local.bat`:

```
.\start-local.bat core-service          # builds (mvn package -DskipTests) then runs
.\start-local.bat core-service run-only # skips the build, just runs the existing jar
```

Supported service directory names (from the script): `ipd-service`,
`core-service`, `auth-service`, `appointment-service`,
`user-management-service`, `gateway-service`, `rcm-service`,
`provider-postbox`, `clinical-service`, `inventory-service`, `audit-service`,
`blood-bank-service`, `clinical-common-service`, `clinical-workflow-service`,
`ipd-clinical-service`, `report-service`, `roster-mgmt-service`, `file-store`,
`supplementary-service`, `relay`, `notification-service`. The script resolves
the service name to a config file `{app-name}-development.properties` under
`C:\config-repo-local` (e.g. `core-service` → `core-development.properties`) —
this must exist (copy/point it at `UI-BE/config-repo-local` if running from a
fresh checkout; the script's `CONFIG_REPO` variable defaults to
`C:\config-repo-local` but has a commented-out alternative pointing at the
repo's own `config-repo-local` folder).

**Or run it from STS/Eclipse** as a Java Application run configuration:

Environment variables:
```
CONFIG_APP_NAME=config-service
CONSUL_HOST=canary-dev.lifetrenz.com
PROFILE=development
```

Program/VM arguments:
```
-Dspring.cloud.config.enabled=false
-Dspring.cloud.config.fail-fast=false
-Dspring.cloud.consul.discovery.enabled=false
-Dspring.cloud.consul.discovery.register=false
-Dspring.cloud.consul.config.enabled=false
-Dspring.cloud.config.discovery.enabled=false
-Dspring.cloud.bus.enabled=false
-Dspring.cloud.stream.enabled=false
-Dspring.config.import=optional:file:C:/config-repo-local/core-development.properties
-Dkafka-bootstrap-servers=canary-dev.lifetrenz.com:9092
```

(Substitute the service's own config filename in `spring.config.import`.) This
is the same strategy `start-local.bat` automates: Consul/Config-Server/Bus/Stream
disabled, config loaded from the local properties file directly, Kafka pointed
at the shared dev broker.

**Feign calls need an explicit URL.** With Consul discovery disabled locally,
Feign falls back to `SimpleDiscoveryClient`, which needs each target service's
address given explicitly — either a JVM arg per service:
`-Dspring.cloud.discovery.client.simple.instances.<name>[0].uri=http://127.0.0.1:<port>`
(see `start-local.bat` for the full set, keyed by the short names in the port
table above), or `http://<gateway-host>/api-gateway/<service>` if routing
through a gateway instead. Forgetting this is the most common cause of a
locally-run service failing to call another one.

**UI in hybrid mode**: same `app-routing.module.ts` commenting approach as
fully-local. Only a subset of `lifetrenz-core/package.json` scripts have a
hybrid variant (they use `proxy.hybrid.js` instead of `proxy.conf.json`) — run
these individually rather than the plain `start-*` scripts when mixing local
and canary-dev backends: `start-hybrid`, `start-umgt-hybrid`, `start-fdm-hybrid`,
`start-opd-hybrid`, `start-inpatient-hybrid`, `start-masters-hybrid`,
`start-rcm-hybrid`, `start-physiotherapy-hybrid`.

## Config files

`C:\config-repo-local` (or `UI-BE\config-repo-local`, pointed at by
`CONFIG_REPO` — see above) holds the `{app-name}-{profile}.properties` files
every service reads to run outside of Consul/Config-Server. Check there first
if a locally-run service is missing configuration.
