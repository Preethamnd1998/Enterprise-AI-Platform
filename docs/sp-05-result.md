# SP-05 Result — Copilot Prompt File External Reference Mechanism
**Status:** CLOSED  
**Date:** 2026-07-07 (TK-054)  
**Blocker closed:** SP-05 for FT-057/FT-058  

---

## Question
Can a `.github/prompts/*.prompt.md` file include or reference content from
`shared/commands/bug-fix.md` (or any other shared file), or must the prompt file be
entirely self-contained?

## Investigation

### What was tested
Reviewed existing `adapters/copilot/prompts/bug-fix.prompt.md`:

```markdown
---
mode: agent
tools: ['codebase', 'search', 'editFiles', 'runCommands']
---
# /bug-fix
Follow the shared contract: [.github/ai-platform/shared/contract.md](../ai-platform/shared/contract.md).
```

The file uses a Markdown `[text](path)` link. This is a *navigational* link, not a file-include
directive. Copilot does **not** auto-expand linked files into the prompt context.

### Copilot `.prompt.md` file capabilities (as of VS Code Copilot 2025)

| Mechanism | Supported |
|---|---|
| `#file:path` reference in prompt body (agent reads it) | ✅ Yes — when mode=agent, agent can read files via codebase tool |
| Auto-inline of referenced markdown files at load time | ❌ No |
| `{% include "path" %}` or similar template directive | ❌ No |
| Prompt body references `$WORKSPACE_FOLDER` variable | ✅ Yes (VS Code workspace vars) |

### Conclusion

Copilot `.prompt.md` files **cannot auto-include** external content. They must be
**self-contained** or instruct the agent to read specific files. The agent mode (`mode: agent`)
allows the shell to say "read contract at path X" and the agent will follow the instruction,
provided the referenced file exists in the repo.

## Decision: Copy-on-Install Approach

The installer copies `shared/` into `.github/ai-platform/` in each consuming repo.
Copilot prompt shells reference those copied files by relative path
(`../ai-platform/shared/contract.md`). The agent reads them via the `codebase` tool.

```
shared/commands/bug-fix.md  ──copy──>  .github/ai-platform/shared/commands/bug-fix.md
shared/contract.md          ──copy──>  .github/ai-platform/shared/contract.md
shared/standards/           ──copy──>  .github/ai-platform/standards/
```

The Copilot shell (`.github/prompts/bug-fix.prompt.md`) stays thin: it just says
"follow the contract at `../ai-platform/shared/contract.md`" and lists key specialization.

## SP-08 Result (Copilot MCP Permission Granularity)

**Question:** Can VS Code Copilot MCP config allow specific tools while denying others?

**Finding:** Copilot MCP configuration (`.vscode/mcp.json` or `settings.json`) is
**server-level only**. No per-tool allow/deny is available from VS Code side. The only
tool-level control is via the MCP server's own permission model.

**Mitigation:** Use **read-only PATs** (scoped to read operations). The PAT cannot perform
writes regardless of what the client requests. Capability matrix updated: cap-32 (per-tool
MCP deny) = unsupported for Copilot.

## Impact on Sprint 2

- FT-057/FT-058: Copilot shells use copy approach. `generate-copilot.ps1` creates thin shells.
- `adapters/copilot/install.ps1` copies `shared/` to `.github/ai-platform/shared/`.
- `CI no-dup-shared` job must **allow** `.github/ai-platform/` copies (they are managed copies,
  not unauthorized duplicates). The job should only flag copies *inside adapters/* source.
- SP-05 blocker on FT-058 CLOSED.
- SP-08 finding recorded; capability-map.yml will reflect server-level-only MCP control.
