import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadPlatformContext, loadMcpAllowlist, detectRepoLanguages } from '../src/contextLoader.js';
import type { RunnerConfig } from '../src/types.js';

const tmpDirs: string[] = [];
function mkTmp(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-runner-context-test-'));
  tmpDirs.push(dir);
  return dir;
}
afterEach(() => {
  for (const dir of tmpDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function write(root: string, relPath: string, content = 'content'): void {
  const full = path.join(root, relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, 'utf8');
}

/** Builds a minimal but structurally real platform root: contract kernel + every standards/rules/knowledge file the tests below reference. */
function makePlatformRoot(): string {
  const root = mkTmp();
  write(
    root,
    'shared/contract.md',
    '<!-- enterprise-ai-platform:kernel:start -->\nKernel body.\n<!-- enterprise-ai-platform:kernel:end -->\n',
  );
  write(root, 'shared/commands/dev.md', '# /dev spec');
  write(
    root,
    'shared/company-profile.md',
    [
      '# Company Profile',
      '',
      '## Custom Flow & Architecture Knowledge',
      '',
      '| Topic | Path | Covers |',
      '|---|---|---|',
      '| ABDM integration | `shared/knowledge/custom-flows/abdm/` | Backend + frontend ABDM (govt health-ID) integration |',
      '| BOM (Bill of Materials) | `shared/knowledge/custom-flows/bom/` | Functionality KB, non-stock indent consumption, stock reduction, adding BOM to bill, casesheet/OPD clinical integration |',
      '| Architecture reference | `shared/knowledge/architecture/` | Service map, dependencies, environments |',
    ].join('\n'),
  );
  write(root, 'shared/standards/coding-standards.md', 'coding standards body');
  write(root, 'shared/standards/backend/controller.md', 'controller standard');
  write(root, 'shared/standards/backend/service.md', 'service standard');
  write(root, 'shared/standards/backend/spring.md', 'spring standard');
  write(root, 'shared/standards/frontend/angular.md', 'angular standard');
  write(root, 'shared/standards/frontend/component.md', 'component standard');
  write(root, 'shared/standards/mobile/flutter.md', 'flutter standard');
  write(root, 'shared/standards/mobile/widget.md', 'widget standard');
  write(root, 'shared/standards/testing/README.md', 'testing index');
  write(root, 'shared/standards/testing/java-junit-mockito.md', 'junit standard');
  write(root, 'shared/standards/testing/angular-testing.md', 'angular testing standard');
  write(root, 'shared/standards/testing/test-case-design.md', 'generic test standard');
  write(root, 'shared/rules/coding-style.md', 'coding style rule');
  write(root, 'shared/rules/code-review.md', 'code review rule');
  write(root, 'shared/rules/testing.md', 'testing rule');
  write(root, 'shared/rules/security.md', 'security rule');
  write(root, 'shared/knowledge/custom-flows/abdm/abdm-integration-backend.md', 'abdm backend knowledge');
  write(root, 'shared/knowledge/custom-flows/abdm/abdm-integration-frontend.md', 'abdm frontend knowledge');
  write(root, 'shared/knowledge/custom-flows/bom/BOM_FUNCTIONALITY_KNOWLEDGE_BASE.md', 'bom knowledge');
  write(root, 'shared/knowledge/architecture/architecture.md', 'architecture knowledge');
  write(root, 'adapters/claude/config/settings.json', JSON.stringify({ permissions: { allow: ['mcp__gitlab-reader__get_file', 'mcp__postgres-reader__query'] } }));
  return root;
}

function makeConfig(platformRoot: string, repoPath: string): RunnerConfig {
  return {
    repoPath,
    taskFile: path.join(repoPath, 'TASK.md'),
    maxIterations: 3,
    maxToolCallsPerPhase: 40,
    maxBuildAttempts: 3,
    maxTestAttempts: 3,
    timeoutMs: 60_000,
    model: 'claude-opus-5',
    fallbackModel: 'claude-sonnet-5',
    yes: true,
    allowDirty: true,
    verbose: false,
    platformRoot,
    agentLimit: 1,
  };
}

describe('loadPlatformContext — standards (contract.md §5)', () => {
  it('loads only the Java layer(s) actually mentioned in the task, for a Java repo', () => {
    const platformRoot = makePlatformRoot();
    const repo = mkTmp();
    write(repo, 'pom.xml', '<project/>');
    const ctx = loadPlatformContext(makeConfig(platformRoot, repo), 'Add a new endpoint to the UserController.');
    const names = ctx.standards.map((s) => s.name);
    expect(names).toContain('coding-standards.md');
    expect(names).toContain('backend/controller.md');
    expect(names).not.toContain('backend/service.md');
    expect(names).not.toContain('frontend/angular.md');
  });

  it('falls back to spring.md for a Java repo when no specific layer keyword is mentioned', () => {
    const platformRoot = makePlatformRoot();
    const repo = mkTmp();
    write(repo, 'pom.xml', '<project/>');
    const ctx = loadPlatformContext(makeConfig(platformRoot, repo), 'Fix a bug.');
    expect(ctx.standards.map((s) => s.name)).toContain('backend/spring.md');
  });

  it('never loads frontend/mobile standards for a Java-only repo, even if the task text happens to mention "component"', () => {
    const platformRoot = makePlatformRoot();
    const repo = mkTmp();
    write(repo, 'pom.xml', '<project/>');
    const ctx = loadPlatformContext(makeConfig(platformRoot, repo), 'The service component needs a fix.');
    const names = ctx.standards.map((s) => s.name);
    expect(names).not.toContain('frontend/component.md');
    expect(names).not.toContain('mobile/widget.md');
  });

  it('loads the matching Angular topic for an Angular repo', () => {
    const platformRoot = makePlatformRoot();
    const repo = mkTmp();
    write(repo, 'angular.json', '{}');
    const ctx = loadPlatformContext(makeConfig(platformRoot, repo), 'Update the user list component.');
    expect(ctx.standards.map((s) => s.name)).toContain('frontend/component.md');
  });

  it('loads the matching Flutter topic for a Flutter repo', () => {
    const platformRoot = makePlatformRoot();
    const repo = mkTmp();
    write(repo, 'pubspec.yaml', 'name: app');
    const ctx = loadPlatformContext(makeConfig(platformRoot, repo), 'Fix the login widget.');
    expect(ctx.standards.map((s) => s.name)).toContain('mobile/widget.md');
  });

  it('loads testing/README.md plus the language-appropriate topic file when the task is about tests', () => {
    const platformRoot = makePlatformRoot();
    const repo = mkTmp();
    write(repo, 'pom.xml', '<project/>');
    const ctx = loadPlatformContext(makeConfig(platformRoot, repo), 'Write a JUnit test for the controller.');
    const names = ctx.standards.map((s) => s.name);
    expect(names).toContain('testing/README.md');
    expect(names).toContain('testing/java-junit-mockito.md');
  });

  it('loads coding-standards.md unconditionally, even for a repo with no recognized language marker', () => {
    const platformRoot = makePlatformRoot();
    const repo = mkTmp();
    const ctx = loadPlatformContext(makeConfig(platformRoot, repo), 'Do something.');
    expect(ctx.standards.map((s) => s.name)).toEqual(['coding-standards.md']);
  });
});

describe('loadPlatformContext — rules (contract.md §5 lazy-rules)', () => {
  it('always loads coding-style.md and code-review.md', () => {
    const platformRoot = makePlatformRoot();
    const repo = mkTmp();
    const ctx = loadPlatformContext(makeConfig(platformRoot, repo), 'Do something unrelated.');
    const names = ctx.rules.map((r) => r.name);
    expect(names).toContain('coding-style.md');
    expect(names).toContain('code-review.md');
    expect(names).not.toContain('testing.md');
    expect(names).not.toContain('security.md');
  });

  it('loads testing.md when the task involves tests', () => {
    const platformRoot = makePlatformRoot();
    const repo = mkTmp();
    const ctx = loadPlatformContext(makeConfig(platformRoot, repo), 'Add a unit test for this.');
    expect(ctx.rules.map((r) => r.name)).toContain('testing.md');
  });

  it('loads security.md when the task involves auth/secrets/PII', () => {
    const platformRoot = makePlatformRoot();
    const repo = mkTmp();
    const ctx = loadPlatformContext(makeConfig(platformRoot, repo), 'Fix the auth token validation.');
    expect(ctx.rules.map((r) => r.name)).toContain('security.md');
  });
});

describe('loadPlatformContext — company profile & knowledge (F10 seam)', () => {
  it('loads company-profile.md unconditionally', () => {
    const platformRoot = makePlatformRoot();
    const repo = mkTmp();
    const ctx = loadPlatformContext(makeConfig(platformRoot, repo), 'Anything.');
    expect(ctx.companyProfile).toContain('Company Profile');
  });

  it('loads the matching knowledge topic\'s files when the task mentions it, not the whole directory', () => {
    const platformRoot = makePlatformRoot();
    const repo = mkTmp();
    const ctx = loadPlatformContext(makeConfig(platformRoot, repo), 'Fix the ABDM integration flow.');
    const names = ctx.knowledge.map((k) => k.name);
    expect(names.some((n) => n.includes('abdm-integration-backend.md'))).toBe(true);
    expect(names.some((n) => n.includes('abdm-integration-frontend.md'))).toBe(true);
    expect(names.some((n) => n.includes('architecture.md'))).toBe(false);
  });

  it('loads no knowledge topics when the task does not match any', () => {
    const platformRoot = makePlatformRoot();
    const repo = mkTmp();
    const ctx = loadPlatformContext(makeConfig(platformRoot, repo), 'Totally unrelated task.');
    expect(ctx.knowledge).toEqual([]);
  });

  it('does not cross-match an unrelated topic that merely shares a generic Covers-column word (regression)', () => {
    // ABDM's own Covers text and BOM's Covers text both contain "integration" — matching should
    // never key off Covers at all (Topic column only), so an ABDM task must not also pull in BOM.
    const platformRoot = makePlatformRoot();
    const repo = mkTmp();
    const ctx = loadPlatformContext(makeConfig(platformRoot, repo), 'Fix the ABDM integration for patient health ID lookup.');
    const names = ctx.knowledge.map((k) => k.name);
    expect(names.some((n) => n.includes('abdm'))).toBe(true);
    expect(names.some((n) => n.toLowerCase().includes('bom'))).toBe(false);
  });
});

describe('detectRepoLanguages', () => {
  it('detects java-spring from pom.xml', () => {
    const repo = mkTmp();
    write(repo, 'pom.xml', '<project/>');
    expect(detectRepoLanguages(repo)).toContain('java-spring');
  });

  it('detects angular from angular.json', () => {
    const repo = mkTmp();
    write(repo, 'angular.json', '{}');
    expect(detectRepoLanguages(repo)).toContain('angular');
  });

  it('returns an empty list for a repo with no recognized marker', () => {
    const repo = mkTmp();
    expect(detectRepoLanguages(repo)).toEqual([]);
  });
});

describe('loadMcpAllowlist', () => {
  it('loads the mcp__ tool names from adapters/claude/config/settings.json permissions.allow', () => {
    const platformRoot = makePlatformRoot();
    const allowlist = loadMcpAllowlist(platformRoot);
    expect(allowlist).toBeDefined();
    expect(allowlist!.has('mcp__gitlab-reader__get_file')).toBe(true);
    expect(allowlist!.has('mcp__postgres-reader__query')).toBe(true);
    expect(allowlist!.has('mcp__postgres-reader__delete_row')).toBe(false);
  });

  it('returns undefined when settings.json does not exist', () => {
    const platformRoot = mkTmp();
    expect(loadMcpAllowlist(platformRoot)).toBeUndefined();
  });
});
