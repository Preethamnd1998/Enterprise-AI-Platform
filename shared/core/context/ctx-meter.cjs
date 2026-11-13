#!/usr/bin/env node
// ctx-meter.cjs — Context Manager hook for Claude Code (UserPromptSubmit | Stop).
//
// Reads the session transcript named in the hook payload (transcript_path) and
// keeps a small incremental state file per session, so a 50 MB transcript is
// never re-parsed from the start.
//
//   UserPromptSubmit  → prints ONE advisory line only when the live context is
//                       above CTX_BUDGET (default 150k tokens). Silent otherwise,
//                       so the hook costs zero tokens on a healthy session.
//   Stop              → appends a per-turn token record to
//                       <USAGE_LOG_PATH|~/.claude/usage-logs>/tokens-YYYY-MM-DD.jsonl
//                       and refreshes the structural checkpoint
//                       <CHECKPOINT_DIR|<project>/.claude/checkpoints>/current.md
//                       (agent-written text under the agent-state marker is kept).
//
// Facts only: every number comes from the transcript's usage blocks or from
// counting tool calls. Nothing is estimated except tool-result size (chars/4,
// labelled "approx"). Always exits 0 — a failing meter must never block a session.

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const EVENT = process.argv.includes('--event') ? process.argv[process.argv.indexOf('--event') + 1] : 'UserPromptSubmit';
const HOME = os.homedir();

if (require.main === module) {
  let raw = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (c) => { raw += c; });
  process.stdin.on('end', () => { try { main(raw); } catch (_) { /* never block */ } process.exit(0); });
  setTimeout(() => process.exit(0), 4000).unref();
}

