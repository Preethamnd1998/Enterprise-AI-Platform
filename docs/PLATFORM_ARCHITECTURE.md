# Platform architecture

One repo, one implementation per MCP, thin per-client adapters.

```
shared/mcp-tools/        MCP source owned here (unified-trace-mcp, opencode-mcp-bridge, kafka-mcp)
../knowledge-graph-generator   SEPARATE repo (KG + vendored code-cortex/); found as sibling or via KNOWLEDGE_GRAPH_PATH
shared/core/
  path-resolver/         ALL OS-aware paths (venv, code-cortex bin, config dirs, settings)
  security/              path guard, deny-list, redaction, safe spawn
  mcp-registry/          registry.json + launch specs (one definition per MCP)
  runtime-manager/       npm deps, venv, code-cortex install, doctor
  plugin-manager/        build + install/update/uninstall for claude-code | cursor | opencode
  launcher.js            `node launcher.js <id>` — resolves + starts any MCP for this OS
  cli.js                 npm scripts entry (platform:*, mcp:*, plugin:*)
shared/{commands,skills,standards,rules,prompts,contract.md}   shared engineering content
paths.env / paths.local.env                                    settings (local one gitignored)
dist/plugins/            per-machine build output (gitignored)
```

Rules: MCP servers never know which client runs them; clients never hold python/binary
paths (they call the launcher). Venvs/binaries are recreated per machine, never copied.
Migration record: `shared/mcp-tools/MIGRATION.md` (superseded: the KG stayed its own repo; its changes were merged there — see MR below). Legacy `adapters/*` installers remain
until the plugin path is verified on real machines.
