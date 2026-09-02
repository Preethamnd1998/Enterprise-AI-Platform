import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildConfig, resolvePlatformRoot } from '../src/config.js';

const tmpDirs: string[] = [];
function mkTmp(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-runner-config-test-'));
  tmpDirs.push(dir);
  return dir;
}
afterEach(() => {
  for (const dir of tmpDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function makeFakeRepo(): string {
  const repo = mkTmp();
  fs.mkdirSync(path.join(repo, '.git'));
  fs.writeFileSync(path.join(repo, 'TASK.md'), '# Task\nDo the thing.');
  return repo;
}

describe('resolvePlatformRoot', () => {
  it('finds the platform root by walking up to shared/commands/dev.md', () => {
    // __dirname of this test file is inside the real autonomous-runner checkout.
    const root = resolvePlatformRoot(path.join(__dirname, '..', 'src'));
    expect(fs.existsSync(path.join(root, 'shared', 'commands', 'dev.md'))).toBe(true);
  });

  it('throws when no platform root is found above the given directory', () => {
    const isolated = mkTmp();
    expect(() => resolvePlatformRoot(isolated)).toThrow();
  });
});

describe('buildConfig', () => {
  it('rejects a --repo path that is not a git repository', () => {
    const notARepo = mkTmp();
    fs.writeFileSync(path.join(notARepo, 'TASK.md'), '# Task');
    expect(() =>
      buildConfig({ repo: notARepo, task: 'TASK.md' }, path.join(__dirname, '..', 'src')),
    ).toThrow(/not a Git repository/);
  });

  it('rejects a missing --task file', () => {
    const repo = makeFakeRepo();
    expect(() =>
      buildConfig({ repo, task: 'MISSING.md' }, path.join(__dirname, '..', 'src')),
    ).toThrow(/--task file not found/);
  });

  it('applies defaults when optional flags are omitted', () => {
    const repo = makeFakeRepo();
    const config = buildConfig({ repo, task: 'TASK.md' }, path.join(__dirname, '..', 'src'));
    expect(config.maxIterations).toBe(5);
    expect(config.maxBuildAttempts).toBe(3);
    expect(config.maxTestAttempts).toBe(3);
    expect(config.model).toBe('claude-opus-5');
    expect(config.yes).toBe(false);
    expect(config.agentLimit).toBe(1);
  });

  it('rejects a non-positive-integer override', () => {
    const repo = makeFakeRepo();
    expect(() =>
      buildConfig({ repo, task: 'TASK.md', maxIterations: '0' }, path.join(__dirname, '..', 'src')),
    ).toThrow(/Invalid --max-iterations/);
    expect(() =>
      buildConfig({ repo, task: 'TASK.md', maxIterations: 'abc' }, path.join(__dirname, '..', 'src')),
    ).toThrow(/Invalid --max-iterations/);
  });
});

describe('buildConfig — agentLimit', () => {
  it('defaults agentLimit to 1 when --agent-limit is omitted', () => {
    const repo = makeFakeRepo();
    const config = buildConfig({ repo, task: 'TASK.md' }, path.join(__dirname, '..', 'src'));
    expect(config.agentLimit).toBe(1);
  });

  it('accepts an explicit --agent-limit within range (0-3)', () => {
    const repo = makeFakeRepo();
    expect(buildConfig({ repo, task: 'TASK.md', agentLimit: '0' }, path.join(__dirname, '..', 'src')).agentLimit).toBe(0);
    expect(buildConfig({ repo, task: 'TASK.md', agentLimit: '2' }, path.join(__dirname, '..', 'src')).agentLimit).toBe(2);
    expect(buildConfig({ repo, task: 'TASK.md', agentLimit: '3' }, path.join(__dirname, '..', 'src')).agentLimit).toBe(3);
  });

  it('rejects a negative --agent-limit', () => {
    const repo = makeFakeRepo();
    expect(() =>
      buildConfig({ repo, task: 'TASK.md', agentLimit: '-1' }, path.join(__dirname, '..', 'src')),
    ).toThrow(/Invalid --agent-limit/);
  });

  it('rejects a non-integer --agent-limit', () => {
    const repo = makeFakeRepo();
    expect(() =>
      buildConfig({ repo, task: 'TASK.md', agentLimit: 'abc' }, path.join(__dirname, '..', 'src')),
    ).toThrow(/Invalid --agent-limit/);
  });

  it('rejects --agent-limit above the platform\'s bounded-subagent ceiling of 3, and never silently raises it', () => {
    const repo = makeFakeRepo();
    expect(() =>
      buildConfig({ repo, task: 'TASK.md', agentLimit: '4' }, path.join(__dirname, '..', 'src')),
    ).toThrow(/exceeds the platform's bounded-subagent ceiling/);
    expect(() =>
      buildConfig({ repo, task: 'TASK.md', agentLimit: '1000' }, path.join(__dirname, '..', 'src')),
    ).toThrow(/exceeds the platform's bounded-subagent ceiling/);
  });
});
