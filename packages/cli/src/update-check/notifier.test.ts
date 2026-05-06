import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { checkForUpgrade, semverGreater } from './notifier.js';

test('semverGreater: standard version comparison', () => {
  assert.equal(semverGreater('0.2.0', '0.1.0'), true);
  assert.equal(semverGreater('0.1.0', '0.2.0'), false);
  assert.equal(semverGreater('1.0.0', '0.99.99'), true);
  assert.equal(semverGreater('0.0.1', '0.0.1'), false);
});

test('semverGreater: prerelease beats earlier prerelease', () => {
  assert.equal(semverGreater('0.0.1-alpha.2', '0.0.1-alpha.1'), true);
  assert.equal(semverGreater('0.0.1-beta.0', '0.0.1-alpha.5'), true);
});

test('semverGreater: stable beats prerelease at same version', () => {
  assert.equal(semverGreater('0.0.1', '0.0.1-alpha.5'), true);
  assert.equal(semverGreater('0.0.1-alpha.5', '0.0.1'), false);
});

test('checkForUpgrade respects DO_NOT_TRACK', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'flowpunk-test-'));
  try {
    const prev = process.env.DO_NOT_TRACK;
    process.env.DO_NOT_TRACK = '1';
    process.env.FLOWPUNK_CONFIG_DIR = dir;
    const result = await checkForUpgrade('0.0.1');
    assert.equal(result.hint, null);
    if (prev === undefined) delete process.env.DO_NOT_TRACK;
    else process.env.DO_NOT_TRACK = prev;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('checkForUpgrade respects CI=true', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'flowpunk-test-'));
  try {
    const prev = process.env.CI;
    process.env.CI = 'true';
    process.env.FLOWPUNK_CONFIG_DIR = dir;
    const result = await checkForUpgrade('0.0.1');
    assert.equal(result.hint, null);
    if (prev === undefined) delete process.env.CI;
    else process.env.CI = prev;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('checkForUpgrade returns null on fetch failure', async () => {
  // Patch global fetch to throw — notifier MUST swallow.
  const dir = mkdtempSync(join(tmpdir(), 'flowpunk-test-'));
  try {
    const prevFetch = globalThis.fetch;
    process.env.FLOWPUNK_CONFIG_DIR = dir;
    delete process.env.DO_NOT_TRACK;
    delete process.env.CI;
    globalThis.fetch = (() => {
      throw new Error('network is down');
    }) as typeof fetch;
    const result = await checkForUpgrade('0.0.1');
    assert.equal(result.hint, null);
    globalThis.fetch = prevFetch;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
