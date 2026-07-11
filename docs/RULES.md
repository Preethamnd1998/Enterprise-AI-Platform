# Platform Rules Reference — Enterprise AI Platform

**Version:** v4.3.0 | **Source directory:** `shared/rules/`

Rules are loaded **lazily** — only when the relevant situation arises. They are never bulk-loaded at session start. Each rule file is read once per session; re-reads are prohibited.

The contract loads rules by situation (§5 lazy loading):
- Code review in progress → `shared/rules/code-review.md`
- Security-adjacent code → `shared/rules/security.md`
- Test generation or audit → `shared/rules/testing.md`
- Style evaluation → `shared/rules/coding-style.md`

---

## Code Review Rules (`shared/rules/code-review.md`)

| Rule | Summary |
|---|---|
| **CR-01** Completeness | Confirm the full change set is in scope before reviewing. Partial review creates false confidence. |
| **CR-02** Layer coverage | Verify all applicable layers (Controller · Service · Repository · DTO · Mapper · Entity · Enum · Constants · Validator · SQL · Flyway · Angular · UI Service · Model · Route · Flutter Widget · State Management · Mobile Route · Permission · Translation · Audit · Tests). Missing layer = Gate A failure. |
| **CR-03** No silent scope creep | If review reveals scope beyond the original change set, STOP. Document and request approval before expanding. |
| **CR-04** Regression evidence | Gate B claims must cite specific existing behavior being preserved. "No regression" is a checklist result, not a conclusion. |
| **CR-05** Security red flags | Flag for human review: authentication/authorization, session/token handling, data access controls, Flyway on sensitive tables, external-facing API signatures. |
| **CR-06** Test review | Verify each test actually tests the changed code path, would fail if implementation is wrong, and does not use production data without isolation. |

---

## Security Rules (`shared/rules/security.md`)

| Rule | Summary |
|---|---|
| **SEC-01** No secret literals | Never output, suggest, or commit literal secrets (passwords, API keys, tokens). Always use `<PLACEHOLDER>` or `${env:VARNAME}`. |
| **SEC-02** No PII in logs | Never include patient identifiers, personal data, or session tokens in log output. |
| **SEC-03** Auth changes require approval | Any change to authentication, authorization, session handling, or permission checks requires explicit human approval regardless of `auto=true`. |
| **SEC-04** Allowlist verification | Before suggesting MCP tool use, verify the tool is in the `allow[]` list in `settings.json`. Never suggest a denied tool. |
| **SEC-05** Hash mismatch = stop | If `contract_hash_status: mismatch` is detected, stop the session immediately and report. |

---

## Testing Rules (`shared/rules/testing.md`)

| Rule | Summary |
|---|---|
| **TST-01** Test coverage | Every changed method must have a corresponding test. Missing tests = Gate A failure when `/test` is run. |
| **TST-02** Test validity | Tests must be meaningful — they must fail if the implementation is wrong. Trivially-passing assertions are invalid. |
| **TST-03** No production data | Tests must not use production database connections, production tokens, or live external APIs without explicit isolation. |
| **TST-04** Existing tests preserved | Do not weaken, skip, or delete existing tests to make a change pass. Weakening an existing test = Gate B failure. |
| **TST-05** Test naming | Test names must describe the scenario: `methodName_givenCondition_expectedBehavior`. |

---

## Coding Style Rules (`shared/rules/coding-style.md`)

| Rule | Summary |
|---|---|
| **STY-01** Layer separation | Business logic belongs in the Service layer. Controllers handle HTTP. Repositories handle data access. No cross-layer logic leaks. |
| **STY-02** No magic numbers | Named constants for all threshold values, status codes, and configuration. |
| **STY-03** Exception handling | Use `ApplicationException` for business exceptions (checked). Never swallow exceptions silently. |
| **STY-04** DAO throws | DAO methods declare checked exceptions; callers handle or propagate. |
| **STY-05** No adapter logic | Adapter directories must not contain business logic, commands, standards, or prompt libraries. Logic lives in `shared/`. |

---

## Contract-Level Rules

The following rules are enforced by the contract kernel (`shared/contract.md`) and cannot be changed without recomputing the SHA-256 hash:

| Rule | Contract section | Summary |
|---|---|---|
| Prime directive 1 | §0 | Analyze only what the task requires. Never bulk-load knowledge. |
| Prime directive 2 | §0 | Deterministic discovery — resolve from input, never scan. |
| Prime directive 3 | §0 | Hunks not files; signatures not bodies for unchanged neighbors. |
| Prime directive 4 | §0 | Depth-1 dependency expansion by default. |
| Prime directive 5 | §0 | Prove completeness AND regression before done. |
| No scan rule | §3 | `get_repository_tree` broadly, global grep, listing all modules — forbidden. |
| Depth-1 only | §4 | Only expand to symbols the change directly references. |
| Lazy standards | §5 | Standards loaded only when the relevant language/layer is in the change set. |
| Token budgets | §10 | Hard per-task limits; stop and report when reached. |
| Stop conditions | §11 | Stop when objective met + both gates pass. |
| Pause turn cap | §17 (G16) | Stop at ≥10 file changes or layer expansion within a single turn. |

---

## Rule Priorities

When rules conflict (rare):
1. **Security rules** (SEC-*) override all others
2. **Contract-level rules** override standalone rule files
3. **Code review rules** (CR-*) apply during Gate A evaluation
4. **Testing rules** (TST-*) apply during `/test` command and Gate A test coverage check
5. **Coding style rules** (STY-*) apply during implementation and review

---

## References

- `shared/rules/code-review.md` — full code review rules
- `shared/rules/security.md` — full security rules
- `shared/rules/testing.md` — full testing rules
- `shared/rules/coding-style.md` — full coding style rules
- `shared/contract.md` — contract kernel (authoritative execution rules)
- `GOVERNANCE.md` — governance and approval authority
