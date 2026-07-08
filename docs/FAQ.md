# Frequently Asked Questions

**Version:** v4.3.0

---

## General

**Q: What is the Enterprise AI Platform?**

A shared governance and execution layer that makes AI coding assistants (Claude Code, GitHub Copilot, OpenCode) follow the same rules across all engineers and all repos. One contract. One set of commands. Consistent, auditable, read-only AI behaviour.

**Q: Which platform should I use?**

Use Claude Code by default. It is the only platform with full security posture: MCP allowlist enforcement, contract hash-check, and session audit logging. Use Copilot when you are already in VS Code and the task is low-to-medium risk. Use OpenCode for terminal-only workflows. Never use Copilot or OpenCode for security-critical tasks (auth, PII, Flyway on PII tables).

See [docs/hitl-matrix.md](docs/hitl-matrix.md) for the full decision matrix.

**Q: Does the AI run autonomously or do I control it?**

You control it. By default, every command runs a **Phase 1: Discovery & Analysis** and then stops to ask for your approval before making any changes. You must type `approve`, `yes`, `proceed`, or `implement` to continue.

Use `auto=true` to skip the gate for low-risk, well-understood tasks. HIGH and CRITICAL risk tasks always require explicit approval regardless of `auto=true`.

**Q: Can the AI push code or merge MRs?**

No. The platform blocks all write operations at two levels:
1. **MCP allowlist:** only 28 read-only tools are allowed; all write tools are denied by `deny: ["mcp__*"]`
2. **Contract kernel:** prohibits git push, git commit, and destructive Bash commands

**Q: What is the approval gate?**

The approval gate is the mandatory pause between Phase 1 (analysis) and execution. The AI presents its findings and plan, then waits for one of: `approve`, `yes`, `proceed`, `implement`. This ensures you review the plan before any code is written.

---

## Installation

**Q: Do I need admin rights to install?**

No. The global install writes to `~/.claude/` in your user profile. The per-repo install writes to the repo directory. No admin or elevated permissions are needed.

**Q: Can I install Claude Code and Copilot in the same repo?**

Yes. They use different directories: `.claude/` for Claude Code and `.github/` for Copilot. Run both installers:
```powershell
pwsh install/install-claude.ps1 -RepoPath C:\src\your-service
pwsh install/install-copilot.ps1 -RepoPath C:\src\your-service
```

Or use the combined installer:
```powershell
pwsh install/install-both.ps1 -RepoPath C:\src\your-service
```

**Q: What does "global install" mean vs "per-repo install"?**

The **global install** (`pwsh install/install-claude.ps1` with no arguments) runs once per machine and writes the contract kernel, commands, and standards to `~/.claude/`. These are available in every Claude Code session, in every repo, without any per-repo setup.

The **per-repo install** (`-RepoPath <path>`) adds repo-specific configuration: module boundaries (`.claude/CLAUDE.md`), security settings (`.claude/settings.json`), and hook scripts (`.claude/hooks/`). This is needed for audit logging and contract hash-check.

**Q: Do I need to run the installer again when I create a new repo?**

Yes — run the per-repo install for each new consuming repo. The global install only needs to be run once (or on upgrade).

**Q: The installer says `~/.claude/settings.json` already exists. What do I do?**

Manually merge the platform's allowlist into your existing settings. Open both files and combine the `allow[]` arrays. The platform's reference is at `adapters/claude/config/settings.json`. Do not remove existing entries from your file.

---

## Commands

**Q: What arguments can I pass to commands?**

All commands accept `key=value` arguments separated by spaces:

| Key | Value | Purpose |
|---|---|---|
| `redmine=` | Issue ID | Discover scope from a Redmine ticket |
| `mr=` | `!<number>` | Discover scope from a GitLab MR |
| `commit=` | SHA | Discover scope from a specific commit |
| `branch=` | Branch name | Discover scope from a branch |
| `target=` | Branch name | Target branch for migrations |
| `mode=` | `exact` or `functionality` | Migration mode |
| `agents=` | 1, 2, or 3 | Enable subagents (Claude Code only) |
| `auto=true` | — | Skip approval gate |

Example: `/bug-fix redmine=12345 auto=true`

**Q: The command says "STACK_UNKNOWN". What does that mean?**

The `/test` command could not detect your test framework. It looks for `pom.xml`, `angular.json`, `package.json`, etc. If none are found, it emits `STACK_UNKNOWN` and does not guess.

Check that your project has a standard build file at the repo root or in a standard subdirectory.

**Q: What is the difference between `/migration mode=exact` and `mode=functionality`?**

- `mode=exact`: Smallest possible patch. No redesign, no refactor. Only what is required.
- `mode=functionality`: Preserve behaviour, not code. Target architecture may differ from source. Structural differences are expected.

Default is `mode=exact` unless the source and target architectures are known to differ significantly.

**Q: Can I run multiple commands in a row?**

