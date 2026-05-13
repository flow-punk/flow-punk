import { drizzle, type DrizzleD1Database } from 'drizzle-orm/d1';
import { createLogger, emitAuditEvent } from '@flowpunk/service-utils';
import type { AuditEvent, Logger } from '@flowpunk/service-utils';
import { CustomFieldDefsRepoError } from '@flowpunk-indie/db';
import type {
  CustomFieldBaseModel,
  CustomFieldDef,
  CustomFieldFilterableStatus,
} from '@flowpunk-indie/db';

import type { Actor, CustomFieldsEnv } from '../types.js';

export type Db = DrizzleD1Database<Record<string, never>>;

export function getDb(env: CustomFieldsEnv): Db {
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

export function conflict(
  code: string,
  message?: string,
  details?: Record<string, unknown>,
): Response {
  return errorResponse(409, code, message, details);
}

/**
 * Map a `CustomFieldDefsRepoError` to HTTP. Non-repo errors are rethrown
 * so the top-level fetch handler logs them as `INTERNAL_ERROR`.
 *
 * `duplicate_name` and `cap_exceeded` map to 409 (state conflict on the
 * registry collection); `invalid_transition` maps to 409 (operator
 * attempted an illegal lifecycle move); `version_mismatch` is the
 * If-Match conflict.
 */
export function mapRepoError(err: unknown): Response {
  if (!(err instanceof CustomFieldDefsRepoError)) {
    throw err;
  }
  switch (err.code) {
    case 'not_found':
      return errorResponse(404, 'NOT_FOUND', err.message);
    case 'invalid_input':
      return errorResponse(400, 'INVALID_INPUT', err.message);
    case 'version_mismatch':
      return errorResponse(409, 'VERSION_CONFLICT', err.message);
    case 'duplicate_name':
      return errorResponse(409, 'DUPLICATE_NAME', err.message);
    case 'cap_exceeded':
      return errorResponse(409, 'LIMIT_EXCEEDED', err.message);
    case 'invalid_transition':
      return errorResponse(409, 'INVALID_TRANSITION', err.message);
    case 'wrong_state':
      return errorResponse(409, 'WRONG_STATE', err.message);
  }
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

export type CustomFieldsAuditEventInput = Omit<
  AuditEvent,
  'actorId' | 'actorTenantId' | 'actorCredentialType'
>;

export function emitCustomFieldsAudit(
  actor: Actor,
  event: CustomFieldsAuditEventInput,
  logger?: Logger,
): void {
  const log = logger ?? createLogger({ service: 'custom-fields' });
  emitAuditEvent(log, {
    ...event,
    actorId: actor.userId,
    actorTenantId: actor.tenantId,
    actorCredentialType: actor.credentialType,
  } as AuditEvent);
}

/**
 * Parse `If-Match: <version>` header. The version is a plain integer
 * string; we don't use entity-tags. Missing or malformed header returns
 * `null` so callers can emit 428 PRECONDITION_REQUIRED.
 */
export function parseIfMatchVersion(request: Request): number | null {
  const raw = request.headers.get('If-Match');
  if (!raw) return null;
  // Accept `"<n>"` or `<n>` (drop optional double quotes; HTTP entity-tags
  // are typically quoted, but several clients send the bare integer).
  const trimmed = raw.trim().replace(/^"(.*)"$/, '$1');
  if (!/^\d+$/.test(trimmed)) return null;
  const n = Number.parseInt(trimmed, 10);
  if (!Number.isInteger(n) || n < 1) return null;
  return n;
}

const BASE_MODELS = new Set<CustomFieldBaseModel>([
  'person',
  'account',
  'deal',
]);

export function parseBaseModelParam(
  url: URL,
): { kind: 'ok'; baseModel: CustomFieldBaseModel } | { kind: 'err'; response: Response } {
  const raw = url.searchParams.get('baseModel');
  if (!raw) {
    return {
      kind: 'err',
      response: badRequest(
        'INVALID_INPUT',
        'baseModel query parameter is required',
      ),
    };
  }
  if (!BASE_MODELS.has(raw as CustomFieldBaseModel)) {
    return {
      kind: 'err',
      response: badRequest(
        'INVALID_INPUT',
        'baseModel must be one of: person, account, deal',
      ),
    };
  }
  return { kind: 'ok', baseModel: raw as CustomFieldBaseModel };
}

export function isBaseModelAllowed(
  baseModel: CustomFieldBaseModel,
  allowed: readonly CustomFieldBaseModel[],
): boolean {
  return allowed.includes(baseModel);
}

/**
 * Wire shape of a custom field definition.
 *
 * SQLite stores `pii` as INTEGER 0/1, but the HTTP API takes and returns
 * `pii` as a boolean. This serializer is the single coercion point — all
 * handlers MUST run their repo rows through it before serializing to
 * JSON so the OpenAPI contract matches reality.
 */
export interface SerializedCustomFieldDef {
  id: string;
  baseModel: CustomFieldBaseModel;
  name: string;
  description: string | null;
  pii: boolean;
  filterableStatus: CustomFieldFilterableStatus;
  filterableError: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
  archivedAt: string | null;
}

export function serializeDef(def: CustomFieldDef): SerializedCustomFieldDef {
  return {
    id: def.id,
    baseModel: def.baseModel,
    name: def.name,
    description: def.description,
    pii: def.pii === 1,
    filterableStatus: def.filterableStatus,
    filterableError: def.filterableError,
    version: def.version,
    createdAt: def.createdAt,
    updatedAt: def.updatedAt,
    createdBy: def.createdBy,
    updatedBy: def.updatedBy,
    archivedAt: def.archivedAt,
  };
}
