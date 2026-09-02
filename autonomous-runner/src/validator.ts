import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import type { RunnerConfig, ValidationResult } from './types.js';
import { runQuery } from './worker.js';
import { reviewPrompt, REVIEW_OUTPUT_SCHEMA } from './prompts.js';
import type { PlatformContext } from './contextLoader.js';
import { buildPreamble } from './prompts.js';
import { loadMcpServers } from './contextLoader.js';

interface CommandResult {
  ran: boolean;
  pass: boolean;
  summary: string;
}

const COMMAND_TIMEOUT_MS = 10 * 60 * 1000;
const OUTPUT_TAIL_CHARS = 4000;

function runShell(command: string, cwd: string): { code: number | null; output: string } {
  const res = spawnSync(command, { cwd, shell: true, encoding: 'utf8', timeout: COMMAND_TIMEOUT_MS });
  const output = `${res.stdout ?? ''}\n${res.stderr ?? ''}`.trim();
  if (res.error) {
    return { code: null, output: `${output}\n${res.error.message}`.trim() };
  }
  return { code: res.status, output };
}

function tail(text: string, max = OUTPUT_TAIL_CHARS): string {
  return text.length > max ? '…' + text.slice(text.length - max) : text;
}

interface DetectedCommands {
  build?: string;
  test?: string;
  kind: 'maven' | 'gradle' | 'npm' | 'none';
}

export function detectProjectCommands(repoPath: string): DetectedCommands {
  if (fs.existsSync(path.join(repoPath, 'pom.xml'))) {
    return { kind: 'maven', build: 'mvn -q -DskipTests compile', test: 'mvn -q test' };
  }
  const gradleWrapper = process.platform === 'win32' ? 'gradlew.bat' : './gradlew';
  if (fs.existsSync(path.join(repoPath, 'build.gradle')) || fs.existsSync(path.join(repoPath, 'build.gradle.kts'))) {
    const wrapper = fs.existsSync(path.join(repoPath, process.platform === 'win32' ? 'gradlew.bat' : 'gradlew'))
      ? gradleWrapper
      : 'gradle';
    return { kind: 'gradle', build: `${wrapper} build -x test`, test: `${wrapper} test` };
  }
  const pkgPath = path.join(repoPath, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as { scripts?: Record<string, string> };
      const scripts = pkg.scripts ?? {};
      const build = scripts.build ? 'npm run build' : undefined;
      const test = scripts.test && !/no test specified/i.test(scripts.test) ? 'npm test' : undefined;
      return { kind: 'npm', build, test };
    } catch {
      return { kind: 'npm' };
    }
  }
  return { kind: 'none' };
}

export function runBuild(repoPath: string, command: string | undefined): CommandResult {
  if (!command) return { ran: false, pass: true, summary: 'No build command detected for this project type — skipped.' };
  const { code, output } = runShell(command, repoPath);
  return { ran: true, pass: code === 0, summary: `$ ${command}\nexit ${code}\n${tail(output)}` };
}

export function runTests(repoPath: string, command: string | undefined): CommandResult {
  if (!command) return { ran: false, pass: true, summary: 'No test command detected for this project type — skipped.' };
  const { code, output } = runShell(command, repoPath);
  return { ran: true, pass: code === 0, summary: `$ ${command}\nexit ${code}\n${tail(output)}` };
}

/** Separate SDK session, read-only tools only — the Validator never edits files. */
export async function runLlmReview(params: {
  config: RunnerConfig;
  platformCtx: PlatformContext;
  taskContent: string;
  plan: string;
  mcpAllowlist?: Set<string>;
}): Promise<{ ran: boolean; pass: boolean; summary: string; reasons: string[] }> {
  try {
    const result = await runQuery({
      prompt: reviewPrompt(params.taskContent, params.plan),
      systemPrompt: buildPreamble(params.platformCtx),
      cwd: params.config.repoPath,
      model: params.config.model,
      fallbackModel: params.config.fallbackModel,
      maxTurns: 15,
      tools: ['Read', 'Grep', 'Glob'],
      mcpServers: loadMcpServers(params.config),
      mcpAllowlist: params.mcpAllowlist,
      outputFormat: { type: 'json_schema', schema: REVIEW_OUTPUT_SCHEMA },
      verbose: params.config.verbose,
    });

    if (result.isError || !result.structuredOutput) {
      return { ran: true, pass: false, summary: `Validator review call failed: ${result.errors.join('; ') || 'no structured output returned'}`, reasons: [] };
    }
    const parsed = result.structuredOutput as { verdict?: string; reasons?: string[] };
    const pass = parsed.verdict === 'PASS';
    return { ran: true, pass, summary: pass ? 'LLM completeness/regression review: PASS' : 'LLM completeness/regression review: FAIL', reasons: parsed.reasons ?? [] };
  } catch (err) {
    return { ran: true, pass: false, summary: `Validator review threw: ${(err as Error).message}`, reasons: [] };
  }
}

export async function validate(params: {
  config: RunnerConfig;
  platformCtx: PlatformContext;
  taskContent: string;
  plan: string;
  mcpAllowlist?: Set<string>;
}): Promise<ValidationResult> {
  const commands = detectProjectCommands(params.config.repoPath);
  const build = runBuild(params.config.repoPath, commands.build);
  const test = runTests(params.config.repoPath, commands.test);
  const review = await runLlmReview(params);

  const pass = build.pass && test.pass && review.pass;
  const errors: string[] = [];
  if (!build.pass) errors.push(`Build failed:\n${build.summary}`);
  if (!test.pass) errors.push(`Tests failed:\n${test.summary}`);
  if (!review.pass) errors.push(...review.reasons.map((r) => `Review: ${r}`));

  return { pass, build, test, review, errors };
}
