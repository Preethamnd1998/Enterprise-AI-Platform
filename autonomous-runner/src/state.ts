import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { ContractHashStatus, LoopState } from './types.js';

/** Persists LoopState to disk after every transition so a run's outcome survives the process. */
export class StateStore {
  private readonly filePath: string;

  constructor(stateDir: string, taskId: string) {
    fs.mkdirSync(stateDir, { recursive: true });
    this.filePath = path.join(stateDir, `${taskId}.state.json`);
  }

  save(state: LoopState): void {
    fs.writeFileSync(this.filePath, JSON.stringify(state, null, 2), 'utf8');
  }

  get path(): string {
    return this.filePath;
  }
}

export function createInitialState(
  taskId: string,
  task: string,
  repoPath: string,
  maxIterations: number,
  taskContentHash = '',
  agentLimit = 1,
  contractHashStatus: ContractHashStatus = 'unavailable',
): LoopState {
  return {
    taskId,
    task,
    repoPath,
    status: 'PLANNING',
    iteration: 0,
    maxIterations,
    filesChanged: [],
    toolCalls: 0,
    modelCalls: 0,
    buildAttempts: 0,
    testAttempts: 0,
    errors: [],
    startedAt: new Date().toISOString(),
    totalCostUsd: 0,
    checkpoint: { phase: null, iteration: 0, savedAt: new Date().toISOString() },
    lastValidationErrors: [],
    taskContentHash,
    agentLimit,
    subagentInvocations: 0,
    contractHashStatus,
  };
}

export function hashTaskContent(content: string): string {
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
}

/** Reads a persisted LoopState by taskId, if it exists and is well-formed JSON. */
export function loadState(stateDir: string, taskId: string): LoopState | undefined {
  const filePath = path.join(stateDir, `${taskId}.state.json`);
  if (!fs.existsSync(filePath)) return undefined;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as LoopState;
  } catch {
    return undefined;
  }
}

/** Lists every persisted state file's taskId (basename with the .state.json suffix stripped). */
export function listStateFiles(stateDir: string): string[] {
  if (!fs.existsSync(stateDir)) return [];
  return fs
    .readdirSync(stateDir)
    .filter((f) => f.endsWith('.state.json'))
    .map((f) => f.slice(0, -'.state.json'.length));
}

export function makeTaskId(taskFile: string): string {
  const base = path.basename(taskFile).replace(/\.[^.]+$/, '');
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `${base}-${stamp}`;
}
