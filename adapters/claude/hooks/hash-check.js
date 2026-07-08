#!/usr/bin/env node
// hash-check.js — PreToolUse hook (Enterprise AI Platform v3.1)
// Runs before every tool call in the session. Session-dedup via .ai/.session-verified flag.
// Behavior: WARN + re-inject on mismatch. NEVER blocks execution (exit 0 always).
// SP-02 resolution: PreToolUse confirmed valid; SessionStart does not exist.

'use strict';
const fs   = require('fs');
const path = require('path');
const crypto = require('crypto');

const CWD          = process.cwd();
const CLAUDE_MD    = path.join(CWD, '.claude', 'CLAUDE.md');
const CONTRACT_HASH = path.join(CWD, '.ai', '.contract-hash');
const SESSION_FLAG  = path.join(CWD, '.ai', '.session-verified');
const AI_DIR        = path.join(CWD, '.ai');

function extractKernel(content) {
  const START = '<!-- enterprise-ai-platform:kernel:start -->';
  const END   = '<!-- enterprise-ai-platform:kernel:end -->';
  const si = content.indexOf(START);
  const ei = content.indexOf(END);
  if (si < 0 || ei < 0) return null;
  return content.substring(si, ei + END.length);
}

function sha256(text) {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

function ensureAiDir() {
  if (!fs.existsSync(AI_DIR)) {
    fs.mkdirSync(AI_DIR, { recursive: true });
  }
}

function main() {
  // Session dedup: if flag exists, this session is already verified — skip.
  if (fs.existsSync(SESSION_FLAG)) {
    process.exit(0);
  }

  // First tool call of this session — run hash check.
  ensureAiDir();

  // If no .contract-hash file exists, installer hasn't run yet — warn and continue.
  if (!fs.existsSync(CONTRACT_HASH)) {
    process.stderr.write(
      '[AI Platform] WARNING: .ai/.contract-hash not found. ' +
      'Run install-claude.ps1 to initialize. Continuing without verification.\n'
    );
    fs.writeFileSync(SESSION_FLAG, '', 'utf8');
    process.exit(0);
  }

  // If CLAUDE.md doesn't exist, nothing to verify — continue.
  if (!fs.existsSync(CLAUDE_MD)) {
    process.stderr.write(
      '[AI Platform] WARNING: .claude/CLAUDE.md not found. Skipping hash check.\n'
    );
    fs.writeFileSync(SESSION_FLAG, '', 'utf8');
    process.exit(0);
  }

  const claudeMd = fs.readFileSync(CLAUDE_MD, 'utf8');
  const kernel = extractKernel(claudeMd);

  if (!kernel) {
    process.stderr.write(
      '[AI Platform] WARNING: Contract kernel markers not found in .claude/CLAUDE.md. ' +
      'The contract may be from a pre-v3.1 installation. Run install-claude.ps1 to upgrade.\n'
    );
    fs.writeFileSync(SESSION_FLAG, '', 'utf8');
    process.exit(0);
  }

  const expectedHash = fs.readFileSync(CONTRACT_HASH, 'utf8').trim();
  const actualHash   = sha256(kernel);

  if (actualHash !== expectedHash) {
    // Mismatch: WARN (never block), re-inject if platform source is available.
    process.stderr.write(
      '[AI Platform] WARNING: Contract kernel hash mismatch detected.\n' +
      `  Expected: ${expectedHash}\n` +
      `  Actual:   ${actualHash}\n` +
      '  The contract may have been modified outside the installer.\n' +
      '  Run install-claude.ps1 to restore the canonical contract.\n'
    );

    // Attempt re-injection from shared/contract.md if available (plugin in-repo use).
    const sharedContract = path.join(CWD, 'shared', 'contract.md');
    if (fs.existsSync(sharedContract)) {
      process.stderr.write('[AI Platform] Re-injecting contract kernel from shared/contract.md...\n');
      try {
        const source = fs.readFileSync(sharedContract, 'utf8');
        const newKernel = extractKernel(source);
        if (newKernel) {
          const START_OUTER = '<!-- enterprise-ai-platform:contract:start -->';
          const END_OUTER   = '<!-- enterprise-ai-platform:contract:end -->';
          const si = claudeMd.indexOf(START_OUTER);
          const ei = claudeMd.indexOf(END_OUTER);
          if (si >= 0 && ei >= 0) {
            const prefix  = claudeMd.substring(0, si + START_OUTER.length);
            const suffix  = claudeMd.substring(ei);
            const updated = prefix + '\n' + newKernel + '\n' + suffix;
            fs.writeFileSync(CLAUDE_MD, updated, 'utf8');
            process.stderr.write('[AI Platform] Re-injection complete.\n');
          }
        }
      } catch (e) {
        process.stderr.write(`[AI Platform] Re-injection failed: ${e.message}\n`);
      }
    }
  }

  // Mark session as verified (even on mismatch — warn+continue, never block).
  fs.writeFileSync(SESSION_FLAG, '', 'utf8');
  process.exit(0);
}

main();
