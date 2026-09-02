import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { verifyContractIntegrity } from '../src/contractIntegrity.js';

const tmpDirs: string[] = [];
function mkTmp(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-runner-integrity-test-'));
  tmpDirs.push(dir);
  return dir;
}
afterEach(() => {
  for (const dir of tmpDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

const KERNEL_START = '<!-- enterprise-ai-platform:kernel:start -->';
const KERNEL_END = '<!-- enterprise-ai-platform:kernel:end -->';

function makePlatformRoot(kernelBody: string | null, hash: string | null): string {
  const root = mkTmp();
  fs.mkdirSync(path.join(root, 'shared'), { recursive: true });
  if (kernelBody !== null) {
    const contract = `# Contract\n\n${KERNEL_START}\n${kernelBody}\n${KERNEL_END}\n\nMore text.`;
    fs.writeFileSync(path.join(root, 'shared', 'contract.md'), contract, 'utf8');
  }
  if (hash !== null) {
    fs.writeFileSync(path.join(root, 'shared', 'contract.md.sha256'), hash, 'utf8');
  }
  return root;
}

function kernelSha256(kernelBody: string): string {
  const kernel = `${KERNEL_START}\n${kernelBody}\n${KERNEL_END}`;
  return crypto.createHash('sha256').update(kernel, 'utf8').digest('hex');
}

describe('verifyContractIntegrity', () => {
  it('returns ok when the kernel hash matches the recorded hash', () => {
    const body = 'Rule 1. Do the thing.';
    const root = makePlatformRoot(body, kernelSha256(body));
    const result = verifyContractIntegrity(root);
    expect(result.status).toBe('ok');
    expect(result.actualHash).toBe(result.expectedHash);
  });

  it('returns mismatch when the kernel content no longer matches the recorded hash', () => {
    const root = makePlatformRoot('Rule 1. Original.', kernelSha256('Rule 1. Something else entirely.'));
    const result = verifyContractIntegrity(root);
    expect(result.status).toBe('mismatch');
    expect(result.expectedHash).not.toBe(result.actualHash);
    expect(result.message).toMatch(/mismatch/i);
  });

  it('returns missing when contract.md.sha256 does not exist', () => {
    const root = makePlatformRoot('Rule 1.', null);
    const result = verifyContractIntegrity(root);
    expect(result.status).toBe('missing');
  });

  it('returns unavailable when shared/contract.md does not exist at all', () => {
    const root = mkTmp();
    const result = verifyContractIntegrity(root);
    expect(result.status).toBe('unavailable');
  });

  it('returns unavailable when the kernel markers are missing from contract.md', () => {
    const root = mkTmp();
    fs.mkdirSync(path.join(root, 'shared'), { recursive: true });
    fs.writeFileSync(path.join(root, 'shared', 'contract.md'), '# Contract\n\nNo kernel markers here.', 'utf8');
    fs.writeFileSync(path.join(root, 'shared', 'contract.md.sha256'), 'deadbeef', 'utf8');
    const result = verifyContractIntegrity(root);
    expect(result.status).toBe('unavailable');
  });

  it('never throws — always returns a result object, matching hash-check.js\'s warn-not-block behavior', () => {
    const root = mkTmp(); // completely empty
    expect(() => verifyContractIntegrity(root)).not.toThrow();
  });
});
