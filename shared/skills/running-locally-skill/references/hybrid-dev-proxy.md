# Hybrid mode (local services + canary-dev via dev-proxy) and the port table

## Hybrid checklist: for each service you run locally, change all four places

Hybrid = some UI and BE local; Kafka, console and every other service come from the chosen environment
(canary-dev by default). When the user says which service(s) they run locally, **make these edits
yourself** (the user does not want to hand-edit them) and tell them what changed:

1. **`docker-compose.dev-proxy.yml`**: comment out that service's port line so nginx stops claiming it
   (copies at `~/Lifetrenz/` and `~/Lifetrenz/Projects/Sandbox/`).
2. **Hosts file** (`/etc/hosts` on macOS, `C:\Windows\System32\drivers\etc\hosts` on Windows, needs
   admin): the `127.0.0.1 <short-name>` line must point at your local instance. Add or uncomment it
   (short names are in the table below). Services you do NOT run locally also resolve to 127.0.0.1 so
   Feign reaches the nginx proxy; only the compose port line differs (step 1).
3. **`start-local.sh` / `start-hybrid.sh`** (`~/Lifetrenz/`, `~/Lifetrenz/Projects/Sandbox/`) and
   `start-local.bat` on Windows: make sure the service is in the list that is started, and that every
   other service is not.
4. **UI: `proxy.hybrid.js`** in the `WAPP/<app>` repo you run: in `LOCAL_SERVICES`, **uncomment only the
   entries for the services running locally** and re-comment the rest (e.g. `"core": { port: 55003 }`;
   the key is the short name from the table, not the service directory name). Then
   `npm run start-hybrid`. One entry per local service; with several, uncomment several.

Restart the proxy after steps 1-2 (`docker compose -f docker-compose.dev-proxy.yml down && up -d`).
These are local-only edits: do not commit them (see the branch note in
[run-backend-service.md](run-backend-service.md)). Undo them when switching back to canary-dev.

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
[projects.md](../../../ai-platform/knowledge/architecture/projects.md) — worth reconciling next time that inventory is
revisited, not something to treat as settled fact yet.

Start/stop the proxy: `docker compose -f docker-compose.dev-proxy.yml up -d` /
`down` (run from `UI-BE`).
