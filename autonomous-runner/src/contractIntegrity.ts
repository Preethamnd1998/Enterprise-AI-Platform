import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { ContractHashStatus } from './types.js';

const KERNEL_START = '<!-- enterprise-ai-platform:kernel:start -->';
const KERNEL_END = '<!-- enterprise-ai-platform:kernel:end -->';

export interface ContractIntegrityResult {
  status: ContractHashStatus;
  expectedHash?: string;
  actualHash?: string;
  message: string;
}

function extractKernel(content: string): string | undefined {
  const si = content.indexOf(KERNEL_START);
  const ei = content.indexOf(KERNEL_END);
  if (si < 0 || ei < 0) return undefined;
  return content.slice(si, ei + KERNEL_END.length);
}

/**
 * The unattended-process equivalent of adapters/claude/hooks/hash-check.js: verifies
 * shared/contract.md's kernel block still matches the recorded shared/contract.md.sha256.
 *
 * Behavior deliberately mirrors the hook, not a stricter policy: WARN on mismatch, never block.
 * The hook can self-heal by re-injecting the canonical kernel into an *installed* CLAUDE.md
 * copy — this process has no such installed copy to repair (it reads the source itself), so
 * there is nothing to re-inject; a mismatch here means the platform source was modified outside
 * the normal release process, which is worth surfacing loudly but is not, by itself, a reason to
 * refuse to run the same way an installed-repo drift wouldn't block that session either.
 */
export function verifyContractIntegrity(platformRoot: string): ContractIntegrityResult {
  const contractPath = path.join(platformRoot, 'shared', 'contract.md');
  const hashPath = path.join(platformRoot, 'shared', 'contract.md.sha256');

  let contractMd: string;
  try {
    contractMd = fs.readFileSync(contractPath, 'utf8');
  } catch {
    return { status: 'unavailable', message: `shared/contract.md not found at ${contractPath}` };
  }

  const kernel = extractKernel(contractMd);
  if (!kernel) {
    return { status: 'unavailable', message: 'Contract kernel markers not found in shared/contract.md' };
  }

  let expectedHash: string;
  try {
    expectedHash = fs.readFileSync(hashPath, 'utf8').trim();
  } catch {
    return { status: 'missing', message: `shared/contract.md.sha256 not found at ${hashPath} — cannot verify kernel integrity` };
  }

  const actualHash = crypto.createHash('sha256').update(kernel, 'utf8').digest('hex');
  if (actualHash !== expectedHash) {
    return {
      status: 'mismatch',
      expectedHash,
      actualHash,
      message:
        'Contract kernel hash mismatch — shared/contract.md may have been modified outside the ' +
        'normal release process. Proceeding (matching hash-check.js\'s warn-not-block behavior), ' +
        'but the system prompt this run built may not match the platform\'s intended contract.',
    };
  }
  return { status: 'ok', expectedHash, actualHash, message: 'Contract kernel hash verified.' };
}
