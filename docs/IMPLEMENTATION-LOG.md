# Implementation Log — Enterprise AI Platform

**Type:** Engineering decision record  
**Authority:** `MASTER-PROJECT-BOARD.md` (operational) | `CHANGELOG.md` (version history)

This log records the key engineering decisions, defects discovered during development, and sprint outcomes. Use this to understand *why* the platform is structured the way it is.

---

## Architecture Decisions

### AD-01 — Allowlist over denylist for MCP (Phase B, v3.1)

**Decision:** Use `deny: ["mcp__*"]` + explicit `allow[]` rather than a denylist.

**Rationale:** v3.0 used a denylist. Any new tool added to an MCP server was automatically allowed until someone added it to the deny list. This was discovered as defect F4 during Phase B security audit. An allowlist inverts the failure mode: new tools are blocked by default, and only explicitly approved tools are allowed.

**Impact:** 28 tools explicitly approved across 4 servers. All other MCP tools denied at tool-call level.

**Reference:** `shared/mcp/tool-allowlists.md`, `docs/sp-01-result.md`

---

### AD-02 — Custom gitlab-reader vs official GitLab MCP (Phase B, v3.1)

**Decision:** Use a custom internal `gitlab-reader` server rather than the official GitLab MCP.

**Rationale:** The official GitLab MCP includes write tools. The custom server is read-only by construction — no write tools exist. This provides defense-in-depth: even if the allowlist were misconfigured, the server itself cannot write.

**Impact:** `GITLAB_MCP_PATH` environment variable required; `npm install -g @lifetrenz/gitlab-mcp-reader` step in installation.

**Reference:** `docs/sp-vc3-result.md`, `docs/mcp-setup.md`

---

### AD-03 — Shared + adapters architecture (Phase A, v3.0)

**Decision:** One canonical copy of every asset in `shared/`; adapters contain only glue.

**Rationale:** Before this architecture, each platform (Claude Code, Copilot) maintained its own copy of command specifications and standards. Updates required synchronizing multiple copies. The shared + adapters pattern means a change to `shared/commands/bug-fix.md` automatically applies to all platforms.

**Enforcement:** CI `no-dup-shared` job detects shared content duplicated into adapter directories.

**Reference:** `PROJECT-STRUCTURE.md`, `docs/file-migration-map.md`

---

### AD-04 — Contract kernel with SHA-256 verification (Phase B, v3.1)

**Decision:** The execution contract has a pinned SHA-256 hash (`shared/contract.md.sha256`). The `hash-check.js` hook verifies this before every tool call.

**Rationale:** The contract kernel governs AI behavior. If it could be modified silently (by an MR, a rebased commit, or model-level prompt injection), the AI would operate under different rules without anyone knowing. The hash-check makes unauthorized changes immediately visible in the audit log.

**Impact:** Any contract kernel change requires recomputing the hash via `tools/compute-contract-hash.ps1`. CI `contract-hash-verify` enforces this in MRs.

**Reference:** `docs/hash-check-behavior.md`, `shared/contract.md.sha256`

---

### AD-05 — Lazy standards loading (Phase A, v3.0; refined Phase D, v4.0)

**Decision:** Standards are never loaded at session start. They are loaded only when the relevant language and layer are detected in the change set.

**Rationale:** Loading all standards at session start adds ~15k tokens of context before any work is done. Most tasks touch one or two layers. Lazy loading keeps the working context focused on the actual task.

**Implementation:** Contract §5 maps language/layer combinations to specific standard file paths. The AI reads only the matching files, once per session.

**Reference:** `shared/contract.md §5`

---

### AD-06 — Registry as single source of truth for commands (Phase D, v4.1)

**Decision:** All commands must be registered in `shared/commands/registry.yml`. Commands that exist as adapter files but are not in the registry are "phantom commands" and are CI-blocked.

**Rationale:** In v3.0/v3.1, Copilot had two chatmodes (`/planning`, `/ui-redesign`) that were not in the shared command set. They behaved differently across platforms and had no governance. Defects D1/D2.

**Impact:** `/planning` and `/ui-redesign` were removed. The `validate-registry` CI job prevents this from recurring.

