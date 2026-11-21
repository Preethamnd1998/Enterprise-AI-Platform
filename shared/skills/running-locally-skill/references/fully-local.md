# Fully local mode

## UI shells: one repo per app (status as of 2026-11-14)

The monolithic `lifetrenz-core` is split. The UI is **one repo per app**, cloned under `WAPP/<app>`
(`https://git.lifetrenz.com/novel/his-ehr/ui/<app>.git`: settings, masters, opd-clinical, ipd-clinical,
er-clinical, audit, adt, rcm, ...). Each is a copy of the old shell that keeps only the modules it needs
as real submodules in `projects/<module>` (`.gitmodules` -> `ui/ui-library/<module>.git`).
`WAPP/main` is the new shell (`projects/home` + `projects/lib`). `WAPP/lifetrenz-core` is a
**legacy shell with an empty `projects/`**, kept for reference only; its `angular.json`/tsconfig still
list removed modules, so do not run or branch from it for new work. See
[projects.md](../../../ai-platform/knowledge/architecture/projects.md) (older split-status table) and lths-mgmt `workspace/architecture/wapp-multi-repo.md` for the module-to-repo map.

Run and debug from the app repo that owns the module, in `WAPP/<app>`. For a library change, work in the
`ui-library/<module>` checkout (submodule), then move the pointer in each consuming app repo.

## The three running modes (same scripts in every app repo)

| Mode | Scope | UI script | Proxy |
|---|---|---|---|
| Fully local (rarely used) | all BE + Kafka/Zookeeper/Consul local | `npm start` | `proxy.conf.json` (local ports) |
| Hybrid | some UI and BE local; Kafka, console and the rest from the chosen environment | `npm run start-hybrid` | `proxy.hybrid.js` (one service uncommented -> localhost, rest -> canary-dev gateway) |
| Dev mode | all BE on the server, only the UI local | `npm run start-dev` (`start-vista-dev` for Medvista) | `proxy.dev.json` -> `https://canary-dev.lifetrenz.com/api-gateway/` |

All three serve on port 4440 with `--configuration=local`, so they read
`environments/common/environment.local.ts` (the `environment.ts` file replacement). Other `start-*`
scripts (`start-ambulance`, `start-mis` on 4441, `start-mrd` on 4442, ...) are leftovers from the
monolith that still exist in each app's `package.json`; use the plain `start*` scripts of the app you cloned.

## Per-shell environment files: `baseUrl` is set per mode

Each shell keeps `environments/common/environment.{local,dev,stage,prod}.ts` and edits them per shell
(for example `WAPP/audit/environments/common/`). Do not trust a generic value; open the file.
- `environment.local.ts` (fully local): `baseUrl: 'http://localhost:55002/'` (gateway), `appDomain:
  'http://localhost:4580/#/login'`, `imageBasePath: 'http://localhost:55004/'`, with a few shared hosts
  (`iconPath`, `webSocketServiceUrl`, `mqttWsUrl`) still on canary-dev.
- `environment.dev.ts` (dev/server): `baseUrl: 'https://canary-dev.lifetrenz.com/api-gateway/'`,
  `appDomain`/`environmentUrl`/`consentUrl: 'https://canary-dev.lifetrenz.com/'`,
  `imageBasePath: 'https://canary-dev.lifetrenz.com/clinical/'`, `webSocketServiceUrl: 'wss://canary-dev.lifetrenz.com/ws'`.
- **Gotcha:** `start-dev` and `start-hybrid` also use `--configuration=local`, so they load
  `environment.local.ts`. For dev mode, set its `baseUrl` (and related URLs) to the values in
  `environment.dev.ts`, or the browser calls `localhost:55002` and bypasses the proxy. Do not commit that
  local edit unintentionally; confirm in the shell first (the angular.json `local` configuration
  replaces `environment.ts` with `common/environment.local.ts`).

## Fully local

**Backend**: run `config-service`, `auth-service`, `gateway-service`,
`core-service` (master data), `user-management-service` (login), plus whichever
other services the feature you're working on needs. Also requires Kafka,
Zookeeper, and Consul running locally.

**UI**: from `WAPP/<app>`, `npm start`; `environment.local.ts` must point `baseUrl`/`appDomain` at the
local gateway (55002, per the port table below). Confirm the exact context path against a working fully-local run.
