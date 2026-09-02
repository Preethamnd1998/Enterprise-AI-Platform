import fs from 'node:fs';
import path from 'node:path';
import type { McpServerConfig } from '@anthropic-ai/claude-agent-sdk';
import type { RunnerConfig } from './types.js';

/**
 * Loads the platform's existing shared assets (contract kernel, /dev command spec, standards,
 * rules, company profile/knowledge, MCP config) rather than re-describing agent behavior from
 * scratch. This is the same "lazy loading" discipline the contract itself mandates
 * (shared/contract.md §5/§F10): read only what the task actually touches, never bulk-load a
 * directory. The topic tables below are a direct, file-checked transcription of contract.md §5's
 * decision table and company-profile.md's knowledge topic table — not a smaller ad hoc subset.
 */
export interface PlatformContext {
  contractKernel: string;
  devCommandSpec: string;
  companyProfile: string;
  standards: { name: string; content: string }[];
  rules: { name: string; content: string }[];
  knowledge: { name: string; content: string }[];
  referencedContextFiles: { name: string; content: string }[];
}

function readIfExists(filePath: string): string | undefined {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return undefined;
  }
}

function extractKernel(contractMd: string): string {
  const start = '<!-- enterprise-ai-platform:kernel:start -->';
  const end = '<!-- enterprise-ai-platform:kernel:end -->';
  const startIdx = contractMd.indexOf(start);
  const endIdx = contractMd.indexOf(end);
  if (startIdx === -1 || endIdx === -1) return contractMd;
  return contractMd.slice(startIdx, endIdx + end.length);
}

/** Marker files used to scope which language-specific topic tables even apply — never a repo-wide scan. */
const LANGUAGE_MARKERS: { file: string; label: 'java-spring' | 'angular' | 'flutter' }[] = [
  { file: 'pom.xml', label: 'java-spring' },
  { file: 'build.gradle', label: 'java-spring' },
  { file: 'build.gradle.kts', label: 'java-spring' },
  { file: 'angular.json', label: 'angular' },
  { file: 'pubspec.yaml', label: 'flutter' },
];

export function detectRepoLanguages(repoPath: string): string[] {
  const found = new Set<string>();
  for (const marker of LANGUAGE_MARKERS) {
    if (fs.existsSync(path.join(repoPath, marker.file))) found.add(marker.label);
  }
  return [...found];
}

interface TopicRule {
  file: string;
  trigger: RegExp;
}

/**
 * Trailing-boundary-only word match: real tasks name classes in PascalCase (`UserController`,
 * `OrderRepository`, `LoginComponent`), where a leading `\b` would never fire because there is
 * no word-character boundary between "User" and "Controller". A trailing `\b` still keeps
 * "controllerish" from matching "controller" while rejecting accidental substrings before it.
 */
function suffix(word: string): RegExp {
  return new RegExp(`${word}\\b`, 'i');
}

/** contract.md §5: "Java / Spring → backend/<layer>.md (only layers touched: ...)" */
const BACKEND_TOPICS: TopicRule[] = [
  { file: 'backend/controller.md', trigger: /controller\b|@RestController|@Controller\b/i },
  { file: 'backend/service.md', trigger: /service\b|@Service\b/i },
  { file: 'backend/repository.md', trigger: /repositor(y|ies)\b|@Repository\b|\bJPA\b/i },
  { file: 'backend/entity.md', trigger: /entit(y|ies)\b|@Entity\b/i },
  { file: 'backend/dto-mapper-enum.md', trigger: /DTOs?\b|mapper\b|enum\b/i },
  { file: 'backend/common-api.md', trigger: /common[- ]api/i },
  { file: 'backend/custom-annotations.md', trigger: /custom annotation|@interface\b/i },
  { file: 'backend/sql-query.md', trigger: /\bSQL\b|@Query\b|native query\b/i },
  { file: 'backend/db-migration.md', trigger: /flyway\b|db[- ]?migration|\bV\d+__/i },
  { file: 'backend/spring.md', trigger: /spring\b|@Autowired|@Bean\b|@Component\b|@Configuration\b/i },
];

