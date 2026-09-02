# Running the Application Locally

Three modes: fully local, hybrid (local UI/BE mixed with canary-dev backends via
a proxy), or run everything against canary-dev. This doc covers the first two.

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
| ltauth / auth | 55001 | auth-service |
| apigateway | 55002 | gateway-service |
| core | 55003 | core-service |
| clinical | 55004 | clinical-common-service |
| ums / usermgmt | 55006 | user-management-service |
| appointment | 55009 | appointment-service |
| relay | 55010 | relay |
| inventory | 55015 | inventory-service |
| report | 55014 | report-service |
| queue | 55029 | queue/queue-management |
| file-store | 55032 | file-store |
| ipd | 55033 | ipd-service |
| ipd-clinical | 55036 | ipd-clinical-service |
| ccs | 55037 | clinical-common-service (alt entry) |
| notification | 55039 | notification-service |
| rcm | 55040 | rcm-service |
| provider-postbox | 55043 | provider-postbox |

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
