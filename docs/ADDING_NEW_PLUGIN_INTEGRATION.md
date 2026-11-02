# Adding a new client integration

1. Research the client's real plugin/extension format; don't force another client's format.
2. Add `client-id` to `CLIENTS` and a builder in `shared/core/plugin-manager/build.js`
   (reuse `copyShared`, `copyBundle`, `serversForClient`, `clientLaunch`).
3. Add its target dir to `targetFor` (`plugin-manager/index.js`) and config paths to `clientPaths`
   (`path-resolver`). Install must stay dry-run by default, backup before overwrite, track files
   in `.eap-install.json`, and never edit global config without `--apply`.
4. Add `clients: ["<id>"]` to registry entries; add structure + sandbox-install tests (`tests/plugins.test.mjs`).
5. Document native vs config-only features and what is unverified in `PLUGIN_INTEGRATIONS.md`.
