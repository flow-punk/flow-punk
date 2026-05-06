import * as p from '@clack/prompts';
import { theme } from './theme.js';

export interface ChecklistItem {
  key: string;
  label: string;
  /** Returns optional inline detail to display next to the OK marker. */
  run: () => Promise<string | void>;
}

/**
 * Run an ordered list of provisioning steps. Each step gets a clack spinner.
 * On error, propagate (caller decides whether to surface or rollback).
 *
 * Idempotency is the caller's responsibility — a step that detects
 * "already-done" should still resolve normally and may return a hint string
 * (e.g. "exists").
 */
export async function runChecklist(items: ReadonlyArray<ChecklistItem>): Promise<void> {
  for (const item of items) {
    const spinner = p.spinner();
    spinner.start(item.label);
    try {
      const detail = await item.run();
      const tail = detail ? ` ${theme.dim(detail)}` : '';
      spinner.stop(`${theme.ok('✓')} ${item.label}${tail}`);
    } catch (err) {
      spinner.stop(`${theme.error('✗')} ${item.label}`);
      throw err;
    }
  }
}