/** contract.md §5: "Angular / TS → frontend/<topic>.md (only topics touched: ...)" */
const FRONTEND_TOPICS: TopicRule[] = [
  { file: 'frontend/component.md', trigger: /component\b|\.component\.ts\b/i },
  { file: 'frontend/service.md', trigger: /service\b|\.service\.ts\b/i },
  { file: 'frontend/custom-components.md', trigger: /custom component/i },
  { file: 'frontend/pagination.md', trigger: /pagination\b|page[d]?\b.*list\b/i },
  { file: 'frontend/others.md', trigger: /misc(ellaneous)?\b|\bother\b.*pattern/i },
  { file: 'frontend/angular.md', trigger: /angular\b|\.module\.ts\b|@NgModule\b/i },
  { file: 'frontend/app-shell-menu-config-cache.md', trigger: /app[- ]?shell|menu config/i },
  { file: 'frontend/global-filter-search.md', trigger: /global filter|global search/i },
  { file: 'frontend/modern-clinical-enterprise-design-system.md', trigger: /design system|clinical enterprise/i },
];

/** contract.md §5: "Flutter / Dart → mobile/<topic>.md (only topics touched: ...)" */
const MOBILE_TOPICS: TopicRule[] = [
  { file: 'mobile/widget.md', trigger: suffix('widget') },
  { file: 'mobile/service.md', trigger: suffix('service') },
  { file: 'mobile/state-management.md', trigger: /bloc\b|cubit\b|state management|provider\b/i },
  { file: 'mobile/routing.md', trigger: /routing\b|go_router|navigator\b/i },
  { file: 'mobile/models.md', trigger: suffix('model') },
  { file: 'mobile/flutter.md', trigger: /flutter\b|\bdart\b/i },
];

/** contract.md §5: "Migration task → migration/semantic-git.md, migration/cherry-pick-rules.md" */
const GIT_MIGRATION_KEYWORDS = /\bcherry-?pick\b|\bbackport\b|migrat(e|ion).{0,20}\bbranch\b/i;

/** contract.md §5: "SQL / Flyway → backend/repository.md + migration/ DB sections" (backend/db-migration.md is the actual DB-migration file on disk). */
const SQL_FLYWAY_KEYWORDS = /\bflyway\b|db[- ]?migration|\.sql\b|\bV\d+__/i;

/** contract.md §5: "Writing/reviewing tests → testing/README.md first, then the matching topic file(s)". */
const TEST_KEYWORDS = /\btests?\b|\btesting\b|\bspec(s)?\b|\bassert(ion)?s?\b|\bjunit\b|\bmockito\b|\bjest\b|\bplaywright\b|\bcoverage\b/i;

/** contract.md §5 rules: "Any change involving tests → rules/testing.md"; security/code-review as below. */
const SECURITY_KEYWORDS = /\b(auth|permission|password|secret|token|pii|phi|abha|aadhaar)\b/i;

function pushMatches(taskContent: string, topics: TopicRule[], into: Set<string>): void {
  for (const t of topics) if (t.trigger.test(taskContent)) into.add(t.file);
}

/** Resolves the matched standards file set per contract.md §5 — a real decision table, not a hardcoded single-file guess. */
function resolveStandardsFiles(taskContent: string, repoLangs: string[]): string[] {
  const matched = new Set<string>();

  if (repoLangs.includes('java-spring')) {
    const before = matched.size;
    pushMatches(taskContent, BACKEND_TOPICS, matched);
    // No specific layer keyword matched but this is a Java repo: fall back to the general
    // framework standard rather than loading nothing for an otherwise-in-scope language.
    if (matched.size === before) matched.add('backend/spring.md');
  }
  if (repoLangs.includes('angular')) {
    const before = matched.size;
    pushMatches(taskContent, FRONTEND_TOPICS, matched);
    if (matched.size === before) matched.add('frontend/angular.md');
  }
  if (repoLangs.includes('flutter')) {
    const before = matched.size;
    pushMatches(taskContent, MOBILE_TOPICS, matched);
    if (matched.size === before) matched.add('mobile/flutter.md');
  }

  if (SQL_FLYWAY_KEYWORDS.test(taskContent)) {
    matched.add('backend/repository.md');
    matched.add('backend/db-migration.md');
  }

  if (GIT_MIGRATION_KEYWORDS.test(taskContent)) {
    matched.add('migration/semantic-git.md');
    matched.add('migration/cherry-pick-rules.md');
  }

  return [...matched];
}

