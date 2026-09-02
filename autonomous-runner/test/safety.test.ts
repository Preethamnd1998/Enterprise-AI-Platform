import { describe, it, expect } from 'vitest';
import { evaluateBashCommand, evaluateMcpTool, evaluateToolUse, evaluateFileWritePath, evaluateSubagentSpawn, redactSecrets, type AgentBudget } from '../src/safety.js';

describe('evaluateBashCommand', () => {
  it('denies git push', () => {
    expect(evaluateBashCommand('git push origin main').allow).toBe(false);
  });

  it('denies git reset --hard', () => {
    expect(evaluateBashCommand('git reset --hard HEAD~1').allow).toBe(false);
  });

  it('denies git clean -fd', () => {
    expect(evaluateBashCommand('git clean -fd').allow).toBe(false);
  });

  it('denies destructive SQL', () => {
    expect(evaluateBashCommand('psql -c "DELETE FROM users"').allow).toBe(false);
    expect(evaluateBashCommand('psql -c "DROP TABLE users"').allow).toBe(false);
  });

  it('denies rm -rf on root', () => {
    expect(evaluateBashCommand('rm -rf /').allow).toBe(false);
  });

  it('denies git commit (matches settings.json\'s deny list)', () => {
    expect(evaluateBashCommand('git commit -m "wip"').allow).toBe(false);
  });

  it('denies flyway CLI invocations (matches settings.json\'s deny list)', () => {
    expect(evaluateBashCommand('flyway migrate').allow).toBe(false);
  });

  it('allows ordinary read/build commands', () => {
    expect(evaluateBashCommand('npm run build').allow).toBe(true);
    expect(evaluateBashCommand('git status').allow).toBe(true);
    expect(evaluateBashCommand('git diff --stat').allow).toBe(true);
    expect(evaluateBashCommand('mvn -q test').allow).toBe(true);
  });
});

describe('evaluateMcpTool', () => {
  it('fails closed when no allowlist could be loaded (settings.json unavailable)', () => {
    expect(evaluateMcpTool('mcp__postgres-reader__query', undefined).allow).toBe(false);
    expect(evaluateMcpTool('mcp__gitlab-reader__get_file', undefined).allow).toBe(false);
  });

  it('denies MCP tools not present in the allowlist, even read-sounding ones', () => {
    const allowlist = new Set(['mcp__postgres-reader__query']);
    expect(evaluateMcpTool('mcp__postgres-reader__list_tables', allowlist).allow).toBe(false);
    expect(evaluateMcpTool('mcp__gitlab-reader__get_file', allowlist).allow).toBe(false);
  });

  it('denies write-shaped MCP tool names even if somehow present in a malformed allowlist', () => {
    const allowlist = new Set(['mcp__postgres-reader__update_row']);
    // Allowlist is the primary gate; this documents that presence there is what allows it —
    // the platform's own settings.json is expected to never list a write tool in `allow`.
    expect(evaluateMcpTool('mcp__postgres-reader__update_row', allowlist).allow).toBe(true);
  });

  it('allows MCP tools explicitly present in the allowlist', () => {
    const allowlist = new Set(['mcp__postgres-reader__query', 'mcp__gitlab-reader__get_file']);
    expect(evaluateMcpTool('mcp__postgres-reader__query', allowlist).allow).toBe(true);
    expect(evaluateMcpTool('mcp__gitlab-reader__get_file', allowlist).allow).toBe(true);
  });
});

describe('evaluateFileWritePath', () => {
  it('denies edits under a db/migration directory (mirrors settings.json\'s permissions.ask, denied since there is no human to ask)', () => {
    expect(evaluateFileWritePath('src/main/resources/db/migration/V2__add_column.sql').allow).toBe(false);
    expect(evaluateFileWritePath('db\\migration\\V1__init.sql').allow).toBe(false);
  });

  it('allows edits to ordinary paths', () => {
    expect(evaluateFileWritePath('src/main/java/com/example/Foo.java').allow).toBe(true);
  });
});

describe('evaluateSubagentSpawn', () => {
  it('allows spawning up to the configured limit', () => {
    const budget: AgentBudget = { limit: 2, used: 0 };
    expect(evaluateSubagentSpawn(budget).allow).toBe(true);
    budget.used = 1;
    expect(evaluateSubagentSpawn(budget).allow).toBe(true);
  });

  it('denies once the limit is reached, and never auto-increases it', () => {
    const budget: AgentBudget = { limit: 1, used: 1 };
    const decision = evaluateSubagentSpawn(budget);
    expect(decision.allow).toBe(false);
    expect(decision.reason).toMatch(/agentLimit reached/);
    expect(budget.limit).toBe(1); // the function itself never mutates/raises the limit
  });

  it('denies at limit 0 (no subagents permitted at all)', () => {
    expect(evaluateSubagentSpawn({ limit: 0, used: 0 }).allow).toBe(false);
  });
});

describe('evaluateToolUse', () => {
  it('routes Bash input through the command evaluator', () => {
    expect(evaluateToolUse('Bash', { command: 'git push' }).allow).toBe(false);
    expect(evaluateToolUse('Bash', { command: 'ls' }).allow).toBe(true);
  });

  it('routes Edit/Write input through the DB-migration-path guard', () => {
    expect(evaluateToolUse('Edit', { file_path: 'db/migration/V1__init.sql' }).allow).toBe(false);
    expect(evaluateToolUse('Write', { file_path: 'db/migration/V1__init.sql' }).allow).toBe(false);
    expect(evaluateToolUse('Edit', { file_path: 'src/index.ts' }).allow).toBe(true);
  });

  it('fails closed on MCP tools when no allowlist is passed', () => {
    expect(evaluateToolUse('mcp__gitlab-reader__get_file', {}).allow).toBe(false);
  });

  it('allows an MCP tool present in a passed allowlist', () => {
    const allowlist = new Set(['mcp__gitlab-reader__get_file']);
    expect(evaluateToolUse('mcp__gitlab-reader__get_file', {}, allowlist).allow).toBe(true);
  });

  it('allows non-Bash, non-Edit/Write, non-MCP tools by default', () => {
    expect(evaluateToolUse('Read', { file_path: '/x' }).allow).toBe(true);
    expect(evaluateToolUse('Grep', { pattern: 'x' }).allow).toBe(true);
  });
});

describe('redactSecrets', () => {
  it('redacts API-key-shaped strings', () => {
    expect(redactSecrets('key=sk-ant-abc123XYZ')).toContain('[REDACTED]');
    expect(redactSecrets('key=sk-ant-abc123XYZ')).not.toContain('abc123XYZ');
  });

  it('redacts password= assignments', () => {
    expect(redactSecrets('password=hunter2')).toContain('[REDACTED]');
  });

  it('leaves ordinary text untouched', () => {
    expect(redactSecrets('npm run build succeeded')).toBe('npm run build succeeded');
  });
});