**Reference:** `shared/commands/registry.yml`, `GOVERNANCE.md §1`

---

### AD-07 — Company profile seam (Phase F, v4.3)

**Decision:** Lifetrenz-specific configuration lives in `shared/company-profile.md`, not in the contract kernel.

**Rationale:** The contract kernel is generic — it should work for any enterprise. Company-specific details (module structure, security contacts, banned patterns, MCP server names) were embedded in the contract and in various adapter files. The seam separates generic platform behavior from company configuration, making the platform portable.

**Impact:** Installers copy `company-profile.md` on first install and never overwrite on upgrade. Companies can customize their profile without modifying the contract.

**Reference:** `shared/company-profile.md`, `shared/contract.md §5`

---

## Defects Discovered and Fixed

| ID | Phase found | Description | Fix |
|---|---|---|---|
| F4 | B (v3.1) | MCP denylist fails open — new tools auto-allowed | Replaced with allowlist; 28 tools explicitly approved |
| D1 | D (v4.1) | `/planning` phantom command — Copilot chatmode, no shared impl | Removed; replaced by `/new-development` |
| D2 | D (v4.1) | `/ui-redesign` phantom command — same issue | Removed; replaced by `/ui-design-update` |
| BUG-D2 | F (v4.3) | Secrets not auto-provisioned for new repos | Open — assigned to Platform Architect |

---

## Sprint Outcomes

### Sprint 1 (Phase A) — Foundation

Delivered: contract kernel, Claude Code adapter (config + hooks + install scripts), 5 commands, shared standards structure, initial coding standards (7 backend layers + 6 frontend topics + 3 migration standards).

### Sprint 2 (Phase B) — Security Hardening

Delivered: MCP allowlist (F4 fix), SHA-256 hash-check hook, audit logging (schema v1.1), `${env:}` injection for MCP credentials, CI contract-hash-verify job. Discovery: custom gitlab-reader decision (V-C3).

### Sprint 3 (Phase C) — Copilot Adapter

Delivered: `adapters/copilot/` (chatmodes + prompt files + `copilot-instructions.md`), `tools/generate-copilot.ps1`, CI `no-dup-shared` job, `/test` command, `docs/copilot-measurement.md`.

### Sprint 4 (Phase D) — Governance

Delivered: `shared/commands/registry.yml`, phantom command removal (D1/D2), `/prompt-audit` command, CRISP framework, HITL matrix, pre-flight block, `GOVERNANCE.md`, CI `validate-registry` and `no-phantom-commands` jobs.

### Sprint 5 (Phase E) — OpenCode Adapter + Lazy Refactor

Delivered: `adapters/opencode/` (AGENTS.md + command shells + install scripts), pause-turn cap G16 (contract §17), lazy §15/§16 preparation.

### Sprint 6 (Phase F) — Rollout & Polish

Delivered: company profile seam F10 (`shared/company-profile.md`), lazy §15/§16 externalization, `tools/rollout-fleet.ps1` with `-DryRun` and idempotency, `tools/repos.txt`, `docs/fleet-rollout.md`, 6 future adapter stubs (cursor/windsurf/continue/cline/roo-code/vscode-agent), complete documentation pass (17 new root-level docs, 5 updated docs).

---

## Known Limitations

| Limitation | Impact | Mitigation |
|---|---|---|
| No write MCP tools | AI cannot update Redmine, push code, or close MRs | By design — read-only policy |
| Copilot/OpenCode have no hook API | No hash-check or audit logging on these platforms | Use Claude Code for security-sensitive tasks |
| `adapters/claude/capability-map.yml` missing | Referenced by HITL matrix but does not exist | Pre-existing gap; low urgency |
| Audit log not tamper-evident | Best-effort audit; not cryptographically signed | Investigate on suspicion; treat as advisory |
| Secrets not auto-provisioned (BUG-D2) | New engineers must manually set env vars | Document in QUICK-START; assign owner |

---

## References

- `CHANGELOG.md` — full version history
- `MASTER-PROJECT-BOARD.md` — sprint board and phase DoD records
- `docs/phase-dod.md` — definition of done per phase
- `docs/sp-*.md` — sprint result documents
- `ROADMAP.md` — what is next
