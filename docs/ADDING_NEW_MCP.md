# Adding a new MCP

1. Put source under `shared/mcp-tools/<name>/` (own package.json / requirements; no venv, no binaries).
2. Resolve every path through `shared/core/path-resolver`; guard file access with `shared/core/security`.
3. Add an entry to `shared/core/mcp-registry/registry.json` (runtime, entry, dependencies, env,
   platforms, healthcheck, permissions, `expose`, `clients`).
4. If it has npm/pip deps, list them under `dependencies` (runtime-manager installs them).
5. `npm run mcp:doctor && npm run mcp:selftest && npm test`; add a case to `shared/core/tests/`.
6. `npm run plugin:build` — all three clients pick it up automatically if `expose: true`.
