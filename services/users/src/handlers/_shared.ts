import { drizzle } from 'drizzle-orm/d1';
import { createLogger, emitAuditEvent } from '@flowpunk/service-utils';
import type { AuditEvent } from '@flowpunk/service-utils';
import { UsersRepoError } from '@flowpunk-indie/db';

import type { Actor, UsersEnv } from '../types.js';

export function getDb(env: UsersEnv) {
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

export function forbidden(code = 'FORBIDDEN', message?: string): Response {
  return errorResponse(403, code, message);
}

export type ReadJsonResult<T> =
  | { kind: 'none' }
  | { kind: 'malformed' }
  | { kind: 'parsed'; value: T };

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

/**
 * Map a `UsersRepoError` to an HTTP response.
 *
 * - `not_found` → 404
 * - `invalid_input` → 400
 * - `wrong_state` → 409 with the repo's `detailCode` if any (e.g. `EMAIL_TAKEN`)
 * - `invariant_violation` → 409 with the repo's `detailCode`
 *   (`LAST_ADMIN`, `ADMIN_EXISTS`, `LAST_ADMIN_BLOCKS_DELETE`). Generic
 *   invariant violations without a detailCode collapse to 500 because
 *   they indicate a repo bug, not a caller-actionable condition.
 *
 * Non-repo errors are rethrown so the top-level fetch handler logs and
 * translates them.
 */
export function mapRepoError(err: unknown): Response {
  if (!(err instanceof UsersRepoError)) throw err;
  switch (err.code) {
    case 'not_found':
      return errorResponse(404, 'NOT_FOUND', err.message);
    case 'invalid_input':
      return errorResponse(400, 'INVALID_INPUT', err.message);
    case 'wrong_state':
      return errorResponse(
        409,
        err.detailCode ?? 'WRONG_STATE',
        err.message,
      );
    case 'invariant_violation': {
      if (err.detailCode) {
        return errorResponse(409, err.detailCode, err.message);
      }
      const logger = createLogger({ service: 'users' });
      logger.error('users repo invariant violation', {
        error: err,
        repoCode: err.code,
      });
      return errorResponse(500, 'INTERNAL_ERROR');
    }
  }
}

export function isString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

/**
 * Emit a users-domain audit event. Builds the actor descriptor from the
 * authenticated actor and writes via `emitAuditEvent`.
 */
export function emitUsersAudit(
  actor: Actor,
  event: UsersAuditEventInput,
): void {
  const logger = createLogger({ service: 'users' });
  emitAuditEvent(logger, {
    ...event,
    actorId: actor.userId,
    actorTenantId: actor.tenantId,
    actorCredentialType: actor.credentialType,
  } as AuditEvent);
}

type UsersAuditEventInput = Omit<
  AuditEvent,
  'actorId' | 'actorTenantId' | 'actorCredentialType'
>;
