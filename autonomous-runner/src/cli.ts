#!/usr/bin/env node
import { Command } from 'commander';
import readline from 'node:readline/promises';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import 'dotenv/config';

import { buildConfig } from './config.js';
import { createInitialState, makeTaskId, StateStore, hashTaskContent, loadState } from './state.js';
import { AuditLog } from './audit.js';
import { loadPlatformContext, loadMcpServers, loadMcpAllowlist } from './contextLoader.js';
import { buildPreamble, analyzeAndPlanPrompt, executePrompt, fixPrompt } from './prompts.js';
import { runQuery } from './worker.js';
import { validate } from './validator.js';
import { runLoop } from './loopController.js';
import { isWorkingTreeDirty, currentBranch } from './gitUtils.js';
import { deriveResumePoint, validateResumeMatch, findResumableStates } from './resume.js';
import { verifyContractIntegrity } from './contractIntegrity.js';
import type { AgentBudget } from './safety.js';
import type { LoopState, RunnerConfig } from './types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const program = new Command();
program
  .name('ai-runner')
  .description('Standalone autonomous AI Developer Agent loop for the Enterprise AI Platform /dev workflow')
  .version('0.1.0');

program
  .command('dev')
  .description('Run the bounded Analyze -> Plan -> Execute -> Validate -> Fix loop against a target repository')
  .requiredOption('--repo <path>', 'path to the target Git repository')
  .requiredOption('--task <path>', 'path to the task Markdown file (plan/spec/ticket), absolute or relative to --repo')
  .option('--max-iterations <n>', 'maximum loop iterations before stopping (default 5)')
  .option('--max-build-attempts <n>', 'maximum build attempts before declaring FAILED (default 3)')
  .option('--max-test-attempts <n>', 'maximum test attempts before declaring FAILED (default 3)')
  .option('--max-tool-calls-per-phase <n>', 'reserved for future per-phase tool-call reporting (default 40)')
  .option('--timeout <seconds>', 'overall wall-clock budget for the whole run (default 1800)')
  .option('--model <id>', 'Claude model id (default claude-opus-5, or $AI_RUNNER_MODEL)')
  .option('--fallback-model <id>', 'fallback model id if the primary is unavailable (default claude-sonnet-5)')
  .option('-y, --yes', 'skip the pre-execution confirmation prompt')
  .option('--allow-dirty', 'allow running against a repo with uncommitted changes')
  .option('--verbose', 'verbose SDK stderr logging')
  .option('--resume [taskId]', 'resume a previous incomplete run for this --repo/--task (omit the id to auto-select the most recent match)')
  .option('--no-resume', 'never auto-detect or prompt to resume an incomplete run — always start a fresh taskId')
  .option(
    '--agent-limit <n>',
    'hard ceiling on Task-tool (subagent) invocations for this run, 0-3 (default 1 — stricter than the interactive /dev command\'s opt-in-3, since nothing here approves a subagent in real time)',
  )
  .action(async (opts) => {
    try {
      await runDev(opts);
    } catch (err) {
      console.error(`[LOOP] FATAL: ${(err as Error).message}`);
      process.exitCode = 1;
    }
  });

program.parseAsync(process.argv);

async function confirm(message: string): Promise<boolean> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await rl.question(`${message} (yes/no): `);
    return /^y(es)?$/i.test(answer.trim());
  } finally {
    rl.close();
  }
}

/**
 * Resolves which taskId this run uses, and — if resuming — the persisted state to continue from.
 * `resumeOpt` is commander's raw value for --resume/--no-resume: `false` (--no-resume passed),
 * `true` (--resume with no id), a string (--resume <taskId>), or undefined (neither flag passed).
 */
