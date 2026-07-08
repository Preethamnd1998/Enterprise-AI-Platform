# Contributing to the Enterprise AI Platform

**Version:** v4.3.0 | **Authority:** [GOVERNANCE.md](docs/GOVERNANCE.md)

The architecture is frozen. This document covers how to contribute within the established structure.

---

## What You Can Contribute

| Contribution type | Allowed | Process |
|---|---|---|
| Bug fix in a command specification | ✅ | Standard MR process |
| Bug fix in an installer script | ✅ | Standard MR process |
| Bug fix in a hook script | ✅ | Standard MR process |
| New command | ✅ | 7-step governance process (see below) |
| New standard or rule | ✅ | Propose via Redmine + Platform Architect approval |
| Documentation improvement | ✅ | Standard MR process |
| New platform adapter | ✅ | Evidence gate must be met; stub must exist |
| Architecture change | ❌ | Architecture is frozen |
| Adding business logic to adapters | ❌ | Violates no-dup-shared rule |
| Changing the contract kernel without recomputing hash | ❌ | CI will fail |

---

## Adding a New Command

Follow the 7-step process from [GOVERNANCE.md](docs/GOVERNANCE.md) §1:

1. **Propose** — Redmine ticket describing purpose, invocation pattern, supported platforms
2. **Implement** — `shared/commands/<slug>.md` following `bug-fix.md` structure
3. **Register** — `shared/commands/registry.yml` with `status: planned`
4. **Generate shells** — `tools/generate-copilot.ps1`; manual OC shell at `adapters/opencode/commands/<slug>.md` (≤20 lines)
5. **Validate** — `validate-registry` CI job must pass
6. **Activate** — change status from `planned` to `active`
7. **Changelog + Board** — update both

---

## Changing an Existing Command

- Change `shared/commands/<slug>.md` only — never adapter shells
- If algorithm or output contract changes: bump the version comment and update `registry.yml`
- If the contract **kernel** changes: recompute `shared/contract.md.sha256`
- Run CI and ensure `contract-hash-verify` passes before merging

---

## Adding Standards or Rules

- New standards file: `shared/standards/<layer>/<topic>.md`
- Register in the lazy-load trigger conditions in `shared/contract.md` §5
- Test: open a new CC session on a relevant file and verify the standard is loaded

New rules file: `shared/rules/<topic>.md`
- Follows the existing rule format (rule ID + description)
- Register in the lazy-load trigger conditions in `shared/contract.md` §5

---

## Documentation Contributions

All documentation is in `docs/` and at the root level (`README.md`, `CONTRIBUTING.md`, `PROJECT-STRUCTURE.md`, `CHANGELOG.md`, `SECURITY.md`) — everything else, including `QUICK-START.md`, is in `docs/`.

- Fix factual errors: direct MR, no ticket needed
- Add new document: check it is not already covered by an existing doc
- Never duplicate content — reference the canonical source

---

## Merge Request Process

1. Create a branch from `main`: `feature/your-change` or `fix/bug-description`
2. Make your changes
3. Run CI locally if possible: `pwsh ci/validate.sh` (or check CI passes in GitLab)
4. Open an MR with a description explaining **why** (not just what)
5. Tag the MR with the relevant Redmine ticket
6. Wait for review by the Platform Architect

---

## CI Requirements

Your MR must pass:

| CI Job | What it checks |
|---|---|
| `validate-registry` | `registry.yml` is consistent with command files |
| `contract-hash-verify` | `shared/contract.md.sha256` matches the kernel |
| `no-dup-shared` | No shared content duplicated into adapters |
| `no-business-logic-in-adapters` | No business logic in adapter directories |

---

## Code Style

- PowerShell: use `pwsh` (7+) syntax; dot-source `_common.ps1`; use `Write-Step`, `Write-Ok`, `Write-Warn2`
- JavaScript (hooks): Node.js 18+; no dependencies; always exit 0 from hooks; write to stdout only
- Markdown: standard headings; tables for structured data; code blocks with language hint
- No emojis in documentation unless the file already uses them

---

## Contact

- Platform Architect / Security Lead: preetham.nd@lifetrenz.com
- Security incidents: see [GOVERNANCE.md](docs/GOVERNANCE.md) §4 — do not wait
