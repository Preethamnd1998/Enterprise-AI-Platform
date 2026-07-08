# Enterprise AI Platform — Governance
**Version:** 4.3 | **Status:** ACTIVE | **Authority:** Platform Architect

This document covers four governance topics for the Enterprise AI Platform.
For operational project management, the ONLY authority is `MASTER-PROJECT-BOARD.md`.
For execution rules, the ONLY authority is `shared/contract.md`.

---

## 1. How to Add or Change a Command

All platform commands are registered in `shared/commands/registry.yml` — the single source
of truth (kills defect D1). No command exists that is not in the registry.

### Adding a new command
1. **Propose:** Open a Redmine ticket describing the command's purpose, invocation pattern,
   and which platforms will support it. Get approval from the Platform Architect.
2. **Implement:** Create `shared/commands/<slug>.md` following the existing command template
   (see `shared/commands/bug-fix.md` as reference). The command must include:
   - Purpose, invocation pattern, algorithm (numbered phases), output format, and rules.
3. **Register:** Add an entry to `shared/commands/registry.yml` with `status: planned`.
4. **Generate shells:** Run `tools/generate-copilot.ps1` to create Copilot shells.
   Manually create OC command shell at `adapters/opencode/commands/<slug>.md` (≤20 lines).
5. **Validate:** CI `validate-registry` job must pass before merging.
6. **Activate:** Change `status: planned` → `status: active` only after the command is
   fully implemented and shells exist for all `supported_platforms`.
7. **Changelog + Board:** Add entry to `CHANGELOG.md` and update `MASTER-PROJECT-BOARD.md`.

### Changing an existing command
1. Change only `shared/commands/<slug>.md` — never the adapter shells (they reference the
   shared file by path).
2. If the change affects the algorithm or output contract, bump the version comment inside
   the command file and update `registry.yml`.
3. If the change affects the contract kernel (any line between the
   `enterprise-ai-platform:kernel:start/end` markers in `shared/contract.md`), the hash in
   `shared/contract.md.sha256` MUST be recomputed via `tools/compute-contract-hash.ps1`.
4. Run CI and ensure `contract-hash-verify` passes before merging.

### Removing a command
Commands are never deleted — they are set to `status: deprecated` in `registry.yml`,
and the command file is kept for audit history. Adapter shells may be removed after a 30-day
deprecation window. Document the removal in `CHANGELOG.md`.

---

## 2. The Read-Only Rule

**The platform AI is read-only by default on all external systems.**

This is enforced at two levels:
- **MCP allowlist:** `adapters/claude/config/settings.json` `allow[]` array contains only
  read-capable tools. All `mcp__*` tools not in the allowlist are denied by the `deny: ["mcp__*"]`
  catch-all. See `shared/mcp/tool-allowlists.md` for the authoritative list.
- **Contract F5 rule:** The shared contract prohibits write-capable MCP operations and
  instructs the AI never to push, merge, or modify external systems through tools.

**What the AI can do:** read files, read GitLab MRs/issues/diffs, read Redmine tickets,
read Mongo/Postgres data via read-only MCP tools.

**What the AI must NOT do:**
- Push code to any branch
- Merge or close a merge request
- Create or update Redmine tickets
- Write to any database
- Run destructive shell commands (`rm -rf`, `git reset --hard`, etc.)

**Violations:** If an AI session produces output suggesting a prohibited action, do not
execute it. Report the incident to the security escalation contact (§4).

---

## 3. Approval Gate

Every platform command operates under a mandatory approval gate (contract §14).

**Default mode: APPROVAL REQUIRED.**

The AI must not make any file change, database change, configuration change, or execute
any generated script until the engineer explicitly approves after Phase 1 (Discovery &
Analysis).

**Approval phrases accepted:** `approve` · `yes` · `proceed` · `implement`

**Override:** Include `auto=true` in the command arguments to skip the gate and proceed
directly to execution. Use `auto=true` only when the scope is well-understood and low-risk.

**High-risk items that require approval even with `auto=true`:**
(These trigger the risk gate at contract §9 and cannot be auto-approved.)
- DB/Flyway changes
- Permission or role changes
- Authentication flow changes
- Billing, financial, or patient data changes
- Changes flagged as CRITICAL in `AI_SECURITY.md`

**Pause turn cap (G16):** During a single command turn, the AI must pause and check with the
engineer if cumulative actions exceed 10 file changes OR the task has expanded into a
different layer than originally scoped. See contract §17 (Phase E addition).

---

## 4. Security Escalation

**Security escalation contact:** preetham.nd@lifetrenz.com (Platform Engineer / Security Lead)

**Escalate immediately for:**
- A literal secret (API key, PAT, password) found in a committed file
- An AI session that bypassed or attempted to bypass the MCP allowlist
- Contract hash mismatch (`contract_hash_status: mismatch` in audit log) not resolved by
  automatic re-injection
- An AI-assisted change that modified authentication or authorization logic without approval
- Any output that appears to exfiltrate or log PII

**Escalation procedure:**
1. Stop the session immediately.
2. Rotate any exposed secret (GitLab PAT, DB password) at the provider.
3. Notify the escalation contact with: session ID, command run, transcript path, and a
   brief description of the incident.
4. Do NOT merge or push until the incident is reviewed.
5. Check `.claude/audit/log.jsonl` for the session's audit trail.

---

## References

- `shared/contract.md` — full execution contract (authoritative)
- `shared/mcp/tool-allowlists.md` — 28 allowed MCP tools
- `docs/hitl-matrix.md` — HITL decision matrix and usage hierarchy
- `docs/rollback.md` — rollback procedures for all platform components
- `docs/security.md` — injection defense, hash-check, MCP security design
- `MASTER-PROJECT-BOARD.md` — operational project management (authority document)
