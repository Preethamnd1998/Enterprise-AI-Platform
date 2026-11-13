# UI in hybrid mode + local config files

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
