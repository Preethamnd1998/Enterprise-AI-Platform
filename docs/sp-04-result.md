# SP-04 Result — OpenCode Command File Reference
**Status:** CLOSED  
**Date:** 2026-07-07 (TK-085)  
**Feature:** FT-061 (AGENTS.md / OC command format)  

---

## Question
In `.opencode/command/*.md` (or `.toml`), can the prompt field be a `file:` reference to
a shared markdown file? Or must the prompt be inline (self-contained)?

## Investigation

### OpenCode command format (as of 2025–2026)

OpenCode custom commands live at `.opencode/command/<name>.md`.
The file content IS the prompt (full inline markdown).

```
.opencode/
  command/
    bug-fix.md     ← entire prompt is here, inline
    migration.md
```

There is **no** `file:` reference directive, `{% include %}` mechanism, or equivalent.
The agent reads the entire file content as the command prompt.

### Tested mechanism: inline reference via text

Within the command file, instructions can say:
```markdown
Read the shared contract at: .opencode/ai-platform/shared/contract.md
```
The AI will attempt to read that file IF it exists in the repo and IF the `codebase` tool
is available. This is functionally equivalent to the Copilot copy-on-install approach (SP-05).

### AGENTS.md support

OpenCode also reads `AGENTS.md` at the repo root (or project root) as global AI instructions —
similar to Copilot's `copilot-instructions.md`. This is the primary mechanism for injecting
the platform contract into OC sessions.

## Decision: Inline + AGENTS.md approach

1. **AGENTS.md** at repo root contains the contract summary (same markers as Copilot).
   Installer injects contract kernel between `enterprise-ai-platform:contract:start/end` markers.

2. **`.opencode/command/<slug>.md`** files are thin shells that say:
   "Follow the contract in AGENTS.md; read the full command at `.opencode/ai-platform/shared/commands/<slug>.md`"

3. **Installer** copies `shared/` to `.opencode/ai-platform/` (mirrors the Copilot approach).
   OC command files reference copied files by relative path.

## Impact

- FT-061 (AGENTS.md generation): create AGENTS.md template + 5 command shells
- `adapters/opencode/file-map.yml`: copy shared/ to `.opencode/ai-platform/`
- CI no-dup-shared: allow `.opencode/ai-platform/` copies (managed copies)
- SP-04 CLOSED: OC command format confirmed (inline + AGENTS.md)