async function resolveTaskId(
  resumeOpt: string | boolean | undefined,
  config: RunnerConfig,
  taskContentHash: string,
  stateSubDir: string,
): Promise<{ taskId: string; resumedState?: LoopState }> {
  if (resumeOpt === false) {
    return { taskId: makeTaskId(config.taskFile) };
  }

  if (typeof resumeOpt === 'string') {
    const loaded = loadState(stateSubDir, resumeOpt);
    if (!loaded) throw new Error(`--resume: no saved state found for task "${resumeOpt}" in ${stateSubDir}`);
    const match = validateResumeMatch(loaded, config.repoPath, config.taskFile, taskContentHash);
    if (!match.ok) throw new Error(match.reason);
    return { taskId: resumeOpt, resumedState: loaded };
  }

  const candidates = findResumableStates(stateSubDir, config.repoPath, config.taskFile);
  if (candidates.length === 0) {
    if (resumeOpt === true) throw new Error(`--resume: no incomplete run found for this repo/task in ${stateSubDir}`);
    return { taskId: makeTaskId(config.taskFile) };
  }

  const best = candidates[0];
  const match = validateResumeMatch(best.state, config.repoPath, config.taskFile, taskContentHash);

  if (resumeOpt === true) {
    if (!match.ok) throw new Error(match.reason);
    return { taskId: best.taskId, resumedState: best.state };
  }

  // Auto-detected, not explicitly requested — offer it rather than assuming.
  if (!match.ok) return { taskId: makeTaskId(config.taskFile) };

  console.log(
    `[LOOP] Found an incomplete run for this task: ${best.taskId} ` +
      `(status ${best.state.status}, iteration ${best.state.iteration}/${best.state.maxIterations}, ` +
      `last checkpoint: ${best.state.checkpoint?.phase ?? 'none'}).`,
  );
  if (config.yes) {
    console.log('[LOOP] Non-interactive run (--yes) — starting a new run instead. Pass --resume to continue it explicitly.');
    return { taskId: makeTaskId(config.taskFile) };
  }
  const doResume = await confirm('Resume it instead of starting a new run?');
  if (doResume) return { taskId: best.taskId, resumedState: best.state };
  return { taskId: makeTaskId(config.taskFile) };
}

