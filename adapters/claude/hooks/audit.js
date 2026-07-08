#!/usr/bin/env node
// audit.js — PostToolUse + Stop hook. Schema v1.1 (Phase E — telemetry fields).
// Writes one JSONL entry per event to .claude/audit/log.jsonl.
// Schema: shared/schemas/audit-schema.json v1.1
// PostToolUse: records tool_name, tool_input_hash, tool_result_status.
// Stop: records stop_reason, command, gate results, telemetry fields. Writes session summary.
// Phase E: adapter, user_id, repo, branch, mcp_calls_count now populated (factual only).
// Never invented numbers. All fields factual (from payload / filesystem / OS env) or null.
// ALWAYS exits 0 — failure to audit must never block the session.

'use strict';

const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');

const SCHEMA_VERSION = '1.1';

// ── Parse --event flag ──────────────────────────────────────────────────
const args = process.argv.slice(2);
const eventFlagIdx = args.indexOf('--event');
const explicitEvent = (eventFlagIdx !== -1) ? args[eventFlagIdx + 1] : null;

// ── Read stdin payload ──────────────────────────────────────────────────
let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => { raw += chunk; });
process.stdin.on('end', () => {
  try { main(raw); } catch (_) { /* never block */ }
  process.exit(0);
});

function main(rawPayload) {
  let payload = {};
  try { payload = JSON.parse(rawPayload); } catch (_) {}

  const eventType = explicitEvent || payload.event || 'Stop';

  const cwd      = process.cwd();
  const auditDir = path.join(cwd, '.claude', 'audit');
  fs.mkdirSync(auditDir, { recursive: true });

  // ── Platform version + adapter (factual from disk) ─────────────────────
  let platformVersion = null;
  let adapter         = null;
  try {
    const pvPath = path.join(cwd, '.ai', '.platform-version.json');
    if (fs.existsSync(pvPath)) {
      const pv = JSON.parse(fs.readFileSync(pvPath, 'utf8'));
      platformVersion = pv.version  || null;
      adapter         = pv.adapter  || null;
    }
  } catch (_) {}

  // ── Contract hash status (from session flag) ───────────────────────────
  let contractHashStatus = null;
  try {
    const flagPath = path.join(cwd, '.ai', '.session-verified');
    if (fs.existsSync(flagPath)) {
      const flag = fs.readFileSync(flagPath, 'utf8').trim();
      contractHashStatus = flag || 'ok';
    }
  } catch (_) {}

  // ── Phase E telemetry fields (factual only) ────────────────────────────
  const userId = process.env.USER || process.env.USERNAME || null;
  const repo   = path.basename(cwd) || null;
  const branch = readGitBranch(cwd);

  // ── Build entry ─────────────────────────────────────────────────────────
  const entry = {
    schema_version:       SCHEMA_VERSION,
    event:                sanitizeEvent(eventType),
    ts:                   new Date().toISOString(),
    session_id:           payload.session_id      || null,
    cwd:                  cwd,
    transcript_path:      payload.transcript_path || null,
    stop_reason:          null,
    tool_name:            null,
    tool_input_hash:      null,
    tool_result_status:   null,
    command:              null,
    gate_a_status:        null,
    gate_b_status:        null,
    platform_version:     platformVersion,
    contract_hash_status: contractHashStatus,
    adapter:              sanitizeAdapter(adapter),
    user_id:              userId,
    repo:                 repo,
    branch:               branch,
    mcp_calls_count:      null,  // populated on Stop from session log
  };

  // ── Event-specific fields ──────────────────────────────────────────────
  if (entry.event === 'PostToolUse') {
    entry.tool_name          = payload.tool_name || null;
    entry.tool_input_hash    = hashToolInput(payload.tool_input);
    entry.tool_result_status = sanitizeToolStatus(payload.tool_result_status);
  }

  if (entry.event === 'Stop') {
    entry.stop_reason   = sanitizeStopReason(payload.stop_reason);
    entry.command       = extractCommand(payload);
    entry.gate_a_status = payload.gate_a_status || null;
    entry.gate_b_status = payload.gate_b_status || null;
  }

  const logPath = path.join(auditDir, 'log.jsonl');
  fs.appendFileSync(logPath, JSON.stringify(entry) + '\n', 'utf8');

  // ── On Stop: back-fill mcp_calls_count + write session summary ─────────
  if (entry.event === 'Stop') {
    writeSessionSummary(logPath, entry, auditDir);
  }
}

