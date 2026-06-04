# Repository Onboarding Checklist (Week 2)

Adopt the platform in a new enterprise repo in ~10 minutes.

☐ 1. Plugin installed for the engineer (`/plugin install enterprise-ai-platform@lifetrenz-internal`).
☐ 2. Copy `repo-template/.claude/settings.json` → `<repo>/.claude/settings.json`.
     - Add the repo's DB MCP read tool to allow (e.g. `mcp__<repo>-db__query`) if data tasks are expected.
☐ 3. Copy `repo-template/.claude/CLAUDE.md` → `<repo>/.claude/CLAUDE.md` and fill in:
     ☐ Stack + GitLab project + default branch + active release branches
     ☐ Flyway location
     ☐ Module boundaries (top-level package/lib prefixes)
     ☐ Shared/allowed cross-module packages
     ☐ Forbidden boundaries
☐ 4. Confirm MCP servers are connected: `gitlab-reader`, `redmine-reader` (and DB MCP if used).
☐ 5. Create the audit dir: it is auto-created on first run, or `mkdir -p .claude/audit`.
☐ 6. Smoke test:
     ☐ `/bug-fix "NullPointerException in OrderService.place"`  → expect ≤ 10 files, both gates reported
     ☐ `/migration mode=exact mr=!<recent> target=<release>`   → expect minimal patch + validation
☐ 7. Commit `.claude/settings.json` + `.claude/CLAUDE.md` (NOT `.claude/audit/`; add it to `.gitignore` or keep per-policy).

Done when both smoke tests pass and produce an audit line.
