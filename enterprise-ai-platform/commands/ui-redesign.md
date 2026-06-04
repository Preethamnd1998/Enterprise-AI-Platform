---
description: Modernize a single Angular component / screen from a screenshot or the component itself. Depth-0, no backend or repository analysis.
argument-hint: "component=<Name> | \"<paste HTML>\"  (attach a screenshot if available)"
allowed-tools: Read, Grep, Glob, Edit, Write, mcp__gitlab-reader__get_file_contents, mcp__chrome-devtools-mcp__take_screenshot, mcp__chrome-devtools-mcp__take_snapshot, mcp__chrome-devtools-mcp__list_console_messages
---

# Command: /ui-redesign
<!-- Shared execution contract is loaded via ~/.claude/CLAUDE.md (installed globally). -->

Agent profile: **UI Redesign**. Input: `$ARGUMENTS`.

## Specialization
Avoid repository analysis entirely. The screenshot + the one component + Frontend standards
are the complete spec. Backend, APIs, DB, and routing are out of scope. Depth-0.

## Workflow
1. **Load the one component.** Use pasted HTML/TS/CSS if provided; else `get_file_contents`
   for `component=<Name>` (`.html`, `.ts`, `.scss`). Use the attached screenshot as the visual spec.
2. **Standards (lazy).** Read `frontend/component.md`, `frontend/custom-components.md`,
   `frontend/others.md` as relevant. No backend standards.
3. **Analyze → propose.** Visual hierarchy, spacing, typography, responsiveness, accessibility (ARIA/contrast/focus).
4. **Generate.** Angular HTML/CSS (+ minimal TS) updates only. Reuse existing LT components; introduce no new UI libraries.

## Validation
Fill `${CLAUDE_PLUGIN_ROOT}/templates/redesign-checklist.md`:
preserve `@Input`/`@Output`/bindings, validations, permissions, workflows, existing APIs;
accessibility improved; responsive verified. Do NOT modify backend/API/DB/routes.

## Output
Current analysis · proposed redesign · accessibility/responsive improvements · HTML/CSS/TS changes · checklist result · audit line.
Budget: ≤ 5 files, ≤ 8k tokens + image.
