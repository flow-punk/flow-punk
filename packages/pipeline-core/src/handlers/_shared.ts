import { drizzle, type DrizzleD1Database } from 'drizzle-orm/d1';
import { createLogger } from '@flowpunk/service-utils';
import {
  DealContactsRepoError,
  DealHistoryRepoError,
  DealsRepoError,
  PipelinesRepoError,
  StagesRepoError,
} from '@flowpunk-indie/db';

import type { Actor, PipelineEnv } from '../types.js';

/**
 * Per-mutation context shared by deals/deal-contacts repo writes.
 * Same shape as `MutationContext` in those repos. Constructed once per
 * handler call from the request actor + env + a fresh `now`.
 */
export interface MutationContext {
  actorId: string;
  credentialType: 'apikey' | 'oauth' | 'session' | 'system';
  recordHistory: boolean;
  now: string;
}

/**
 * Build the mutation context for a request. `recordHistory` defaults
 * `true` when the wrapper has not supplied `PIPELINE_OPTIONS` (per
 * ADR-022 §14).
 */
export function buildMutationCtx(
  actor: Actor,
  env: PipelineEnv,
  now: string,
): MutationContext {
  return {
    actorId: actor.userId,
    credentialType: actor.credentialType,
    recordHistory: env.PIPELINE_OPTIONS?.recordHistory ?? true,
    now,
  };
}

export type Db = DrizzleD1Database<Record<string, never>>;

export function getDb(env: PipelineEnv): Db {
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
 * Map a pipeline-domain repo error (pipelines / stages / deals) to HTTP.
 * Non-repo errors are rethrown so the top-level fetch handler logs them
 * as INTERNAL_ERROR. 500s never include the underlying message in the
 * response body.
 */
export function mapRepoError(err: unknown): Response {
  if (
    !(err instanceof PipelinesRepoError) &&
    !(err instanceof StagesRepoError) &&
    !(err instanceof DealsRepoError) &&
    !(err instanceof DealContactsRepoError) &&
    !(err instanceof DealHistoryRepoError)
  ) {
    throw err;
  }
  const repoLabel =
    err instanceof PipelinesRepoError
      ? 'pipelines'
      : err instanceof StagesRepoError
        ? 'stages'
        : err instanceof DealsRepoError
          ? 'deals'
          : err instanceof DealContactsRepoError
            ? 'deal_contacts'
            : 'deal_history';
  switch (err.code) {
    case 'not_found':
      return errorResponse(404, 'NOT_FOUND', err.message);
    case 'invalid_input':
      return errorResponse(400, 'INVALID_INPUT', err.message);
    case 'wrong_state':
      return errorResponse(409, 'WRONG_STATE', err.message);
    case 'already_exists':
      return errorResponse(409, 'CONFLICT', err.message);
    case 'conflict':
      // Per ADR-022 §8: optimistic-concurrency miss on a deal write.
      // Caller should re-read and retry.
      return errorResponse(409, 'CONFLICT', err.message);
    case 'invariant_violation': {
      const logger = createLogger({ service: 'pipeline' });
      logger.error(`${repoLabel} repo invariant violation`, {
        error: err,
        repoCode: err.code,
      });
      return errorResponse(500, 'INTERNAL_ERROR');
    }
  }
}

// audit emission deferred — see plan §Out of scope.
// Audit union arms for pipelines.* / stages.* / deals.* are not yet
// declared in @flowpunk/service-utils; handlers omit emission entirely
// for v1. Re-introduce by adding union arms and an emitPipelineAudit
// helper modelled on emitContactsAudit.
