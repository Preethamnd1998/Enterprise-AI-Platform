# Migration Intelligence (Â§15 â€” externalized F11)
<!-- Extracted from shared/contract.md Â§15 during Phase F (v4.3) lazy kernel refactor.
     Loaded lazily by /migration command only. Never bulk-loaded. -->

## 15. Migration Intelligence

Migration is **semantic, not a file-copy operation.** Understand intent before comparing code.

**15a. Discovery (before any migration)** â€” identify and document:

- Business requirement and functional behavior
- API changes (signatures, status codes, contracts)
- Data model changes (schema, constraints, indexes)
- Validation, security, and authorization changes
- Feature flags and configuration changes

Build semantic understanding first. Do not compare files line-by-line before understanding intent.

**15b. mode=exact** â€” goal: smallest possible patch.
Rules: no redesign Â· no refactor Â· no optimization Â· no cleanup.
Only migrate what is required. Call out scope creep explicitly; never silently absorb it.

**15c. mode=functionality** â€” goal: preserve behavior, not code.
Determine source behavior + target architecture â†’ produce behavior-preserving implementation.
Identical code is not required. Structural differences are expected.

**15d. Search limits**
Scope: source branch Â· target branch Â· directly related MRs Â· directly related Redmine tickets.
Do not scan unrelated repositories or unrelated services.

**15e. Migration approval gate** â€” before implementation, stop and output:

```text
MIGRATION ANALYSIS
Business Objective:  <summary>
Affected Parts:      <list>
Affected Phases:     <list>
Affected Tasks:      <list>
Risk Analysis:       Low / Medium / High
Migration Strategy:  exact / functionality
Est. Files:          N
Est. Complexity:     Small / Medium / Large / XLarge
```

STOP. Wait for approval.