/** contract.md §5's testing branch: the index file first, then exactly one language-appropriate topic file. */
function resolveTestingStandardsFiles(taskContent: string, repoLangs: string[]): string[] {
  if (!TEST_KEYWORDS.test(taskContent)) return [];
  const files = ['testing/README.md'];
  if (repoLangs.includes('java-spring')) files.push('testing/java-junit-mockito.md');
  else if (repoLangs.includes('angular')) files.push('testing/angular-testing.md');
  else files.push('testing/test-case-design.md');
  return files;
}

function resolveRulesFiles(taskContent: string): string[] {
  // "Any change involving production code" / "any code review or Gate A validation" — every
  // /dev execution writes production code and runs a completeness (Gate A) check, so both are
  // unconditional, matching contract.md §5's "mandatory, never optional" framing for coding-style.
  const files = ['coding-style.md', 'code-review.md'];
  if (TEST_KEYWORDS.test(taskContent)) files.push('testing.md');
  if (SECURITY_KEYWORDS.test(taskContent)) files.push('security.md');
  return files;
}

/** Generic enough to appear in more than one knowledge topic's name — excluded so a task about
 *  one domain doesn't accidentally pull in an unrelated one that merely shares this word. */
const GENERIC_TOPIC_WORDS = new Set(['integration', 'reference', 'framework', 'management']);

/**
 * F10 seam: reads company-profile.md's own knowledge topic table (never hardcoded here) and
 * loads only the files under a matched topic's directory — not shared/knowledge/ wholesale.
 */
