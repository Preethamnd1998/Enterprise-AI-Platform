# Repository Onboarding Checklist

**See also:** [`README.md`](../../../README.md) · [`usage-instructions.md`](../../../usage-instructions.md) · [`prompt-guide.md`](../../../prompt-guide.md) · [`boundary-examples.md`](boundary-examples.md) · [`mcp-setup.md`](mcp-setup.md)

---

Adopt the platform in a new repo in ~10 minutes.

## Global install (once per machine)

```text
cd d:\enterprise-ai-platform\enterprise-ai-platform\install
.\install-claude.ps1                        # installs contract + commands + standards globally
.\install-claude.ps1 -RepoPath <repo-path>  # adds .claude/ config to a specific repo
```

## Context folder (once per machine)

1. Create a folder outside all repos, e.g. `D:\AI-Context\`
1. Open `D:\enterprise-ai-platform\context\context.path`
1. Write the path on the first non-comment line and save

All agents in all repos will read from that folder when you say `context`.
See [`prompt-guide.md`](../../prompt-guide.md) for usage patterns.

## Per-repo checklist

```text
☐ 1. Run install-claude.ps1 -RepoPath <path>  (copies .claude/ template)
☐ 2. Edit <repo>/.claude/CLAUDE.md — fill in:
       Stack + GitLab project + default branch + active release branches
       Flyway location
       Module boundaries (top-level package/lib prefixes)
       Shared/allowed cross-module packages
       Forbidden boundaries
☐ 3. Confirm MCP servers connected: gitlab-reader · redmine-reader (+ DB MCP if data tasks expected)
☐ 4. Add DB MCP read tool to allow-list in .claude/settings.json if needed
☐ 5. Audit dir is auto-created on first run — or mkdir .claude/audit manually
☐ 6. Smoke test:
       /bug-fix "NullPointerException in OrderService.place"
         → expect ≤ 10 files · both gates PASS · Prompt Quality score shown
       /migration mode=exact mr=!<recent> target=<release-branch>
         → expect minimal patch + validation PASS
☐ 7. Commit .claude/settings.json + .claude/CLAUDE.md
       Do NOT commit .claude/audit/ — add to .gitignore
```

Done when both smoke tests pass and each produces an Execution Summary with a Prompt Quality score.