Yes. Each command is independent. The approval gate applies to each command separately.

**Q: What is `/prompt-audit`?**

A command that analyses the quality of your recent prompts using the CRISP framework (Context · Role · Intent · Scope · Precision) and scores them 0–100. It identifies what was missing and suggests improvements. It never blocks execution — the score is informational only.

---

## MCP

**Q: Is MCP required?**

No. All commands work with local files. MCP adds the ability to discover scope from Redmine tickets and GitLab MRs — useful when you don't want to paste issue details manually.

**Q: Which MCP servers are supported?**

| Server | Purpose | Tools |
|---|---|---|
| `mcp__gitlab-reader` | GitLab read-only | 17 tools (issues, MRs, diffs, files) |
| `mcp__redmine-reader` | Redmine read-only | 3 tools (issues, projects) |
| `mcp__canary_mongo_db` | MongoDB read-only | 4 tools (find, aggregate, list) |
| `mcp__postgres-reader` | PostgreSQL read-only | 4 tools (query, schema) |

**Q: Can the AI write to the database through MCP?**

No. All database MCP tools in the allowlist are read-only. Write operations (`insertOne`, `updateOne`, `deleteOne`, `drop`, etc.) are blocked by `deny: ["mcp__*"]`. Additionally, MCP servers should be configured with read-only database users — both layers are required.

**Q: Can I add a new MCP tool to the allowlist?**

Yes, following the governance process. See [GOVERNANCE.md](GOVERNANCE.md) §1. Never add a write-capable tool to the allowlist.

---

## Security

**Q: What does the contract hash-check do?**

Before every tool use, the `hash-check.js` hook reads `~/.claude/CLAUDE.md`, extracts the contract kernel section, computes a SHA-256 hash, and compares it against `.ai/.contract-hash` in the repo. A mismatch means the contract was modified since the last install. The platform warns and re-injects the correct contract.

**Q: Is the audit log sent anywhere?**

No. `.claude/audit/log.jsonl` is written locally and is gitignored. It never leaves your machine unless you explicitly share it.

**Q: Who can see the audit log?**

Only engineers with access to the consuming repo's local filesystem. The log is gitignored and never committed. In a security incident, you may be asked to share the relevant session entries with the security escalation contact.

**Q: What happens if a secret is accidentally put in a command output?**

Stop the session immediately. Follow the escalation procedure in [GOVERNANCE.md](GOVERNANCE.md) §4:
1. Stop the session
2. Rotate the exposed secret
3. Notify preetham.nd@lifetrenz.com

**Q: Can I use `auto=true` for Flyway migrations?**

No. Flyway migrations are HIGH/CRITICAL risk and always require explicit human approval regardless of `auto=true`. The `ask: Edit(**/db/migration/**)` setting in `.claude/settings.json` enforces this.

---

## Upgrades

**Q: How do I upgrade the platform?**

```powershell
# 1. Pull the latest platform repo
git -C <platform-repo> pull

# 2. Re-run global install
pwsh install/install-claude.ps1

# 3. Re-run per-repo install for each consuming repo
pwsh install/install-claude.ps1 -RepoPath C:\src\your-service
```

See [UPGRADE-GUIDE.md](UPGRADE-GUIDE.md) for the full procedure.

**Q: Will the upgrade overwrite my module boundaries (`.claude/CLAUDE.md`)?**

No. If `.claude/CLAUDE.md` already exists in the repo, the per-repo installer leaves it unchanged. You will see:
```
! .claude/CLAUDE.md exists -- left unchanged (edit module boundaries manually)
```

**Q: Will the upgrade overwrite `.github/ai-platform/REPO.md`?**

No. The Copilot installer checks if `REPO.md` already exists and skips it if it does.

**Q: How do I know if my install is up to date?**

Check `.claude/.platform-version` (Claude Code) or `.github/ai-platform/.platform-version` (Copilot). Compare with the current `VERSION` file in the platform repo.

---

## Governance

**Q: How do I add a new command?**

Follow the 7-step process in [GOVERNANCE.md](GOVERNANCE.md) §1:
1. Propose via Redmine ticket + approval
2. Create `shared/commands/<slug>.md`
3. Register in `registry.yml` with `status: planned`
4. Generate adapter shells
5. Validate CI passes
6. Activate (`status: active`)
7. Update CHANGELOG + board

**Q: Can I modify the contract kernel?**

Yes, but the hash in `shared/contract.md.sha256` must be recomputed after every kernel change. See [GOVERNANCE.md](GOVERNANCE.md) §1. The kernel is the section between `<!-- enterprise-ai-platform:kernel:start/end -->` markers.

**Q: What is the "company profile seam"?**

`shared/company-profile.md` is the designated boundary between the generic platform core (commands, standards, rules) and company-specific configuration (module boundaries, default MCP servers, banned patterns). The platform core never references company internals. This makes the platform portable — a different company would replace `company-profile.md` with their own profile.
