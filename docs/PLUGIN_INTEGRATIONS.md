# Plugin integrations

Built from shared sources by `npm run plugin:build` -> `dist/plugins/<client>/`.

| Client | Format | Contents | Verified (real) | Not verified |
|---|---|---|---|---|
| Claude Code | native plugin + local marketplace `eap-local` | commands, skills, hooks (audit, usage-logger), `.mcp.json` via launcher, `ai-platform/` bundle | `claude plugin validate` passes; `claude -p --plugin-dir` (session-only) loads v4.13.0: 13 commands + 12 skills, MCP `plugin:enterprise-ai-platform:*` connected | hooks firing; `plugin install` (global, not run) |
| Cursor | native plugin `.cursor-plugin/plugin.json` | commands, skills, rules (.mdc), `mcp.json`, bundle | structure vs official docs; local path per cursor.com/docs/plugins ("Test plugins locally": copy to `~/.cursor/plugins/local/<name>`, reload) | **never run in Cursor** (not installed); hooks not built; Enterprise needs "Allow Local Plugin Imports" |
| OpenCode | `plugins/eap.js` + `commands/` `skills/` `agents/` files | `config` hook injects MCP (user entries win), `tool.execute.before` secret-file guard, 13 commands, 2 agents, 12 skills | OpenCode 1.18.34 (sandboxed XDG_CONFIG_HOME): plugin loaded, `unified-trace` connected via launcher, 13 commands, both agents, skills (user's same-named global skills win) | `tool.execute.before` firing in a live session |

Commands/skills reference the bundled standards: `${CLAUDE_PLUGIN_ROOT}/ai-platform/...` (Claude, substituted by Claude Code in content) or the absolute install dir (Cursor/OpenCode, resolved at build). `~/.claude/CLAUDE.md` (global contract) is NOT installed by the plugin.
Duplicate MCPs: Claude does not dedupe (verified: user + plugin copies both start). `plugin:build` therefore omits ids already at user scope (`--prefer-plugin` to include). OpenCode: existing same-named entries win, stale ones stay stale.

Known gaps: Cursor hook port; `~/.claude/CLAUDE.md` contract not shipped by plugins.
Commands: `npm run plugin:install:{claude,cursor,opencode,all}`, `plugin:update`,
`plugin:uninstall -- <client>`. Dry-run by default; `-- --apply` writes; `-- --config-root <dir>` sandboxes.
