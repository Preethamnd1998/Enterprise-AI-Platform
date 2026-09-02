import fs from 'node:fs';
import path from 'node:path';
import { redactSecrets } from './safety.js';

/**
 * JSONL audit trail, one line per event — same append-only, never-log-secrets philosophy as the
 * platform's existing Claude Code hook (adapters/claude/hooks/audit.js), but a deliberately
 * *separate*, documented schema (see autonomous-runner/schemas/audit-schema.json), not an
 * attempted fit into shared/schemas/audit-schema.json. That schema's `event` enum is the fixed
 * set of Claude Code hook names (Stop/PostToolUse/SubagentStop) — it describes what a hook
 * observed about an interactive session, which this unattended loop's lifecycle events
 * (loop_start, phase_start, validate_result, ...) are not instances of. Reusing its `event`
 * enum would require it to lie about what happened; extending it would change a file other
 * consuming repos may already validate against. `schema_version` is carried here (own
 * versioning, not shared/schemas/audit-schema.json's) so the two are never confused for one
 * another. Never logs secrets, full tool inputs, or credentials — see
 * shared/rules/security.md "Never log" / this repo's CLAUDE.md.
 */
const SCHEMA_VERSION = '1.0';

export interface AuditEvent {
  ts: string;
  schema_version: string;
  taskId: string;
  event: string;
  [key: string]: unknown;
}

export class AuditLog {
  private readonly filePath: string;

  constructor(stateDir: string, taskId: string) {
    fs.mkdirSync(stateDir, { recursive: true });
    this.filePath = path.join(stateDir, `${taskId}.audit.jsonl`);
  }

  write(event: string, taskId: string, fields: Record<string, unknown> = {}): void {
    const entry: AuditEvent = {
      ts: new Date().toISOString(),
      schema_version: SCHEMA_VERSION,
      taskId,
      event,
      ...sanitize(fields),
    };
    fs.appendFileSync(this.filePath, JSON.stringify(entry) + '\n', 'utf8');
  }

  get path(): string {
    return this.filePath;
  }
}

function sanitize(fields: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (typeof value === 'string') {
      out[key] = truncate(redactSecrets(value), 500);
    } else if (Array.isArray(value)) {
      out[key] = value.map((v) => (typeof v === 'string' ? truncate(redactSecrets(v), 500) : v));
    } else {
      out[key] = value;
    }
  }
  return out;
}

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max) + '…' : text;
}
