import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { isWorkingTreeDirty, changedFiles } from '../src/gitUtils.js';

const tmpDirs: string[] = [];
function mkTmp(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-runner-gitutils-test-'));
  tmpDirs.push(dir);
  return dir;
}
afterEach(() => {
  for (const dir of tmpDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function initRepo(): string {
  const repo = mkTmp();
  execFileSync('git', ['init', '-q'], { cwd: repo });
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: repo });
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: repo });
  fs.writeFileSync(path.join(repo, 'README.md'), '# fixture\n');
  execFileSync('git', ['add', '-A'], { cwd: repo });
  execFileSync('git', ['commit', '-qm', 'init'], { cwd: repo });
  return repo;
}

describe('isWorkingTreeDirty', () => {
  it('is false on a genuinely clean tree', () => {
    const repo = initRepo();
    expect(isWorkingTreeDirty(repo)).toBe(false);
  });

  it('is true when a tracked file is modified', () => {
    const repo = initRepo();
    fs.writeFileSync(path.join(repo, 'README.md'), '# changed\n');
    expect(isWorkingTreeDirty(repo)).toBe(true);
  });

  it('is true when a real untracked file exists', () => {
    const repo = initRepo();
    fs.writeFileSync(path.join(repo, 'new-file.txt'), 'hello\n');
    expect(isWorkingTreeDirty(repo)).toBe(true);
  });

  it('is NOT dirty from the runner\'s own .ai-runner-state/ bookkeeping directory alone (regression)', () => {
    const repo = initRepo();
    fs.mkdirSync(path.join(repo, '.ai-runner-state', 'state'), { recursive: true });
    fs.writeFileSync(path.join(repo, '.ai-runner-state', 'state', 'some-task.state.json'), '{}');
    expect(isWorkingTreeDirty(repo)).toBe(false);
  });

  it('still reports dirty for a real change even when .ai-runner-state/ is also present', () => {
    const repo = initRepo();
    fs.mkdirSync(path.join(repo, '.ai-runner-state', 'state'), { recursive: true });
    fs.writeFileSync(path.join(repo, '.ai-runner-state', 'state', 'some-task.state.json'), '{}');
    fs.writeFileSync(path.join(repo, 'README.md'), '# changed\n');
    expect(isWorkingTreeDirty(repo)).toBe(true);
  });
});

describe('changedFiles', () => {
  it('does not list .ai-runner-state/ entries (regression)', () => {
    const repo = initRepo();
    fs.mkdirSync(path.join(repo, '.ai-runner-state', 'state'), { recursive: true });
    fs.writeFileSync(path.join(repo, '.ai-runner-state', 'state', 'some-task.state.json'), '{}');
    fs.writeFileSync(path.join(repo, 'src.txt'), 'hi\n');
    const files = changedFiles(repo);
    expect(files.some((f) => f.includes('.ai-runner-state'))).toBe(false);
    expect(files).toContain('src.txt');
  });

  it('returns an empty list on a clean tree', () => {
    const repo = initRepo();
    expect(changedFiles(repo)).toEqual([]);
  });
});
