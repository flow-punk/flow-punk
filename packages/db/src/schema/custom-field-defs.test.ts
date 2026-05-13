import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CUSTOM_FIELD_BASE_MODELS,
  CUSTOM_FIELD_CAPS,
  CUSTOM_FIELD_FILTERABLE_STATUSES,
  CUSTOM_FIELD_NAME_REGEX,
  FILTERABLE_TRANSITIONS,
  isAllowedFilterableTransition,
} from './custom-field-defs.js';

test('CUSTOM_FIELD_BASE_MODELS is the canonical enum', () => {
  assert.deepEqual(
    [...CUSTOM_FIELD_BASE_MODELS],
    ['person', 'account', 'deal'],
  );
});

test('CUSTOM_FIELD_FILTERABLE_STATUSES covers every lifecycle state', () => {
  assert.deepEqual(
    [...CUSTOM_FIELD_FILTERABLE_STATUSES],
    ['disabled', 'pending', 'ready', 'failed', 'dropping'],
  );
});

test('CUSTOM_FIELD_NAME_REGEX accepts a typical slug', () => {
  assert.equal(CUSTOM_FIELD_NAME_REGEX.test('industry'), true);
  assert.equal(CUSTOM_FIELD_NAME_REGEX.test('lead_score'), true);
  assert.equal(CUSTOM_FIELD_NAME_REGEX.test('a'), true);
  assert.equal(CUSTOM_FIELD_NAME_REGEX.test('a0_b1_c2'), true);
});

test('CUSTOM_FIELD_NAME_REGEX rejects non-lowercase first char', () => {
  assert.equal(CUSTOM_FIELD_NAME_REGEX.test('Industry'), false);
  assert.equal(CUSTOM_FIELD_NAME_REGEX.test('1leading_digit'), false);
  assert.equal(CUSTOM_FIELD_NAME_REGEX.test('_leading_underscore'), false);
});

test('CUSTOM_FIELD_NAME_REGEX rejects disallowed chars', () => {
  assert.equal(CUSTOM_FIELD_NAME_REGEX.test('foo-bar'), false); // hyphen
  assert.equal(CUSTOM_FIELD_NAME_REGEX.test('foo.bar'), false); // dot
  assert.equal(CUSTOM_FIELD_NAME_REGEX.test('foo bar'), false); // space
  assert.equal(CUSTOM_FIELD_NAME_REGEX.test("foo'bar"), false); // quote
  assert.equal(CUSTOM_FIELD_NAME_REGEX.test('foo"bar'), false); // dquote
  assert.equal(CUSTOM_FIELD_NAME_REGEX.test('foo;bar'), false); // semicolon
});

test('CUSTOM_FIELD_NAME_REGEX rejects length > 31 chars (1 + 30)', () => {
  const max = 'a' + 'b'.repeat(30); // 31 chars total
  assert.equal(CUSTOM_FIELD_NAME_REGEX.test(max), true);
  const tooLong = 'a' + 'b'.repeat(31);
  assert.equal(CUSTOM_FIELD_NAME_REGEX.test(tooLong), false);
});

test('CUSTOM_FIELD_CAPS matches ADR-023 §9 numbers', () => {
  assert.equal(CUSTOM_FIELD_CAPS.maxDefsPerBaseModel, 50);
  assert.equal(CUSTOM_FIELD_CAPS.maxFilterablePerBaseModel, 10);
  assert.equal(CUSTOM_FIELD_CAPS.maxValueChars, 1024);
});

test('FILTERABLE_TRANSITIONS encodes the documented state machine', () => {
  // disabled is the entry state — only `pending` reachable.
  assert.deepEqual([...FILTERABLE_TRANSITIONS.disabled], ['pending']);
  // pending splits into success and failure.
  assert.deepEqual([...FILTERABLE_TRANSITIONS.pending], ['ready', 'failed']);
  // ready can only be torn down via `dropping`.
  assert.deepEqual([...FILTERABLE_TRANSITIONS.ready], ['dropping']);
  // dropping completes back to disabled.
  assert.deepEqual([...FILTERABLE_TRANSITIONS.dropping], ['disabled']);
  // failed has manual recovery: back to disabled, or retry into pending.
  assert.deepEqual([...FILTERABLE_TRANSITIONS.failed], ['disabled', 'pending']);
});

test('isAllowedFilterableTransition accepts the documented edges', () => {
  assert.equal(isAllowedFilterableTransition('disabled', 'pending'), true);
  assert.equal(isAllowedFilterableTransition('pending', 'ready'), true);
  assert.equal(isAllowedFilterableTransition('pending', 'failed'), true);
  assert.equal(isAllowedFilterableTransition('ready', 'dropping'), true);
  assert.equal(isAllowedFilterableTransition('dropping', 'disabled'), true);
  assert.equal(isAllowedFilterableTransition('failed', 'disabled'), true);
  assert.equal(isAllowedFilterableTransition('failed', 'pending'), true);
});

test('isAllowedFilterableTransition rejects illegal jumps', () => {
  // Skipping the worker step.
  assert.equal(isAllowedFilterableTransition('disabled', 'ready'), false);
  // Bouncing ready straight to disabled (must go through dropping).
  assert.equal(isAllowedFilterableTransition('ready', 'disabled'), false);
  // No going backwards from ready to pending.
  assert.equal(isAllowedFilterableTransition('ready', 'pending'), false);
  // No self-loops.
  assert.equal(isAllowedFilterableTransition('pending', 'pending'), false);
});
