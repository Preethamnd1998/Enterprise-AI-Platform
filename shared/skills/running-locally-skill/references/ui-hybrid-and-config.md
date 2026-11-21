# UI in hybrid mode + local config files

**UI in hybrid mode**: every `WAPP/<app>` repo has `npm run start-hybrid`
(`ng serve --port 4440 --proxy-config proxy.hybrid.js --configuration=local`). Open `proxy.hybrid.js`,
uncomment the ONE service you run locally, start that service (see run-backend-service.md), then
run the script. `/api/<svc>/...` goes to `localhost:<port>` for that service; everything else, plus
Kafka and the console, goes to the canary-dev gateway. Legacy per-module `start-*-hybrid` scripts
(`start-fdm-hybrid`, `start-opd-hybrid`, ...) exist in the app `package.json`s as monolith leftovers.
Use the plain `start-hybrid` in the app you cloned.

## Config files

`C:\config-repo-local` (or `UI-BE\config-repo-local`, pointed at by
`CONFIG_REPO` — see above) holds the `{app-name}-{profile}.properties` files
every service reads to run outside of Consul/Config-Server. Check there first
if a locally-run service is missing configuration.
