import { execFileSync } from 'node:child_process';

/** All git calls here are read-only status/diff inspection — never mutating. */

/**
 * Pathspec excluding the runner's own bookkeeping directory. Without this, every run after the
 * first one flags the tree as "dirty" purely because .ai-runner-state/ is untracked — nothing
 * the operator or the Worker actually touched — which would spuriously block a fresh (non-resume)
 * run and would misreport the runner's own state files as "files changed" by the task.
 */
const EXCLUDE_STATE_DIR_PATHSPEC = ['.', ':!.ai-runner-state'] as const;

function gitStatusPorcelain(repoPath: string): string {
  return execFileSync('git', ['status', '--porcelain', '--', ...EXCLUDE_STATE_DIR_PATHSPEC], { cwd: repoPath, encoding: 'utf8' });
}

export function isWorkingTreeDirty(repoPath: string): boolean {
  return gitStatusPorcelain(repoPath).trim().length > 0;
}

export function changedFiles(repoPath: string): string[] {
  try {
    return gitStatusPorcelain(repoPath)
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => line.replace(/^[AMDRCU?!]{1,2}\s+/, ''));
  } catch {
    return [];
  }
}

export function currentBranch(repoPath: string): string {
  try {
    return execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: repoPath, encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}
