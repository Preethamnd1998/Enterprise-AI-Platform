#!/usr/bin/env node
// usage-logger.js — UserPromptSubmit hook. Schema v1.0.
// System-wide (NOT per-repo) prompt/session log for the weekly usage report.
// Writes one JSONL entry per submitted prompt to a fixed global path —
// ~/.claude/usage-logs/<YYYY-MM-DD>.jsonl — regardless of which repo or
// folder the session is running in.
// Distinct from adapters/claude/hooks/audit.js (per-repo, PostToolUse/Stop,
// tool-call telemetry). This hook only observes prompt submission.
// Never invented numbers. All fields factual (from payload / filesystem / OS
// env) or null. ALWAYS exits 0 — failure to log must never block a session.
// Self-prunes: deletes any daily log file older than RETENTION_DAYS on every
// invocation, so a 10-day rolling window is kept without a separate cron job.

'use strict';

const fs   = require('fs');
const path = require('path');
const os   = require('os');

const SCHEMA_VERSION = '1.0';
const RETENTION_DAYS = 10;

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => { raw += chunk; });
process.stdin.on('end', () => {
  try { main(raw); } catch (_) { /* never block */ }
  process.exit(0);
});

function main(rawPayload) {
  let payload = {};
  // PowerShell prepends a UTF-8 BOM (U+FEFF) when piping a string to a
  // native process's stdin — strip it, or JSON.parse throws and every
  // field silently comes back null.
  const cleaned = rawPayload.charCodeAt(0) === 0xFEFF ? rawPayload.slice(1) : rawPayload;
  try { payload = JSON.parse(cleaned); } catch (_) {}

  const logDir = resolveLogDir();
  fs.mkdirSync(logDir, { recursive: true });

  const now      = new Date();
  const dateStr  = localDateStr(now); // YYYY-MM-DD in LOCAL time, not UTC —
                                       // a prompt at 11pm local must land in
                                       // that day's file, not tomorrow's UTC one
  const logPath  = path.join(logDir, `${dateStr}.jsonl`);

  const prompt = typeof payload.prompt === 'string' ? payload.prompt : null;

  const entry = {
    schema_version: SCHEMA_VERSION,
    ts:             now.toISOString(),
    session_id:     payload.session_id || null,
    cwd:            payload.cwd || process.cwd() || null,
    repo:           safeBasename(payload.cwd || process.cwd()),
    user_id:        process.env.USER || process.env.USERNAME || null,
    prompt_text:    prompt,
    prompt_chars:   prompt !== null ? prompt.length : null,
    // Informational only — a missing Redmine ID must never lower a quality
    // score (see shared/prompts/prompt-quality.md); this flag exists purely
    // so the weekly report can note the pattern, not to penalize it.
    has_redmine_ref: prompt !== null ? /\bredmine\s*=|\b#?\d{4,6}\b/i.test(prompt) : null,
  };

  fs.appendFileSync(logPath, JSON.stringify(entry) + '\n', 'utf8');

  pruneOldLogs(logDir, RETENTION_DAYS, now);
}

function safeBasename(p) {
  try { return path.basename(p) || null; } catch (_) { return null; }
}

// This hook runs globally (any repo, any cwd), so its override can't live in
// a per-repo paths.env — it reads the mirrored global copy at
// ~/.claude/paths.env instead. Keep the two files in sync manually; falls
// back to the original hardcoded default (~/.claude/usage-logs/) if the
// global file is missing, unreadable, or USAGE_LOG_PATH is blank/unset.
function resolveLogDir() {
  const defaultDir = path.join(os.homedir(), '.claude', 'usage-logs');
  try {
    const envPath = path.join(os.homedir(), '.claude', 'paths.env');
    const content = fs.readFileSync(envPath, 'utf8');
    // [ \t] not \s — \s matches newlines too, which would let a blank value
    // greedily cross the line boundary and capture the NEXT line's content
    // (verified this failure mode with a repro before fixing it).
    const m = content.match(/^[ \t]*USAGE_LOG_PATH[ \t]*=[ \t]*(.*?)[ \t]*$/m);
    if (m) {
      const value = m[1].trim();
      if (value) { return value; }
    }
  } catch (_) { /* file missing/unreadable — use default */ }
  return defaultDir;
}

function localDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function pruneOldLogs(logDir, retentionDays, now) {
  try {
    const cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate() - retentionDays);
    const files = fs.readdirSync(logDir);
    for (const f of files) {
      const m = f.match(/^(\d{4})-(\d{2})-(\d{2})\.jsonl$/);
      if (!m) { continue; }
      const fileDate = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
      if (fileDate < cutoff) {
        fs.unlinkSync(path.join(logDir, f));
      }
    }
  } catch (_) { /* pruning failure must never block */ }
}
