import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { detectProjectCommands } from '../src/validator.js';

const tmpDirs: string[] = [];
function mkTmp(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-runner-validator-test-'));
  tmpDirs.push(dir);
  return dir;
}
afterEach(() => {
  for (const dir of tmpDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe('detectProjectCommands', () => {
  it('detects a Maven project', () => {
    const repo = mkTmp();
    fs.writeFileSync(path.join(repo, 'pom.xml'), '<project/>');
    const cmds = detectProjectCommands(repo);
    expect(cmds.kind).toBe('maven');
    expect(cmds.build).toContain('mvn');
    expect(cmds.test).toContain('mvn');
  });

  it('detects a Gradle project', () => {
    const repo = mkTmp();
    fs.writeFileSync(path.join(repo, 'build.gradle'), '');
    const cmds = detectProjectCommands(repo);
    expect(cmds.kind).toBe('gradle');
  });

  it('detects an npm project with build+test scripts', () => {
    const repo = mkTmp();
    fs.writeFileSync(
      path.join(repo, 'package.json'),
      JSON.stringify({ scripts: { build: 'tsc', test: 'vitest run' } }),
    );
    const cmds = detectProjectCommands(repo);
    expect(cmds.kind).toBe('npm');
    expect(cmds.build).toBe('npm run build');
    expect(cmds.test).toBe('npm test');
  });

  it('treats the CRA placeholder test script as absent', () => {
    const repo = mkTmp();
    fs.writeFileSync(
      path.join(repo, 'package.json'),
      JSON.stringify({ scripts: { test: 'echo "Error: no test specified" && exit 1' } }),
    );
    const cmds = detectProjectCommands(repo);
    expect(cmds.test).toBeUndefined();
  });

  it('returns kind "none" when no recognized project file exists', () => {
    const repo = mkTmp();
    const cmds = detectProjectCommands(repo);
    expect(cmds.kind).toBe('none');
    expect(cmds.build).toBeUndefined();
    expect(cmds.test).toBeUndefined();
  });
});
