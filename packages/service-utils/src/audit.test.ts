import assert from 'node:assert/strict';
import test from 'node:test';

import { emitAuditEvent } from './audit.js';
import type { Logger } from './logger.js';

interface RecordedCall {
  message: string;
  data: Record<string, unknown> | undefined;
}

function makeRecordingLogger(): Logger & { calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  const logger: Logger = {
    withRequestId: () => logger,
    withTenantId: () => logger,
    withUserId: () => logger,
    withCredential: () => logger,
    debug: () => undefined,
    info: (message, data) => {
      calls.push({ message, data });
    },
    warn: () => undefined,
    error: () => undefined,
  };
  return Object.assign(logger, { calls });
}

test('emitAuditEvent emits a structured info log with action and payload', () => {
  const logger = makeRecordingLogger();
  emitAuditEvent(logger, {
    action: 'tenants.created',
    actorId: 'usr_admin_001',
    actorTenantId: 'tenant_local',
    actorCredentialType: 'session',
    resourceType: 'tenant',
    resourceId: 'ten_acme',
    detail: { slug: 'acme', plan: 'hobby' },
  });

  assert.equal(logger.calls.length, 1);
  const call = logger.calls[0];
  assert.ok(call);
  assert.equal(call.message, 'audit.event');
  assert.equal(call.data?.action, 'tenants.created');
  assert.equal(call.data?.actorId, 'usr_admin_001');
  assert.equal(call.data?.resourceId, 'ten_acme');
  assert.deepEqual(call.data?.detail, { slug: 'acme', plan: 'hobby' });
});

test('emitAuditEvent supports tenants.suspended with empty detail (reason stays in DB row only)', () => {
  const logger = makeRecordingLogger();
  emitAuditEvent(logger, {
    action: 'tenants.suspended',
    actorId: 'usr_admin_001',
    actorTenantId: 'tenant_local',
    actorCredentialType: 'session',
    resourceType: 'tenant',
    resourceId: 'ten_acme',
    detail: {},
  });

  const call = logger.calls[0];
  assert.ok(call);
  assert.equal(call.data?.action, 'tenants.suspended');
  assert.deepEqual(call.data?.detail, {});
});

test('emitAuditEvent supports unsuspended with empty detail', () => {
  const logger = makeRecordingLogger();
  emitAuditEvent(logger, {
    action: 'tenants.unsuspended',
    actorId: 'usr_admin_001',
    actorTenantId: 'tenant_local',
    actorCredentialType: 'session',
    resourceType: 'tenant',
    resourceId: 'ten_acme',
    detail: {},
  });

  const call = logger.calls[0];
  assert.ok(call);
  assert.equal(call.data?.action, 'tenants.unsuspended');
  assert.deepEqual(call.data?.detail, {});
});