async function runDev(opts: Record<string, string | boolean | undefined>): Promise<void> {
  const config = buildConfig(
    {
      repo: opts.repo as string,
      task: opts.task as string,
      maxIterations: opts.maxIterations as string | undefined,
      maxToolCallsPerPhase: opts.maxToolCallsPerPhase as string | undefined,
      maxBuildAttempts: opts.maxBuildAttempts as string | undefined,
      maxTestAttempts: opts.maxTestAttempts as string | undefined,
      timeoutSeconds: opts.timeout as string | undefined,
      model: opts.model as string | undefined,
      fallbackModel: opts.fallbackModel as string | undefined,
      yes: Boolean(opts.yes),
      allowDirty: Boolean(opts.allowDirty),
      verbose: Boolean(opts.verbose),
      agentLimit: opts.agentLimit as string | undefined,
    },
    __dirname,
  );

  const taskContent = fs.readFileSync(config.taskFile, 'utf8');
  const taskContentHash = hashTaskContent(taskContent);
  const stateDir = path.join(config.repoPath, '.ai-runner-state');
  const stateSubDir = path.join(stateDir, 'state');

  const { taskId, resumedState } = await resolveTaskId(opts.resume, config, taskContentHash, stateSubDir);
  const isResuming = resumedState !== undefined;
  const resumePoint = resumedState ? deriveResumePoint(resumedState) : undefined;

  if (!isResuming && !config.allowDirty && isWorkingTreeDirty(config.repoPath)) {
    throw new Error(
      `Repository ${config.repoPath} has uncommitted changes. Commit or stash them first, ` +
        're-run with a clean tree, or pass --allow-dirty to proceed anyway (the runner will still ' +
        'never commit/push on its own).',
    );
  }
  if (isResuming && isWorkingTreeDirty(config.repoPath)) {
    console.log('[LOOP] Note: working tree is dirty — expected when resuming after an interruption, not blocking.');
  }

  const stateStore = new StateStore(stateSubDir, taskId);
  const audit = new AuditLog(path.join(stateDir, 'audit'), taskId);

  console.log('========================================');
  console.log(isResuming ? 'AUTONOMOUS /dev LOOP — RESUMING' : 'AUTONOMOUS /dev LOOP');
  console.log('========================================');
  console.log(`[LOOP] Task ${isResuming ? 'resumed' : 'started'}: ${taskId}`);
  if (isResuming && resumedState) {
    console.log(`[LOOP] Resuming from: status=${resumedState.status} iteration=${resumedState.iteration} lastCheckpoint=${resumedState.checkpoint?.phase ?? 'none'}`);
    console.log(`[LOOP] Re-entering at: ${resumePoint ? `${resumePoint.startPhase} (iteration ${resumePoint.startIteration})` : 'analyze_plan (nothing was safely completed before the interruption)'}`);
  }
  console.log(`[LOOP] Repo:         ${config.repoPath} (branch: ${currentBranch(config.repoPath)})`);
  console.log(`[LOOP] Task file:    ${config.taskFile}`);
  console.log(`[LOOP] Model:        ${config.model} (fallback: ${config.fallbackModel})`);
  console.log(`[LOOP] Bounds:       maxIterations=${config.maxIterations} maxBuildAttempts=${config.maxBuildAttempts} maxTestAttempts=${config.maxTestAttempts} timeout=${config.timeoutMs / 1000}s agentLimit=${config.agentLimit}`);
  console.log(`[LOOP] State/audit:  ${stateDir}`);

  const contractIntegrity = verifyContractIntegrity(config.platformRoot);
  if (contractIntegrity.status === 'ok') {
    console.log(`[LOOP] Contract:     kernel hash verified (${contractIntegrity.actualHash?.slice(0, 12)}…)`);
  } else {
    console.warn(`[LOOP] Contract:     ${contractIntegrity.status.toUpperCase()} — ${contractIntegrity.message}`);
  }

  if (!config.yes) {
    const proceed = await confirm('\nThis will read/write files and run local build/test commands in the target repo. Continue?');
    if (!proceed) {
      console.log('[LOOP] Aborted by operator.');
      return;
    }
  }

  const platformCtx = loadPlatformContext(config, taskContent);
  console.log(
    `[LOOP] Loaded ${platformCtx.standards.length} standards file(s), ${platformCtx.rules.length} rule file(s), ` +
      `${platformCtx.knowledge.length} knowledge file(s) from shared/ (platform root: ${config.platformRoot})`,
  );

  const mcpServers = loadMcpServers(config);
  if (mcpServers) console.log(`[LOOP] Loaded ${Object.keys(mcpServers).length} MCP server(s) from ${path.join(config.repoPath, '.mcp.json')}`);

  const mcpAllowlist = loadMcpAllowlist(config.platformRoot);
  console.log(
    mcpAllowlist
      ? `[LOOP] MCP allowlist: ${mcpAllowlist.size} tool(s) from adapters/claude/config/settings.json — everything else denied fail-closed`
      : '[LOOP] MCP allowlist: unavailable — ALL mcp__ tools denied fail-closed for this run',
  );

  const abortController = new AbortController();
  const timeoutHandle = setTimeout(() => {
    console.error(`[LOOP] Wall-clock budget of ${config.timeoutMs / 1000}s exceeded — aborting.`);
    abortController.abort();
  }, config.timeoutMs);

  // Every invocation re-verifies the contract, including a resume — the state field always
  // reflects the most recently observed status, not just the one from the original crashed run.
  if (resumedState) resumedState.contractHashStatus = contractIntegrity.status;
  const initialState =
    resumedState ??
    createInitialState(taskId, config.taskFile, config.repoPath, config.maxIterations, taskContentHash, config.agentLimit, contractIntegrity.status);
  const preamble = buildPreamble(platformCtx);

  // Shared, cross-phase budget object — the SAME instance is passed into every phase's runQuery
  // call below, so the ceiling holds across Analyze/Plan, Execute, and every Fix iteration, and
  // (via worker.ts's canUseTool) across any nested/recursive Task call too. Resuming carries
  // forward whatever was already spent rather than resetting it.
  const agentBudget: AgentBudget = { limit: config.agentLimit, used: initialState.subagentInvocations };
  const executeTools = config.agentLimit > 0 ? ['Read', 'Write', 'Edit', 'Bash', 'Grep', 'Glob', 'Task'] : ['Read', 'Write', 'Edit', 'Bash', 'Grep', 'Glob'];

  const result = await runLoop(
    config,
    taskContent,
    initialState,
    {
      audit,
      stateStore,
      analyzeAndPlan: async (task) => {
        console.log(`[AGENT] Planning`);
        const r = await runQuery({
          prompt: analyzeAndPlanPrompt(task),
          systemPrompt: preamble,
          cwd: config.repoPath,
          model: config.model,
          fallbackModel: config.fallbackModel,
          maxTurns: 15,
          tools: ['Read', 'Grep', 'Glob'],
          mcpServers,
          mcpAllowlist,
          abortController,
          verbose: config.verbose,
          onToolCall: logToolCall,
        });
        return { plan: r.resultText || '(model returned no plan text)', costUsd: r.costUsd, toolCalls: r.toolCallCount, subagentInvocations: agentBudget.used };
      },
      execute: async (task, plan, state: LoopState, previousErrors) => {
        const isFix = state.iteration > 1;
        console.log(`[AGENT] ${isFix ? 'Fixing (iteration ' + state.iteration + ')' : 'Executing'}`);
        const r = await runQuery({
          prompt: isFix ? fixPrompt(task, plan, state, previousErrors, isResuming) : executePrompt(task, plan, isResuming),
          systemPrompt: preamble,
          cwd: config.repoPath,
          model: config.model,
          fallbackModel: config.fallbackModel,
          maxTurns: 40,
          tools: executeTools,
          mcpServers,
          mcpAllowlist,
          agentBudget,
          abortController,
          verbose: config.verbose,
          onToolCall: logToolCall,
        });
        return { costUsd: r.costUsd, toolCalls: r.toolCallCount, isError: r.isError, errors: r.errors, subagentInvocations: agentBudget.used };
      },
      validate: async (task, plan) => {
        console.log('[LOOP] Running validator (build/test/review)');
        const v = await validate({ config, platformCtx, taskContent: task, plan, mcpAllowlist });
        console.log(`[VALIDATOR] ${v.pass ? 'PASSED' : 'FAILED'}`);
        if (!v.pass) for (const e of v.errors) console.log(`[VALIDATOR] ${e.split('\n')[0]}`);
        return v;
      },
    },
    isResuming ? { point: resumePoint } : undefined,
  );

  clearTimeout(timeoutHandle);

  printFinalReport(result.state, stateStore, audit);
}

