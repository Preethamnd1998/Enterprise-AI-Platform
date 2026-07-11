# Enterprise AI Platform

**Version:** v4.3.0 | **Status:** Production | **Platforms:** Claude Code · GitHub Copilot · OpenCode · Antigravity

A portable, multi-LLM AI engineering assistant platform for enterprise development teams. One shared configuration. Five supported platforms. Seven commands. Consistent behavior everywhere.

---

## What It Does

The Enterprise AI Platform enforces a single execution contract across all AI coding assistants used in your organisation. Every engineer, every repo, every platform follows the same rules:

- **Read-only by default** — AI cannot push code, merge MRs, or write to databases
- **Approval gate** — AI presents its analysis; you approve before any change is made
- **Audit trail** — every session logged to `.claude/audit/log.jsonl`
- **Contract integrity** — tamper-detection hash-check before every tool use
- **Lazy standards** — only the standards relevant to the current task are loaded

---

## Supported Platforms

| Platform | Status | Hooks | Audit | MCP Allowlist | Commands |
|---|---|---|---|---|---|
| **Claude Code** | ✅ Full | ✅ | ✅ | ✅ | All 7 |
| **GitHub Copilot** | ✅ Partial | ❌ | ❌ | Read-only PAT | 7 (via chatmodes) |
| **OpenCode** | ✅ Partial | ❌ | ❌ | Limited | 7 (via AGENTS.md) |
| **Antigravity** | ✅ Partial | ❌ | ❌ | ⚠️ Prompt-only (no allowlist) | 7 (via AGENTS.md + workflows) |
| Cursor | 🔵 Stub | — | — | — | — |
| Windsurf | 🔵 Stub | — | — | — | — |
| Continue | 🔵 Stub | — | — | — | — |
| Cline | 🔵 Stub | — | — | — | — |
| Roo Code | 🔵 Stub | — | — | — | — |
| VS Code Agent | 🔵 Stub | — | — | — | — |

> For sensitive tasks (auth, PII, migrations), use **Claude Code** — it is the only platform with a full security posture. See [HITL Matrix](docs/hitl-matrix.md).
>
> **Antigravity MCP note (confirmed 2026-07):** Antigravity has no declarative read-only MCP allowlist like Claude Code's `settings.json` deny-list. It gates MCP tool calls with a per-call approval prompt, plus an optional per-server `alwaysAllow` bypass list — human-supervised, not policy-enforced. See `adapters/antigravity/capability-map.yml` (cap-10/cap-11) for sources.

---

## Commands

| Command | Purpose | Platforms |
|---|---|---|
| `/bug-fix` | Investigate and fix a bug from a Redmine ID or MR | CC, Copilot |
| `/migration` | Migrate code between branches or versions | CC, Copilot |
| `/new-development` | Implement a new feature from a Redmine story | CC, Copilot |
| `/data-correction` | Analyse and correct database data issues | CC, Copilot |
| `/ui-design-update` | Apply a UI design change | CC, Copilot |
| `/test` | Generate tests and report coverage gaps | CC, Copilot, OC |
| `/prompt-audit` | Score prompt quality and suggest improvements | CC, Copilot, OC |

All commands accept `key=value` arguments. Common keys: `redmine=<id>`, `mr=!<n>`, `commit=<sha>`, `branch=<b>`, `auto=true`.

---

## Quick Start

**60-second path for Claude Code:**

```powershell
# 1. Clone the platform repo
git clone https://gitlab.example.com/lifetrenz/enterprise-ai-platform.git
cd enterprise-ai-platform

# 2. Install globally (once per machine)
pwsh install/install-claude.ps1

# 3. Configure a consuming repo
pwsh install/install-claude.ps1 -RepoPath C:\src\my-service

# 4. Configure MCP (one-time setup)
Copy-Item shared/mcp/.mcp.json.template C:\src\my-service\.mcp.json
# Edit .mcp.json — set your GITLAB_PAT and server paths

# 5. Open a new Claude Code session in the repo and run a command
/bug-fix redmine=12345
```

See [docs/QUICK-START.md](docs/QUICK-START.md) for a full walkthrough.

---

## Architecture

