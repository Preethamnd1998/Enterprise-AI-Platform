---
name: running-locally-skill
description: Run Lifetrenz UI modules and Spring Boot services locally (fully local, hybrid via dev-proxy, or against canary-dev): npm start-* scripts, environment.local.ts, port table, start-local.bat, STS run config, Feign explicit URLs. Load when starting/debugging anything locally or asking which port a service uses.
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
| Which mode? UI `npm run start-<project>` scripts, `environment.local.ts` baseUrl/appDomain, which modules still live in the monolith | [references/fully-local.md](references/fully-local.md) |
| Local port → service table, dev-proxy (nginx) start/stop, hosts-file switch to run one service locally | [references/hybrid-dev-proxy.md](references/hybrid-dev-proxy.md) |
| Run one Spring Boot service: `start-local.bat`, STS/Eclipse env vars + VM args, Feign explicit URLs (most common "can't reach other service" cause) | [references/run-backend-service.md](references/run-backend-service.md) |
| UI hybrid `start-*-hybrid` scripts, `config-repo-local` properties files | [references/ui-hybrid-and-config.md](references/ui-hybrid-and-config.md) |

## 30-second summary

- **Three modes:** fully local (all BE + Kafka/Zookeeper/Consul local) · hybrid (your service local,
  everything else proxied to canary-dev through `UI-BE/dev-proxy` on fixed ports 550xx) · all
  canary-dev.
- **UI:** `UI-BE/lifetrenz-core` → `npm run start` (root app; modules enabled by what is
  uncommented in `app-routing.module.ts`) or `npm run start-<project>` for one module;
  `start-*-hybrid` variants use `proxy.hybrid.js`. As checked in, `environment.local.ts`
  points at canary-dev (hybrid); for fully local point `baseUrl`/`appDomain` at the local
  gateway (port 55002, verify context path).
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
