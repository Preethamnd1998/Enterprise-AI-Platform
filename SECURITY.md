# Security Policy — Enterprise AI Platform

**Version:** v4.3.0

---

## Reporting a Security Issue

**Email:** preetham.nd@lifetrenz.com (Platform Engineer / Security Lead)

**Do not** open a public GitLab issue for security vulnerabilities.

**Include in your report:**
- Session ID and timestamp
- Command run
- Transcript path (`.claude/audit/log.jsonl` for the session)
- Brief description of what happened

**Escalate immediately for:**
- A literal secret (API key, PAT, password) found in a committed file
- An AI session that bypassed or appeared to bypass the MCP allowlist
- Contract hash mismatch (`contract_hash_status: mismatch`) that is unexplained
- An AI-assisted change that modified authentication or authorization logic without approval
- Any output that appears to exfiltrate or log PII

See [GOVERNANCE.md](docs/GOVERNANCE.md) §4 for the full escalation procedure.

---

## Security Model

The platform enforces security at multiple layers:

| Layer | Mechanism | What it prevents |
|---|---|---|
| 0 | Contract kernel in `~/.claude/CLAUDE.md` | Behavioral rules injected every session |
| 1 | PreToolUse hook (`hash-check.js`) | Contract tamper detection |
| 2 | MCP allowlist (`settings.json`) | Write tools blocked at tool-call level |
| 3 | Bash deny rules (`settings.json`) | `git push`, `git commit`, `rm -rf` blocked |
| 4 | PostToolUse/Stop hook (`audit.js`) | Session logged for post-hoc review |
| 5 | CI drift gate | Detects contract drift in MRs |
| 6 | CI `no-dup-shared` | Ensures canonical asset location |
| 7 | CI `contract-hash-verify` | Prevents contract hash drift |

For the full threat model and mitigations, see [docs/security.md](docs/security.md).

---

## Secret Management

- **Never commit secrets** — all MCP credentials use `${env:}` injection
- `.mcp.json` is gitignored — see `docs/secrets.md`
- `.env` files are gitignored — secrets loaded from environment variables only
- The contract explicitly prohibits transmitting credentials: placeholders `<API_KEY>`, `<JWT_TOKEN>` must be used

---

## Supported Versions

Security fixes are applied to the current version only. Upgrade to v4.3.0 to receive all security patches.

| Version | Supported |
|---|---|
| v4.3.x | ✅ |
| v4.2.x and below | ❌ No longer receiving security patches |

---

## Known Security Limitations

| Limitation | Mitigation |
|---|---|
| Copilot / OpenCode have no hook API | Use Claude Code for security-sensitive tasks |
| Model-level prompt injection is possible | Contract kernel helps but cannot fully prevent |
| Audit log is not tamper-evident | Treat as best-effort audit; investigate on suspicion |

See [docs/security.md](docs/security.md) §3 (Non-Mitigated Threats) for details.