```
D:\enterprise-ai-platform\                 # git repo root (flattened — no nested subdirectory)
├── README.md · CONTRIBUTING.md · PROJECT-STRUCTURE.md · CHANGELOG.md · SECURITY.md · VERSION
├── docs/                      # All other reference guides (INSTALL-*.md, GOVERNANCE.md, etc.)
├── shared/                    # Single source of truth for all shared assets
│   ├── contract.md            # Execution contract (kernel injected to ~/.claude/CLAUDE.md)
│   ├── commands/              # 7 command definitions (shared by all platforms)
│   ├── standards/             # Coding standards (backend/, frontend/, mobile/, migration/)
│   ├── rules/                 # Governance rules (coding-style, testing, security, code-review)
│   ├── prompts/               # CRISP framework, prompt quality scoring
│   ├── templates/             # Per-repo AI context templates (AI_PROJECT.md etc.)
│   ├── mcp/                   # MCP allowlist + .mcp.json template
│   ├── schemas/               # audit-schema.json (v1.1)
│   └── company-profile.md     # Company-specific customisation seam (F10)
│
├── adapters/                  # Platform-specific glue (thin — no business logic)
│   ├── claude/                # Claude Code: config, hooks, installers
│   ├── copilot/               # GitHub Copilot: chatmodes, prompts, instructions
│   ├── opencode/              # OpenCode: AGENTS.md, command shells
│   ├── antigravity/           # Antigravity: AGENTS.md, .agents/workflows shells
│   ├── cursor/                # [STUB] Future adapter
│   ├── windsurf/              # [STUB] Future adapter
│   ├── continue/              # [STUB] Future adapter
│   ├── cline/                 # [STUB] Future adapter
│   ├── roo-code/              # [STUB] Future adapter
│   └── vscode-agent/          # [STUB] Future adapter
│
├── install/                   # Single front door -- installer scripts for all 4 platforms
│   ├── install-claude.ps1     # Global + per-repo CC install (delegates to adapters/claude/install.ps1)
│   ├── install-copilot.ps1    # Copilot per-repo install (delegates to adapters/copilot/install.ps1)
│   ├── install-opencode.ps1   # OpenCode per-repo install (delegates to adapters/opencode/install.ps1)
│   ├── install-antigravity.ps1 # Antigravity per-repo install (delegates to adapters/antigravity/install.ps1)
│   ├── install-both.ps1       # CC + Copilot combined
│   └── update-platform.ps1    # Pull latest source + refresh installed adapter(s)
│
├── tools/                     # Platform operations tooling
│   ├── rollout-fleet.ps1      # Fleet rollout to all consuming repos
│   ├── repos.txt              # Fleet target repo list
│   ├── check-drift.ps1        # Detect installed-vs-source drift
│   └── generate-copilot.ps1   # Generate Copilot adapter shells
│
└── docs/                      # Documentation
```

> **Key principle:** `shared/` contains every reusable asset exactly once. Adapters contain only glue. This is enforced by CI (`no-dup-shared` job).

---

## Installation Guides

| Platform | Guide |
|---|---|
| Claude Code | [docs/INSTALL-CLAUDE.md](docs/INSTALL-CLAUDE.md) |
| GitHub Copilot | [docs/INSTALL-COPILOT.md](docs/INSTALL-COPILOT.md) |
| OpenCode | [docs/INSTALL-OPENCODE.md](docs/INSTALL-OPENCODE.md) |
| MCP Setup | [docs/mcp-setup.md](docs/mcp-setup.md) |
| Fleet Rollout | [docs/fleet-rollout.md](docs/fleet-rollout.md) |

---

## Documentation Index

