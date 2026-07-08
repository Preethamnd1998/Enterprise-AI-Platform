# Hash-Check Hook Behavior Specification (V-B3)
**Task:** TK-047  
**Status:** Defined — ADR-16 finalized  
**Date:** 2026-07-07  

---

## Hook Identity
- **File:** `adapters/claude/hooks/hash-check.js`
- **Hook event:** `PreToolUse` (fires before every tool call in the session)
- **Session dedup:** `.ai/.session-verified` flag file — hash check runs ONCE per session

## Behavior Matrix

| Condition | Hash check | Action | Exit code |
|---|---|---|---|
| `.ai/.session-verified` exists | Skip | Do nothing | 0 |
| `.ai/.contract-hash` missing | Warn | Write flag, continue | 0 |
| `.claude/CLAUDE.md` missing | Warn | Write flag, continue | 0 |
| Kernel markers missing in CLAUDE.md | Warn (pre-v3.1 install) | Write flag, continue | 0 |
| Hash matches | Pass | Write flag, continue | 0 |
| Hash mismatch + `shared/contract.md` present | Warn + re-inject | Rewrite CLAUDE.md, write flag | 0 |
| Hash mismatch + `shared/contract.md` absent | Warn only | Write flag, continue | 0 |
| Any unexpected error | Warn | Write flag, continue | 0 |

**Key invariant:** Exit code is ALWAYS 0. The hook NEVER blocks execution. Per ADR-16.

## Why warn+continue and never block?

1. **False positives are unacceptable.** A legitimate engineer editing CLAUDE.md for repo-specific module boundaries should not have their session hard-blocked.
2. **The model reads the contract at session start** from `~/.claude/CLAUDE.md`. Even if the hash mismatches, the model has already read the file — blocking a tool call doesn't "un-inject" the content.
3. **Audit trail is maintained.** The warning appears in stderr (visible to the user and in session logs). The `Stop` hook's `audit.js` records the session for post-hoc review.
4. **Re-injection is the correct response.** If tampered, restore the canonical content. Blocking is not a useful security control at this layer.

## Session flag lifecycle

```
Session starts
     │
     ▼
PreToolUse fires (first tool call)
     │
     ├── .ai/.session-verified exists? ──YES──▶ skip (exit 0)
     │
     NO
     │
     ▼
Run hash check
     │
     ├── Hash matches ──▶ create .ai/.session-verified (exit 0)
     │
     └── Hash mismatch ──▶ warn + attempt re-inject ──▶ create .ai/.session-verified (exit 0)
     
Session ends (Stop hook fires)
     │
     ▼
audit.js logs session to .claude/audit/log.jsonl
Stop hook removes .ai/.session-verified (next session starts clean)
```

## Contract kernel markers

The hash is computed over the content between these exact markers (inclusive):

```
<!-- enterprise-ai-platform:kernel:start -->
...kernel content...
<!-- enterprise-ai-platform:kernel:end -->
```

Hash algorithm: SHA-256 (hex string, lowercase).  
Encoding: UTF-8 (no BOM).  
Stored in: `.ai/.contract-hash` (written by installer).  
Source truth: `shared/contract.md.sha256` (committed to platform repo).

## Re-injection behavior

When a mismatch is detected and `shared/contract.md` is present in the working directory:
1. Extract kernel section from `shared/contract.md`
2. Find `enterprise-ai-platform:contract:start/end` markers in `.claude/CLAUDE.md`
3. Replace the content between outer markers with the canonical kernel
4. Write updated `.claude/CLAUDE.md`

The re-injection does NOT touch content outside the contract markers (repo-specific module boundaries are preserved).

## Rollback
If `hash-check.js` causes an unintended re-injection:
1. Restore from `.claude/CLAUDE.md.prev` (created before re-injection)
2. Investigate the source of the hash mismatch
3. If legitimate change: recompute hash via `pwsh tools/compute-contract-hash.ps1`
