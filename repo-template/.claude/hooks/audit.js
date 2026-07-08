#!/usr/bin/env node
// Deterministic audit hook — called by the Claude Code Stop hook in settings.json.
// Reads the JSON payload from stdin, writes one JSONL line to .claude/audit/log.jsonl.
// No LLM cooperation required.

const fs   = require('fs');
const path = require('path');

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => { raw += chunk; });
process.stdin.on('end', () => {
  let payload = {};
  try { payload = JSON.parse(raw); } catch (_) {}

  const auditDir = path.join(process.cwd(), '.claude', 'audit');
  fs.mkdirSync(auditDir, { recursive: true });

  const entry = {
    ts:              new Date().toISOString(),
    session_id:      payload.session_id      || null,
    cwd:             process.cwd(),
    transcript_path: payload.transcript_path || null,
    stop_reason:     payload.stop_reason     || null,
  };

  fs.appendFileSync(
    path.join(auditDir, 'log.jsonl'),
    JSON.stringify(entry) + '\n',
    'utf8'
  );
});
