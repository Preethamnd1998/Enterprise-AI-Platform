---
name: running-locally-skill
description: Run Lifetrenz UI apps (split WAPP/<app> shell repos; lifetrenz-core is legacy) and Spring Boot services locally (fully local, hybrid via dev-proxy, or dev mode against canary-dev): npm start / start-dev / start-hybrid, environment.local.ts vs environment.dev.ts baseUrl, port table, start-local.bat, STS run config, Feign explicit URLs. Load when starting/debugging anything locally or asking which port a service uses.
metadata:
  type: skill
  scope: local-dev-environment
  stack: angular, spring-boot, docker, consul
  audience: frontend-agents, backend-agents, debugging-agents
  source: "Reclassified from shared/knowledge/architecture/running-locally.md (2026-10-13). Split into an index + references/ (2026-11-13) for progressive loading."
---

# Running the Application Locally — index

This file is an **index**. Read only the reference file for the mode the task needs; do not
load all four.

| Task | Read |
|---|---|
| Which mode? UI shell repos (`WAPP/<app>`), `npm start` / `start-dev` / `start-hybrid`, `environment.local.ts` vs `environment.dev.ts` baseUrl, legacy `lifetrenz-core` | [references/fully-local.md](references/fully-local.md) |
| Local port → service table, dev-proxy (nginx) start/stop, hosts-file switch to run one service locally | [references/hybrid-dev-proxy.md](references/hybrid-dev-proxy.md) |
| Run one Spring Boot service: `start-local.bat`, STS/Eclipse env vars + VM args, Feign explicit URLs (most common "can't reach other service" cause) | [references/run-backend-service.md](references/run-backend-service.md) |
| UI hybrid `start-hybrid` / `proxy.hybrid.js`, `config-repo-local` properties files | [references/ui-hybrid-and-config.md](references/ui-hybrid-and-config.md) |

## 30-second summary

- **UI is split (since 2026-11-14):** one repo per app, `WAPP/<app>` (settings, masters, opd-clinical,
  ipd-clinical, er-clinical, audit, ...), each a copy of the old shell keeping only the modules it
  needs as submodules in `projects/`. Run a module from **its own app repo**. `WAPP/lifetrenz-core` is
  now a legacy shell with an empty `projects/`; do not default to it or to `UI-BE/lifetrenz-core`.
  Library fixes land in `ui-library/<module>`; the app repo then moves its submodule pointer.
- **Three modes** (UI script names are the same in every app repo):
  - **Fully local** (rare): all BE + Kafka/Zookeeper/Consul local. `npm start` (`proxy.conf.json`,
    `--configuration=local`), `environment.local.ts` `baseUrl: 'http://localhost:55002/'`.
  - **Hybrid:** some UI and some BE local; Kafka, console and everything else from the chosen
    environment (canary-dev by default) through `proxy.hybrid.js`. `npm run start-hybrid`.
  - **Dev mode:** all BE on the server, only the UI local. `npm run start-dev` (`proxy.dev.json` ->
    `https://canary-dev.lifetrenz.com/api-gateway/`). `baseUrl` must be the server one, as in
    `environments/common/environment.dev.ts` (`https://canary-dev.lifetrenz.com/api-gateway/`).
    `start-vista-dev` is the Medvista variant.
- **Per-shell `environments/common/environment.{local,dev}.ts`:** `baseUrl`, `appDomain` etc. are
  kept per shell and may have been edited; read the file in the shell you are running instead of
  assuming. `start-dev` and `start` both build with `--configuration=local`, i.e. they read
  `environment.local.ts`, so check its `baseUrl` matches the mode you want.
- **Hybrid edits (agent does them):** for each local service comment its port in
  `docker-compose.dev-proxy.yml`, point its short name at 127.0.0.1 in the hosts file, list it in
  `start-local.sh`/`start-hybrid.sh`, and uncomment only that service in the app's `proxy.hybrid.js`
  `LOCAL_SERVICES`. Local-only, never committed. Details: hybrid-dev-proxy.md.
- **Branch matters for BE:** `development` runs in Docker (Consul); V2-QA and other envs run in
  Kubernetes. On a non-development branch, temporarily copy `pom.xml` + `bootstrap.yml` from
  `development` to run locally, and **never commit them**. Details: run-backend-service.md.
- **Backend, one service locally:** `.\start-local.bat <service-dir> [run-only]` or an STS run
  config with Consul/Config-Server/Bus/Stream disabled and
  `-Dspring.config.import=optional:file:<config-repo-local>/<app>-development.properties`,
  Kafka at `canary-dev.lifetrenz.com:9092`.
- **Feign needs explicit URLs** when discovery is off:
  `-Dspring.cloud.discovery.client.simple.instances.<name>[0].uri=http://127.0.0.1:<port>`
  per target service (full set in `start-local.bat`).
- **Key ports:** gateway 55002 · core 55003 · clinical-common 55004 · ums 55006 · ipd-clinical
  55036 · notification 55027 · inventory 55015 · report 55014 — full table with caveats in
  [hybrid-dev-proxy.md](references/hybrid-dev-proxy.md).
- Most rows in the port table came from the live canary-dev Consul catalog (2026-09-20); rows
  marked unverified there must be confirmed before relying on them.