function logToolCall(toolName: string, _input: Record<string, unknown>, decision: 'allow' | 'deny', reason?: string): void {
  if (decision === 'deny') {
    console.log(`[TOOL] ${toolName} — DENIED (${reason})`);
  } else {
    console.log(`[TOOL] ${toolName}`);
  }
}

function printFinalReport(state: LoopState, stateStore: StateStore, audit: AuditLog): void {
  console.log('\n========================================');
  console.log('LOOP RESULT');
  console.log('========================================');
  console.log(`Status:          ${state.status}`);
  console.log(`Iterations:      ${state.iteration}/${state.maxIterations}`);
  console.log(`Model calls:     ${state.modelCalls}`);
  console.log(`Tool calls:      ${state.toolCalls}`);
  console.log(`Build attempts:  ${state.buildAttempts}/${state.buildAttempts > 0 ? '' : 'n/a'}`);
  console.log(`Test attempts:   ${state.testAttempts}`);
  console.log(`Subagents used:  ${state.subagentInvocations}/${state.agentLimit} (agentLimit)`);
  console.log(`Contract:        ${state.contractHashStatus}`);
  console.log(`Files changed:   ${state.filesChanged.length}`);
  for (const f of state.filesChanged) console.log(`  - ${f}`);
  console.log(`Est. cost (USD): ${state.totalCostUsd.toFixed(4)}`);
  console.log(`State file:      ${stateStore.path}`);
  console.log(`Audit log:       ${audit.path}`);
  console.log('========================================');

  process.exitCode = state.status === 'SUCCESS' ? 0 : 1;
}
