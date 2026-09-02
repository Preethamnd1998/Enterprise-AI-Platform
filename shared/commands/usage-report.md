---
description: Generate a report from the system-wide prompt/session log (~/.claude/usage-logs/), or clear it. Sessions, prompts per session, total prompts, and prompt-quality scoring reusing the shared/prompts/prompt-quality.md rubric — applied retroactively across sessions/days, distinct from the per-session /prompt-audit. Clearing requires typed confirmation.
argument-hint: "[date=<YYYY-MM-DD>|<start>..<end>] | clear"
allowed-tools: Read, Glob, Bash
---

# Command: /usage-report

<!-- Shared execution contract is loaded via ~/.claude/CLAUDE.md (installed globally). -->

Agent profile: **Usage Report**. Input: `$ARGUMENTS`.

Reads the system-wide log written by the `usage-logger.js` hook — one entry
per submitted prompt, across every session and every folder on this machine,
not scoped to the current repo. **Log location:** read `USAGE_LOG_PATH` from
`~/.claude/paths.env` (same file the hook itself reads); if it's set to a
non-blank value, `Glob <that-path>/*.jsonl` there instead of the default. If
`~/.claude/paths.env` is missing or the value is blank, use the existing
default: `~/.claude/usage-logs/<YYYY-MM-DD>.jsonl`. Always read from wherever
the hook is actually configured to write — never assume the default path
without checking `paths.env` first, or the report will silently read the
wrong (possibly empty) location after someone changes the override. This is a
**different, system-level** measure from
`shared/prompts/prompt-quality.md`'s per-task `Prompt Quality` line in the
Execution Summary (contract §16) — that one scores a single task within one
session; this command scores and aggregates across sessions and days. Both
use the same underlying scoring factors (16a) for consistency, applied at
different scopes.

The log retains a rolling 10-day window automatically (the hook self-prunes
older files on every write) — this command never needs to enforce retention
itself, only read what's currently there.

---

## Mode Detection

- `clear` present in `$ARGUMENTS` → **Clear Mode**.
- `date=` present → **Dated Report Mode** for that day or range.
- Otherwise → **Default Report Mode**, covering every currently-retained log
  file (up to the last 10 days).

---

## Default / Dated Report Mode

1. `Glob <log-dir>/*.jsonl` (or the specific date(s) from `date=`), where
   `<log-dir>` is resolved per the "Log location" rule above. If a requested
   date has no file (outside the 10-day retention window or never
   populated), say so explicitly rather than silently omitting it.
2. `Read` each matching file; parse JSONL line by line.
3. Compute, factually — never estimate or invent a count:
   - **Total prompts** — total line count across all files in scope.
   - **Total sessions** — count of distinct `session_id` values.
   - **Prompts per session** — group by `session_id`, report min/max/avg.
   - **Per-day breakdown** — prompts and sessions per calendar day.
4. **Prompt quality** — for each logged `prompt_text`, apply
   `shared/prompts/prompt-quality.md` §16a's scoring factors (exact identifier,
   error evidence, business context, scope definition, reproduction steps,
   design reference vs. missing details/ambiguity/multiple objectives). Per
   §16f and the explicit instruction for this command: **a missing Redmine
   reference never lowers a score** — `has_redmine_ref` in the log is
   informational only, never a scoring input. Skip prompts with `prompt_text:
   null` (payload didn't carry text) — note the count of skipped entries,
   don't silently drop them from the total.
5. If the prompt volume is large (a rough guide: over ~200 prompts in scope),
   sample rather than score every single one individually in the output, but
   state the sample size and method plainly — never present a sampled result
   as if every prompt were scored.

### Report format

```text
## Usage Report — <date or range>

Sessions: <N>            Total prompts: <N>
Prompts per session: min <N> · max <N> · avg <N>

Avg Prompt Quality: <N>/100
Score distribution: High <N> · Good <N> · Moderate <N> · Poor <N> · Very Poor <N>
Most missing (from low-scoring prompts): <top 1-2 items>

## Per-day breakdown
| Date | Sessions | Prompts | Avg Quality |
|---|---|---|---|
| <date> | <N> | <N> | <N> |
...

Skipped (no prompt text in log): <N>
```

---

## Clear Mode

**Never delete without an explicit, separately-confirmed instruction — a bare
`clear` argument alone is the request, not the confirmation.**

1. `Glob <log-dir>/*.jsonl` (same resolution as Default/Dated Mode above). If empty, say so and stop.
2. Report what would be deleted: file count, date range, total prompt/session
   counts (reuse the Default Report Mode computation above) — the user should
   see what they're about to lose.
3. Ask exactly:
   ```text
   Type CONFIRM to permanently delete <N> days of usage logs (<start>–<end>,
   <N> prompts across <N> sessions). This cannot be undone.
   ```
4. Only on an exact `CONFIRM` reply: delete every matched file (`Bash rm` or
   equivalent). Any other reply (including `yes`/`approve`/silence): treat as
   declined, delete nothing, say so.

---

## Output

Report (Default/Dated Mode) or deletion confirmation (Clear Mode) · Execution
Summary (contract §13). This command never scores itself into the log it
reads (asking for a usage report is not itself logged as a scored prompt for
quality purposes, though the hook will still log the raw `/usage-report`
invocation like any other prompt).
