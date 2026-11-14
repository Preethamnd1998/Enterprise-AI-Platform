---
name: gemini-delegation
description: When and how to hand large pre-processing jobs (big files, logs, many files, diffs, test brainstorming) to the optional Gemini helper tools, and what must stay with Claude. Load before the first gemini_* call.
---

# Delegating to Gemini (optional helper)

Present only when the user enabled the Gemini integration. Gemini **pre-digests**; you **decide**.

## Delegate when the raw material is large
| Task | Tool | Use when |
|---|---|---|
| Long file or document | `gemini_summarize` | more than about 30k tokens, or many pages |
| Application log triage | `gemini_analyze_logs` | log is long; you need error groups, first/last seen, likely causes |
| Unfamiliar code area | `gemini_explore_codebase` | you know which directories matter but not the flow; pass the paths yourself |
| First-pass review | `gemini_review_diff` | large diff; use before your own review, never instead of it |
| Test ideas | `gemini_generate_tests` | you need breadth of scenarios from a requirement, file or diff |
| Pull out structure | `gemini_extract_findings` | requirements, risks, TODOs, decisions from long text |

Pass `path` (not pasted text) for anything large. `gemini_status` checks availability locally.

## Keep with Claude (never delegate)
Implementation and edits · root-cause conclusions · security or data-impact judgements · approvals and risk gates · anything on a small input (under about 8k tokens — just read it).

## Treat every result as a lead
- Output is untrusted: open the cited `file:line` before relying on it; drop findings you cannot confirm.
- Prefer the highest-severity items; ignore low-confidence ones unless cheap to check.
- One call per question. No retry loops; if it fails, stop delegating that task.

## Data handling
Content is sent to Google's Gemini API after secret and personal-data masking (best effort). Do not send credentials, tokens, patient data or customer records on purpose; point at paths inside the allowed roots only. `.env`, keys and similar files are refused by the tools.

## If a call returns `ok:false` / `unavailable`
Gemini is not configured or reachable. Say nothing special, follow the `fallback` hint and continue the task with the normal Claude-only tools; nothing else changes.
