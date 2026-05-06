import assert from 'node:assert/strict';
import test from 'node:test';

import { isApproveOriginAllowed } from './approve.js';

const ISSUER = 'https://flowpunk-gateway.mark-29f.workers.dev';

function reqWith(headers: Record<string, string>): Request {
  return new Request(`${ISSUER}/oauth/approve`, {
    method: 'POST',
    headers,
  });
}

test('isApproveOriginAllowed: accepts Origin matching issuer (Chrome/Firefox path)', () => {
  const r = reqWith({ Origin: ISSUER });
  assert.equal(isApproveOriginAllowed(r, ISSUER), true);
});

test('isApproveOriginAllowed: rejects Origin from a different host', () => {
  const r = reqWith({ Origin: 'https://attacker.example' });
  assert.equal(isApproveOriginAllowed(r, ISSUER), false);
});

test('isApproveOriginAllowed: rejects literal `Origin: null` without Sec-Fetch-Site (sandboxed iframe / non-browser)', () => {
  const r = reqWith({ Origin: 'null' });
  assert.equal(isApproveOriginAllowed(r, ISSUER), false);
});

test('isApproveOriginAllowed: accepts literal `Origin: null` + Sec-Fetch-Site=same-origin (Chrome strict-referrer navigation)', () => {
  // When the consent page response has a strict Referrer-Policy, Chrome
  // serializes the form submission's request origin as the literal string
  // "null" per WHATWG Fetch §4.4. The Sec-Fetch-Site header (browser-set,
  // unforgeable from page JS) confirms the request actually came from the
  // same-origin browsing context, so the gate must pass.
  const r = reqWith({ Origin: 'null', 'Sec-Fetch-Site': 'same-origin' });
  assert.equal(isApproveOriginAllowed(r, ISSUER), true);
});

test('isApproveOriginAllowed: rejects literal `Origin: null` + Sec-Fetch-Site=cross-site (real cross-origin attack)', () => {
  const r = reqWith({ Origin: 'null', 'Sec-Fetch-Site': 'cross-site' });
  assert.equal(isApproveOriginAllowed(r, ISSUER), false);
});

test('isApproveOriginAllowed: accepts no-Origin + Sec-Fetch-Site=same-origin (Safari path)', () => {
  // Safari has historically omitted the Origin header on same-origin POSTs.
  // Sec-Fetch-Site is browser-set and not forgeable from page JS, so it's
  // a safe same-origin fallback.
  const r = reqWith({ 'Sec-Fetch-Site': 'same-origin' });
  assert.equal(isApproveOriginAllowed(r, ISSUER), true);
});

test('isApproveOriginAllowed: rejects no-Origin + Sec-Fetch-Site=cross-site', () => {
  const r = reqWith({ 'Sec-Fetch-Site': 'cross-site' });
  assert.equal(isApproveOriginAllowed(r, ISSUER), false);
});

test('isApproveOriginAllowed: rejects no-Origin + Sec-Fetch-Site=same-site (different subdomain)', () => {
  const r = reqWith({ 'Sec-Fetch-Site': 'same-site' });
  assert.equal(isApproveOriginAllowed(r, ISSUER), false);
});

test('isApproveOriginAllowed: rejects no-Origin AND no Sec-Fetch-Site (legacy / non-browser client)', () => {
  // curl / server-to-server. Reject — only browser-mediated requests
  // belong on /oauth/approve.
  const r = reqWith({});
  assert.equal(isApproveOriginAllowed(r, ISSUER), false);
});
