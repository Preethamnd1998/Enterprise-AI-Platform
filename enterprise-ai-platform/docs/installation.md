# Plugin Installation & Update (Week 2)

## One-time: publish the plugin via a private git marketplace
1. Commit this `enterprise-ai-platform/` folder to a git repo (e.g. `gitlab/internal/enterprise-ai-platform`).
2. Add a marketplace manifest at the repo root (`.claude-plugin/marketplace.json`):
   ```json
   {
     "name": "lifetrenz-internal",
     "owner": { "name": "Lifetrenz Engineering" },
     "plugins": [
       { "name": "enterprise-ai-platform", "source": "./", "description": "Enterprise AI Platform v3 commands" }
     ]
   }
   ```

## Per engineer: install (once)
```
/plugin marketplace add gitlab/internal/enterprise-ai-platform
/plugin install enterprise-ai-platform@lifetrenz-internal
```
Verify: `/help` lists `/bug-fix`, `/planning`, `/ui-redesign`, `/migration`.

## Update (when a new version ships)
```
/plugin marketplace update lifetrenz-internal
/plugin update enterprise-ai-platform
```
Pin/rollback by tag in the marketplace source if needed. Because the engine is one plugin,
every engineer and every repo moves in lockstep — no per-repo copies to keep in sync.

## What stays per-repo (NOT in the plugin)
- `.claude/settings.json` (MCP deny-list + ask rules) — from `repo-template/.claude/settings.json`
- `.claude/CLAUDE.md` (module boundaries) — from `repo-template/.claude/CLAUDE.md`
- `.claude/audit/log.jsonl` (created on first run)
