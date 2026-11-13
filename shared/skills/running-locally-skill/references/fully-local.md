# Fully local mode

## Split projects vs. the monolith (status as of 2026-09-20)

Most modules have split out of this `lifetrenz-core` monolith into their own
standalone GitLab repos under `ui/<name>` (each with its own embedded copy of
`lifetrenz-core`) — see the split-status table in
[projects.md](../../../ai-platform/knowledge/architecture/projects.md#split-status-per-module). For an already-split
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
