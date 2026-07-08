# DB MCP Consolidation (FT-038 / BUG-C1)
**Status:** CLOSED  
**Date:** 2026-07-07 (TK-060)  

---

## Problem
FMS F12 said "consolidate ~25 DB MCP servers → 1 parameterized read-only server."
BUG-C1 noted: one parameterized server might actually mean two (Postgres + Mongo).

## Decision

**Two DB MCP entries**, not one:

| Server | Entry name | Purpose |
|---|---|---|
| MongoDB | `canary_mongo_db` | Patient/clinical data (MongoDB Atlas) |
| PostgreSQL | `postgres-reader` | Relational data |

Rationale: Postgres and MongoDB require different MCP server implementations.
Attempting to consolidate into a single server would require a custom multi-protocol
adapter — unnecessary complexity. Two parameterized read-only servers is the correct
minimum.

## Before vs After

| Before (v3.0) | After (v3.2) |
|---|---|
| ~25 named DB MCP entries in `settings.json` deny list | 2 entries in `.mcp.json.template` |
| Some entries had write permissions | Both use read-only credentials (`${env:MONGO_READ_URI}`, `${env:POSTGRES_READ_URI}`) |
| Token values were in comments or defaults | All values via `${env:}` injection |
| No standard for connection string format | Standardized URIs documented in `docs/secrets.md` |

## Allowlist entries (settings.json)

The existing `adapters/claude/config/settings.json` already allows:
```json
"mcp__canary_mongo_db__find",
"mcp__canary_mongo_db__aggregate",
"mcp__canary_mongo_db__list-collections",
"mcp__canary_mongo_db__list-databases"
```

Phase B adds `postgres-reader` allowed tools to the allowlist. See `shared/mcp/tool-allowlists.md`.

## BUG-C1 CLOSED
The "one DB MCP" requirement from F12 is satisfied by two read-only entries. The consolidation
was ~25 → 2, not ~25 → 1.