function resolveKnowledgeTopics(platformRoot: string, companyProfile: string, taskContent: string): { name: string; content: string }[] {
  const rowPattern = /\|\s*([^|]+?)\s*\|\s*`(shared\/knowledge\/[^`]+)`\s*\|\s*([^|]+?)\s*\|/g;
  const haystack = taskContent.toLowerCase();
  const results: { name: string; content: string }[] = [];
  const seenDirs = new Set<string>();

  for (const rowMatch of companyProfile.matchAll(rowPattern)) {
    const [, topic, relPath] = rowMatch;
    // Match on the Topic column only, not "Covers" — Covers is a longer free-text description
    // and shares generic words (e.g. "integration", "architecture") across unrelated rows,
    // which caused real false-positive cross-matches (an ABDM task also pulling in BOM). Topic
    // names are short and specific by design; that specificity is what should drive the match.
    const words = topic
      .toLowerCase()
      .replace(/[()]/g, ' ')
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length >= 4 && !GENERIC_TOPIC_WORDS.has(w));
    const isMatch = words.some((w) => haystack.includes(w));
    if (!isMatch) continue;

    const dirPath = path.join(platformRoot, relPath);
    if (seenDirs.has(dirPath)) continue;
    seenDirs.add(dirPath);

    try {
      const stat = fs.statSync(dirPath);
      if (stat.isDirectory()) {
        for (const entry of fs.readdirSync(dirPath)) {
          if (!entry.endsWith('.md')) continue;
          const content = readIfExists(path.join(dirPath, entry));
          if (content) results.push({ name: `${relPath}${relPath.endsWith('/') ? '' : '/'}${entry}`, content });
        }
      } else {
        const content = readIfExists(dirPath);
        if (content) results.push({ name: relPath, content });
      }
    } catch {
      // Topic listed in company-profile.md but its path doesn't exist on disk — skip, don't fail the run.
    }
  }
  return results;
}

export function loadPlatformContext(config: RunnerConfig, taskContent: string): PlatformContext {
  const sharedRoot = path.join(config.platformRoot, 'shared');
  const repoLangs = detectRepoLanguages(config.repoPath);

  const contractMd = readIfExists(path.join(sharedRoot, 'contract.md')) ?? '';
  const devSpec = readIfExists(path.join(sharedRoot, 'commands', 'dev.md')) ?? '';
  const companyProfile = readIfExists(path.join(sharedRoot, 'company-profile.md')) ?? '';

  const standards: { name: string; content: string }[] = [];
  const codingStandards = readIfExists(path.join(sharedRoot, 'standards', 'coding-standards.md'));
  if (codingStandards) standards.push({ name: 'coding-standards.md', content: codingStandards });

  const standardsFiles = [...resolveStandardsFiles(taskContent, repoLangs), ...resolveTestingStandardsFiles(taskContent, repoLangs)];
  for (const file of standardsFiles) {
    const content = readIfExists(path.join(sharedRoot, 'standards', file));
    if (content) standards.push({ name: file, content });
  }

  const rules: { name: string; content: string }[] = [];
  for (const file of resolveRulesFiles(taskContent)) {
    const content = readIfExists(path.join(sharedRoot, 'rules', file));
    if (content) rules.push({ name: file, content });
  }

  const knowledge = companyProfile ? resolveKnowledgeTopics(config.platformRoot, companyProfile, taskContent) : [];

  // dev.md Context Folder rule: only load context/ files the task file explicitly references —
  // never enumerate the directory.
  const referencedContextFiles: { name: string; content: string }[] = [];
  const contextRefPattern = /context\/[A-Za-z0-9_\-./]+\.(md|txt)/g;
  const refs = new Set(taskContent.match(contextRefPattern) ?? []);
  for (const ref of refs) {
    const content = readIfExists(path.join(config.repoPath, ref));
    if (content) referencedContextFiles.push({ name: ref, content });
  }

  return {
    contractKernel: extractKernel(contractMd),
    devCommandSpec: devSpec,
    companyProfile,
    standards,
    rules,
    knowledge,
    referencedContextFiles,
  };
}

/** Platform's ${env:VAR} substitution convention (shared/mcp/.mcp.json.template) applied to a target repo's .mcp.json. */
function substituteEnv(value: string): string {
  return value.replace(/\$\{env:([A-Z0-9_]+)\}/gi, (_, name) => process.env[name] ?? '');
}

function substituteEnvDeep<T>(value: T): T {
  if (typeof value === 'string') return substituteEnv(value) as unknown as T;
  if (Array.isArray(value)) return value.map(substituteEnvDeep) as unknown as T;
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = substituteEnvDeep(v);
    return out as T;
  }
  return value;
}

/**
 * Reuses a target repo's own .mcp.json (per shared/mcp/.mcp.json.template convention) if present.
 * We do not invent new MCP servers here — only read-only servers should ever appear in that
 * file per shared/mcp/tool-allowlists.md, and safety.ts's evaluateMcpTool fail-closes against
 * loadMcpAllowlist() below regardless of what this file configures.
 */
export function loadMcpServers(config: RunnerConfig): Record<string, McpServerConfig> | undefined {
  const mcpPath = path.join(config.repoPath, '.mcp.json');
  const raw = readIfExists(mcpPath);
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw) as { mcpServers?: Record<string, unknown> };
    if (!parsed.mcpServers) return undefined;
    const cleaned: Record<string, unknown> = {};
    for (const [name, cfg] of Object.entries(parsed.mcpServers)) {
      if (typeof cfg === 'object' && cfg !== null) {
        const { _comment, ...rest } = cfg as Record<string, unknown>;
        cleaned[name] = substituteEnvDeep(rest);
      }
    }
    return cleaned as Record<string, McpServerConfig>;
  } catch {
    return undefined;
  }
}

/**
 * Single source of truth for which MCP tools may run: the platform's own
 * adapters/claude/config/settings.json `permissions.allow` list — the same file the interactive
 * Claude Code adapter is installed with. Returns undefined (fail-closed for every mcp__ tool,
 * see safety.ts#evaluateMcpTool) if that file can't be read or parsed.
 */
export function loadMcpAllowlist(platformRoot: string): Set<string> | undefined {
  const settingsPath = path.join(platformRoot, 'adapters', 'claude', 'config', 'settings.json');
  const raw = readIfExists(settingsPath);
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw) as { permissions?: { allow?: unknown } };
    const allow = parsed.permissions?.allow;
    if (!Array.isArray(allow)) return undefined;
    return new Set(allow.filter((t): t is string => typeof t === 'string' && t.startsWith('mcp__')));
  } catch {
    return undefined;
  }
}