| Document | Purpose |
|---|---|
| [docs/QUICK-START.md](docs/QUICK-START.md) | Install and run your first command in 15 minutes |
| [docs/INSTALL-CLAUDE.md](docs/INSTALL-CLAUDE.md) | Full Claude Code installation guide |
| [docs/INSTALL-COPILOT.md](docs/INSTALL-COPILOT.md) | Full Copilot installation guide |
| [docs/INSTALL-OPENCODE.md](docs/INSTALL-OPENCODE.md) | Full OpenCode installation guide |
| [docs/PLATFORM-CAPABILITY-MATRIX.md](docs/PLATFORM-CAPABILITY-MATRIX.md) | Cross-platform feature comparison |
| [PROJECT-STRUCTURE.md](PROJECT-STRUCTURE.md) | Repository structure explanation |
| [docs/UPGRADE-GUIDE.md](docs/UPGRADE-GUIDE.md) | How to upgrade to a new version |
| [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) | Common problems and fixes |
| [docs/FAQ.md](docs/FAQ.md) | Frequently asked questions |
| [docs/GOVERNANCE.md](docs/GOVERNANCE.md) | How to change commands, approval gate, security |
| [CHANGELOG.md](CHANGELOG.md) | Version history |
| [docs/mcp-setup.md](docs/mcp-setup.md) | MCP server credentials and configuration |
| [docs/security.md](docs/security.md) | Security model and threat mitigations |
| [docs/hitl-matrix.md](docs/hitl-matrix.md) | When human approval is required |
| [docs/rollback.md](docs/rollback.md) | Rollback procedures for all components |
| [docs/fleet-rollout.md](docs/fleet-rollout.md) | Fleet rollout to consuming repos |
| [docs/prerequisites.md](docs/prerequisites.md) | Required tools and versions |
| [docs/audit-and-metrics.md](docs/audit-and-metrics.md) | Audit log structure and metrics |

---

## How the Contract Works

When a Claude Code session starts, the platform kernel is already injected into `~/.claude/CLAUDE.md`. The AI reads it before your first message. The kernel defines:

1. **No-scan rule** — AI reads only files in the change set, never the whole repo
2. **Depth-1 expansion** — only direct symbol references are expanded
3. **Lazy standards** — standards files loaded only for languages in the change set
4. **Approval gate** — Phase 1 = analysis only; implementation requires your approval
5. **MCP read-only** — write-capable tools are denied at the settings level

The `shared/contract.md.sha256` file stores the expected kernel hash. The `hash-check.js` hook verifies it before every tool use.

---

## Security

- MCP is restricted to **28 read-only tools** across 4 servers (allowlist pattern — fails closed)
- Secrets use `${env:}` injection in `.mcp.json` — no literals ever committed
- Contract tamper detection: hash mismatch → warn + re-inject
- Session audit: every tool use logged to `.claude/audit/log.jsonl`
- Security contact: preetham.nd@lifetrenz.com

See [docs/security.md](docs/security.md) and [GOVERNANCE.md](docs/GOVERNANCE.md) §4.

---

## Usage Hierarchy

Use platforms in this order of preference:

1. **Claude Code** — default for all tasks (full capability)
2. **GitHub Copilot** — when CC unavailable or already in VS Code
3. **OpenCode** — terminal-only or when CC+Copilot unavailable

Do not use Copilot or OpenCode for security-critical tasks (auth, PII, Flyway on PII tables).

---

## Contributing

See [GOVERNANCE.md](docs/GOVERNANCE.md) §1 for the 7-step process to add or change a command.

The architecture is stable. All commands are registered in `shared/commands/registry.yml`.
Do not add commands, rules, or standards without following the governance process.

---

## Versioning

Semantic Versioning (SemVer). Current: **v4.3.0**.

| Phase | Version | What changed |
|---|---|---|
| Phase A | v3.1 | Repo restructure, contract, allowlist, hash-check |
| Phase B | v3.2 | MCP env injection, GitLab+DB MCP, Copilot adapter |
| Phase C | v4.0 | /test command, subagents, coverage gate, audit schema |
| Phase D | v4.1 | /ai/ templates, rules, /prompt-audit, pre-flight block |
| Phase E | v4.2 | GOVERNANCE.md, telemetry, HITL matrix, pause-turn cap |
| Phase F | v4.3 | Lazy kernel refactor, company-profile seam, fleet rollout, adapter stubs |

---

## Support

- Security incidents: preetham.nd@lifetrenz.com (see [GOVERNANCE.md](docs/GOVERNANCE.md) §4)
- Platform issues: file a Redmine ticket or open a GitLab MR against this repo
- Documentation gaps: open an MR with the fix

---

## License

Internal — Lifetrenz Engineering. All rights reserved.