// ── Helper: read current git branch from .git/HEAD ────────────────────
function readGitBranch(cwd) {
  try {
    let dir = cwd;
    for (let i = 0; i < 5; i++) {
      const headPath = path.join(dir, '.git', 'HEAD');
      if (fs.existsSync(headPath)) {
        const head = fs.readFileSync(headPath, 'utf8').trim();
        const m = head.match(/^ref: refs\/heads\/(.+)$/);
        if (m) { return m[1]; }
        if (/^[0-9a-f]{40}$/.test(head)) { return null; } // detached HEAD — branch unknown
        return null;
      }
      const parent = path.dirname(dir);
      if (parent === dir) { break; }
      dir = parent;
    }
  } catch (_) {}
  return null;
}

function sanitizeEvent(raw) {
  const allowed = ['Stop', 'PostToolUse', 'SubagentStop'];
  return allowed.includes(raw) ? raw : 'Stop';
}

function sanitizeAdapter(raw) {
  const allowed = ['claude', 'copilot', 'opencode'];
  return allowed.includes(raw) ? raw : null;
}

function sanitizeStopReason(raw) {
  const allowed = ['end_turn', 'max_tokens', 'tool_use', 'error'];
  return allowed.includes(raw) ? raw : null;
}

function sanitizeToolStatus(raw) {
  const allowed = ['success', 'error', 'cancelled'];
  return allowed.includes(raw) ? raw : null;
}

function hashToolInput(toolInput) {
  if (!toolInput) { return null; }
  try {
    const normalized = JSON.stringify(toolInput, Object.keys(toolInput).sort());
    return crypto.createHash('sha256').update(normalized).digest('hex').slice(0, 16);
  } catch (_) { return null; }
}

function extractCommand(payload) {
  if (!payload.transcript_path) { return null; }
  try {
    const lines = fs.readFileSync(payload.transcript_path, 'utf8').split('\n');
    for (const line of lines) {
      if (!line.trim()) { continue; }
      const rec = JSON.parse(line);
      if (rec.type === 'user' && Array.isArray(rec.message?.content)) {
        for (const block of rec.message.content) {
          if (block.type === 'text') {
            const m = block.text.trim().match(/^\/([\w-]+)/);
            if (m) { return `/${m[1]}`; }
          }
        }
      }
    }
  } catch (_) {}
  return null;
}

function writeSessionSummary(logPath, stopEntry, auditDir) {
  if (!stopEntry.session_id) { return; }
  try {
    const lines = fs.readFileSync(logPath, 'utf8').split('\n').filter(Boolean);
    const sessionEntries = lines
      .map(l => { try { return JSON.parse(l); } catch (_) { return null; } })
      .filter(e => e && e.session_id === stopEntry.session_id);

    const toolCalls  = sessionEntries.filter(e => e.event === 'PostToolUse');
    const toolErrors = toolCalls.filter(e => e.tool_result_status === 'error');
    const mcpCalls   = toolCalls.filter(e => e.tool_name && e.tool_name.startsWith('mcp__'));
    const uniqueTools = [...new Set(toolCalls.map(e => e.tool_name).filter(Boolean))];

    const summary = {
      type:              'session_summary',
      schema_version:    SCHEMA_VERSION,
      session_id:        stopEntry.session_id,
      ts:                stopEntry.ts,
      command:           stopEntry.command,
      platform_version:  stopEntry.platform_version,
      adapter:           stopEntry.adapter,
      user_id:           stopEntry.user_id,
      repo:              stopEntry.repo,
      branch:            stopEntry.branch,
      tool_calls_total:  toolCalls.length,
      tool_calls_error:  toolErrors.length,
      mcp_calls_count:   mcpCalls.length,
      tools_used:        uniqueTools,
      gate_a_status:     stopEntry.gate_a_status,
      gate_b_status:     stopEntry.gate_b_status,
      stop_reason:       stopEntry.stop_reason,
    };

    fs.appendFileSync(
      path.join(auditDir, 'session-summaries.jsonl'),
      JSON.stringify(summary) + '\n',
      'utf8'
    );
  } catch (_) {}
}