// ------------------------------------------------------------------ settings
function parseEnvFile(p) {
  const out = {};
  try {
    for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
      const m = /^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
      if (m && m[2] !== '') out[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch (_) { /* optional */ }
  return out;
}
function settings() {
  const s = { ...parseEnvFile(path.join(HOME, '.claude', 'paths.env')) };
  for (const k of ['CTX_BUDGET', 'USAGE_LOG_PATH', 'CHECKPOINT_DIR']) if (process.env[k]) s[k] = process.env[k];
  return s;
}
function expand(p) { return p && p.startsWith('~') ? path.join(HOME, p.slice(1)) : p; }

// ------------------------------------------------------------------ transcript
// Incremental scan: state remembers the byte offset already consumed plus the
// running aggregates, so each hook invocation reads only the new tail.
function loadState(stateFile) {
  try { return JSON.parse(fs.readFileSync(stateFile, 'utf8')); } catch (_) { return null; }
}
function freshState() {
  return {
    offset: 0, turns: 0, ctx_now: 0, first_ctx: null, model: null,
    sum: { input: 0, cache_read: 0, cache_creation: 0, output: 0 },
    tools: {}, tool_result_tokens_approx: {}, skills: {}, mcp_servers: {}, files_edited: {},
    last_prompts: [], compactions: 0, last_recorded_sum: null, id2name: {},
  };
}
function scan(transcriptPath, st) {
  let fd; let size;
  try { size = fs.statSync(transcriptPath).size; } catch (_) { return st; }
  if (size < st.offset) { Object.assign(st, freshState()); } // rotated/truncated
  if (size === st.offset) return st;
  fd = fs.openSync(transcriptPath, 'r');
  try {
    const len = size - st.offset;
    const buf = Buffer.alloc(len);
    fs.readSync(fd, buf, 0, len, st.offset);
    let text = buf.toString('utf8');
    const lastNl = text.lastIndexOf('\n');
    if (lastNl < 0) return st;                    // partial line; wait for next call
    st.offset += Buffer.byteLength(text.slice(0, lastNl + 1), 'utf8');
    text = text.slice(0, lastNl);
    for (const line of text.split('\n')) {
      if (!line) continue;
      let d; try { d = JSON.parse(line); } catch (_) { continue; }
      ingest(d, st);
    }
  } finally { fs.closeSync(fd); }
  return st;
}
function textOf(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.map((x) => (x && x.type === 'text' ? x.text : '')).join('');
  return '';
}
function ingest(d, st) {
  const m = d.message;
  if (d.type === 'summary' || d.isCompactSummary) st.compactions += 1;
  if (d.type === 'assistant' && m && typeof m === 'object') {
    const u = m.usage;
    if (u) {
      const ctx = (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0);
      st.turns += 1; st.ctx_now = ctx; if (st.first_ctx === null) st.first_ctx = ctx;
      st.sum.input += u.input_tokens || 0; st.sum.cache_read += u.cache_read_input_tokens || 0;
      st.sum.cache_creation += u.cache_creation_input_tokens || 0; st.sum.output += u.output_tokens || 0;
      if (m.model) st.model = m.model;
    }
    for (const b of Array.isArray(m.content) ? m.content : []) {
      if (!b || b.type !== 'tool_use') continue;
      let name = b.name || '?'; const inp = b.input || {};
      if (name === 'Skill') { const s = String(inp.skill || '?'); st.skills[s] = (st.skills[s] || 0) + 1; }
      if (name.startsWith('mcp__')) { const srv = name.split('__')[1] || '?'; st.mcp_servers[srv] = (st.mcp_servers[srv] || 0) + 1; name = 'mcp:' + srv; }
      if ((b.name === 'Edit' || b.name === 'Write' || b.name === 'MultiEdit' || b.name === 'NotebookEdit') && inp.file_path) st.files_edited[inp.file_path] = (st.files_edited[inp.file_path] || 0) + 1;
      st.tools[name] = (st.tools[name] || 0) + 1;
      if (b.id) { st.id2name[b.id] = name; const keys = Object.keys(st.id2name); if (keys.length > 400) delete st.id2name[keys[0]]; }
    }
  }
  if (d.type === 'user' && m && typeof m === 'object') {
    const content = m.content;
    if (typeof content === 'string') pushPrompt(st, content);
    for (const b of Array.isArray(content) ? content : []) {
      if (!b) continue;
      if (b.type === 'text' && !d.isMeta) pushPrompt(st, b.text);
      if (b.type === 'tool_result') {
        const name = st.id2name[b.tool_use_id] || '?';
        const approx = Math.round(textOf(b.content).length / 4);
        st.tool_result_tokens_approx[name] = (st.tool_result_tokens_approx[name] || 0) + approx;
      }
    }
  }
}
function pushPrompt(st, t) {
  if (!t || typeof t !== 'string') return;
  const s = t.replace(/\s+/g, ' ').trim();
  if (!s || s.startsWith('<') ) return;            // system reminders / tool noise
  st.last_prompts.push(s.slice(0, 160));
  if (st.last_prompts.length > 3) st.last_prompts.shift();
}

// ------------------------------------------------------------------ outputs
function k(n) { return `${Math.round((n || 0) / 1000)}k`; }
function toolShare(st) {
  const tot = Object.values(st.tool_result_tokens_approx).reduce((a, b) => a + b, 0);
  const top = Object.entries(st.tool_result_tokens_approx).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([n, v]) => `${n} ${k(v)}`).join(', ');
  return { tot, top };
}
function advisory(st, budget, checkpointFile) {
  if (!st.ctx_now || st.ctx_now <= budget) return null;
  const ts = toolShare(st);
  const share = st.ctx_now ? Math.min(100, Math.round((ts.tot / st.ctx_now) * 100)) : 0;
  return `[ctx-meter] context ${k(st.ctx_now)} > budget ${k(budget)} (tool output ≈${share}%${ts.top ? ': ' + ts.top : ''}; turns ${st.turns}). ` +
    `Refresh the checkpoint ${checkpointFile} (requirement, decisions, files touched, next step — ≤40 lines) and run /compact; after compaction Read the checkpoint instead of re-deriving context.`;
}
function writeTokenRecord(st, payload, logDir) {
  fs.mkdirSync(logDir, { recursive: true });
  const now = new Date();
  const day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const prev = st.last_recorded_sum || { input: 0, cache_read: 0, cache_creation: 0, output: 0 };
  const delta = {};
  for (const key of Object.keys(st.sum)) delta[key] = st.sum[key] - (prev[key] || 0);
  const rec = {
    schema_version: '1.2', ts: now.toISOString(), event: 'Stop', session_id: payload.session_id || null,
    cwd: payload.cwd || null, repo: payload.cwd ? path.basename(payload.cwd) : null, model: st.model,
    turns_total: st.turns, context_now: st.ctx_now, context_first_turn: st.first_ctx, compactions: st.compactions,
    tokens_delta: delta, tokens_session: st.sum,
    cache_hit_rate: st.sum.cache_read + st.sum.input + st.sum.cache_creation
      ? Number((st.sum.cache_read / (st.sum.cache_read + st.sum.input + st.sum.cache_creation)).toFixed(3)) : null,
    tools: st.tools, tool_result_tokens_approx: st.tool_result_tokens_approx, skills: st.skills, mcp_servers: st.mcp_servers,
    files_edited: Object.keys(st.files_edited).length,
  };
  fs.appendFileSync(path.join(logDir, `tokens-${day}.jsonl`), JSON.stringify(rec) + '\n');
  st.last_recorded_sum = { ...st.sum };
}
const MARK = '<!-- agent-state:start -->';
function writeCheckpoint(st, payload, file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  let agentPart = '';
  try { const old = fs.readFileSync(file, 'utf8'); const i = old.indexOf(MARK); if (i >= 0) agentPart = old.slice(i); } catch (_) { /* new */ }
  if (!agentPart) agentPart = `${MARK}\n## State (agent-maintained — refresh before /compact or /clear)\n- Requirement:\n- Decisions so far:\n- Next step:\n`;
  const files = Object.keys(st.files_edited);
  const lines = [
    '# Task checkpoint (auto-generated by ctx-meter; structural facts only)',
    `- Session: ${payload.session_id || '?'} · updated ${new Date().toISOString()}`,
    `- Project: ${payload.cwd || '?'}`,
    `- Context now: ${k(st.ctx_now)} · turns ${st.turns} · compactions ${st.compactions} · model ${st.model || '?'}`,
    `- Tokens (session): input ${k(st.sum.input)}, cache_read ${k(st.sum.cache_read)}, cache_creation ${k(st.sum.cache_creation)}, output ${k(st.sum.output)}`,
    `- Skills loaded: ${Object.keys(st.skills).join(', ') || 'none'}`,
    `- MCP servers used: ${Object.entries(st.mcp_servers).map(([n, c]) => `${n}(${c})`).join(', ') || 'none'}`,
    `- Files edited (${files.length}):`,
    ...files.slice(0, 25).map((f) => `  - ${f}`),
    ...(files.length > 25 ? [`  - … +${files.length - 25} more`] : []),
    '- Last prompts:',
    ...st.last_prompts.map((p) => `  - ${p}`),
    '',
    agentPart.trimEnd(),
    '',
  ];
  fs.writeFileSync(file, lines.join('\n'));
}

// ------------------------------------------------------------------ main
function main(rawPayload) {
  const cleaned = rawPayload.charCodeAt(0) === 0xFEFF ? rawPayload.slice(1) : rawPayload;
  let payload = {}; try { payload = JSON.parse(cleaned); } catch (_) {}
  const tp = payload.transcript_path;
  if (!tp || !fs.existsSync(tp)) return;
  const s = settings();
  const budget = Number(s.CTX_BUDGET) > 0 ? Number(s.CTX_BUDGET) : 150000;
  const logDir = expand(s.USAGE_LOG_PATH) || path.join(HOME, '.claude', 'usage-logs');
  const project = process.env.CLAUDE_PROJECT_DIR || payload.cwd || process.cwd();
  const ckDir = expand(s.CHECKPOINT_DIR) || path.join(project, '.claude', 'checkpoints');
  const ckFile = path.join(ckDir, 'current.md');
  const stateDir = path.join(logDir, 'state');
  fs.mkdirSync(stateDir, { recursive: true });
  const sid = (payload.session_id || path.basename(tp, '.jsonl')).replace(/[^A-Za-z0-9_-]/g, '_');
  const stateFile = path.join(stateDir, `${sid}.json`);
  const st = scan(tp, loadState(stateFile) || freshState());

  if (EVENT === 'Stop') {
    writeTokenRecord(st, payload, logDir);
    writeCheckpoint(st, payload, ckFile);
  } else {
    const line = advisory(st, budget, ckFile);
    if (line) process.stdout.write(line + '\n');
  }
  fs.writeFileSync(stateFile, JSON.stringify(st));
  // Self-prune state files older than 10 days.
  try {
    const cutoff = Date.now() - 10 * 86400000;
    for (const f of fs.readdirSync(stateDir)) { const p = path.join(stateDir, f); if (fs.statSync(p).mtimeMs < cutoff) fs.unlinkSync(p); }
  } catch (_) { /* best effort */ }
}

module.exports = { ingest, freshState, advisory, scan };
