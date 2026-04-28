import { drizzle, type DrizzleD1Database } from 'drizzle-orm/d1';
import { createLogger, emitAuditEvent } from '@flowpunk/service-utils';
import type { AuditEvent, Logger } from '@flowpunk/service-utils';
import { AccountsRepoError } from '@flowpunk-indie/db';

import type { Actor, ContactsEnv } from '../types.js';

export type Db = DrizzleD1Database<Record<string, never>>;

export function getDb(env: ContactsEnv): Db {
  return drizzle(env.DB);
}

export function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export function errorResponse(
  status: number,
  code: string,
  message?: string,
  details?: Record<string, unknown>,
): Response {
  return jsonResponse(status, {
    success: false,
    error: {
      code,
      ...(message ? { message } : {}),
      ...(details ? { details } : {}),
    },
  });
}

export function badRequest(
  code: string,
  message?: string,
  details?: Record<string, unknown>,
): Response {
  return errorResponse(400, code, message, details);
}

export function notFound(code = 'NOT_FOUND'): Response {
  return errorResponse(404, code);
}

export type ReadJsonResult<T> =
  | { kind: 'none' }
  | { kind: 'malformed' }
  | { kind: 'parsed'; value: T };

/**
 * Discriminated body read.
 *
 * - `none`: no JSON content-type (or empty body) — caller decides whether to
 *   treat as 400 (required body) or proceed (optional body).
 * - `malformed`: content-type was JSON but parsing failed — always 400.
 * - `parsed`: success.
 */
export async function tryReadJson<T>(
  request: Request,
): Promise<ReadJsonResult<T>> {
  const contentType = request.headers.get('Content-Type') ?? '';
  if (!contentType.includes('application/json')) return { kind: 'none' };
  try {
    return { kind: 'parsed', value: (await request.json()) as T };
  } catch {
    return { kind: 'malformed' };
  }
}

/**
 * Helper for endpoints that REQUIRE a JSON body. Returns a `Response`
 * directly when body is missing or malformed; otherwise returns
 * `{ kind: 'ok', value }`.
 */
export async function requireJsonBody<T>(
  request: Request,
): Promise<{ kind: 'ok'; value: T } | { kind: 'err'; response: Response }> {
  const result = await tryReadJson<T>(request);
  if (result.kind === 'parsed') return { kind: 'ok', value: result.value };
  return {
    kind: 'err',
    response: badRequest('INVALID_BODY', 'request body must be JSON'),
  };
}

export function isString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

/**
 * Map AccountsRepoError to HTTP. Non-repo errors are rethrown so the
 * top-level fetch handler logs them as INTERNAL_ERROR. 500s never include
 * the underlying message in the response body.
 */
export function mapRepoError(err: unknown): Response {
  if (!(err instanceof AccountsRepoError)) throw err;
  switch (err.code) {
    case 'not_found':
      return errorResponse(404, 'NOT_FOUND', err.message);
    case 'invalid_input':
      return errorResponse(400, 'INVALID_INPUT', err.message);
    case 'wrong_state':
      return errorResponse(409, 'WRONG_STATE', err.message);
    case 'invariant_violation': {
      const logger = createLogger({ service: 'contacts' });
      logger.error('accounts repo invariant violation', {
        error: err,
        repoCode: err.code,
      });
      return errorResponse(500, 'INTERNAL_ERROR');
    }
  }
}

export type ContactsAuditEventInput = Omit<
  AuditEvent,
  'actorId' | 'actorTenantId' | 'actorCredentialType'
>;

/**
 * Project the cleared actor onto a contacts-domain audit event and emit
 * via the shared `emitAuditEvent` helper. Today this is a structured
 * `audit.event` log line; queue fan-out is deferred (see ADR-007 addendum).
 */
export function emitContactsAudit(
  actor: Actor,
  event: ContactsAuditEventInput,
  logger?: Logger,
): void {
  const log = logger ?? createLogger({ service: 'contacts' });
  emitAuditEvent(log, {
    ...event,
    actorId: actor.userId,
    actorTenantId: actor.tenantId,
    actorCredentialType: actor.credentialType,
  } as AuditEvent);
}
