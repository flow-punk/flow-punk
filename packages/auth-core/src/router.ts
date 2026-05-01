/**
 * Auth-core router. Handles api-key CRUD (`/api/v1/auth/keys/*`) and the
 * gateway-side `POST /auth/validate` for `fpk_*` tokens.
 *
 * Per ADR-001:19 + ADR-013, `api_keys` rows live in the per-tenant D1
 * (managed) or single bound D1 (indie). The schema does NOT carry a
 * `tenant_id` column; the tenant is the D1 the row lives in. The
 * encoded `fpk_<scope>.<random>` token carries the tenant scope so the
 * gateway can route validation to the right D1 before forwarding to
 * AUTH_SERVICE. The validate endpoint receives the tenantId in the body
 * (alongside the credential) so it can stamp the trusted identity
 * header without an extra lookup. See ADR-013 §"Auth flow rewrite".
 */
import { drizzle } from 'drizzle-orm/d1';
import { extractIdentityHeaders, sha256Hex } from '@flowpunk/gateway/auth';
import { createLogger } from '@flowpunk/service-utils';
import {
  ApiKeysRepoError,
  apiKeysRepo,
  hasAdminRights,
  usersRepo,
  type ApiKey,
} from '@flowpunk-indie/db';

import type { Actor, AuthEnv } from './types.js';

const API_KEYS_COLLECTION = '/api/v1/auth/keys';
const API_KEYS_ITEM_PREFIX = '/api/v1/auth/keys/';
const VALIDATE_PATH = '/auth/validate';
const LAST_USED_TTL_SECONDS = 60;
const MAX_BODY_BYTES = 32_768;

interface CreateKeyBody {
  label?: unknown;
  scopes?: unknown;
  expiresAt?: unknown;
  rotatedFrom?: unknown;
}

interface ValidateBody {
  credential?: unknown;
  credentialType?: unknown;
  /**
   * Tenant scope parsed by the gateway from the `fpk_<scope>.<random>`
   * prefix. Stamped back into the validation response so identity
   * headers carry the same value the gateway already routed on. See
   * ADR-013 §"Auth flow rewrite".
   */
  tenantId?: unknown;
}

export async function route(
  request: Request,
  env: AuthEnv,
  requestId = crypto.randomUUID(),
): Promise<Response> {
  const url = new URL(request.url);
  const method = request.method.toUpperCase();

  if (url.pathname === '/health') {
    if (method === 'GET' || method === 'HEAD') {
      return jsonResponse(200, { ok: true, service: 'auth' });
    }
    return methodNotAllowed(['GET', 'HEAD']);
  }

  if (url.pathname === VALIDATE_PATH) {
    if (method !== 'POST') return methodNotAllowed(['POST']);
    return handleValidate(request, env);
  }

  if (url.pathname === API_KEYS_COLLECTION || url.pathname === `${API_KEYS_COLLECTION}/`) {
    const guard = await requireSessionAdmin(request, env);
    if (!guard.ok) return guard.response;
    if (method === 'POST') return handleCreate(request, env, guard.actor, requestId);
    if (method === 'GET') return handleList(env, guard.actor);
    return methodNotAllowed(['GET', 'POST']);
  }

  if (url.pathname.startsWith(API_KEYS_ITEM_PREFIX)) {
    const id = url.pathname.slice(API_KEYS_ITEM_PREFIX.length);
    if (!id || id.includes('/')) return notFound();
    const guard = await requireSessionAdmin(request, env);
    if (!guard.ok) return guard.response;
    if (method === 'GET' || method === 'HEAD') return handleGet(env, guard.actor, id);
    if (method === 'DELETE') return handleRevoke(env, guard.actor, id, requestId);
    return methodNotAllowed(['GET', 'HEAD', 'DELETE']);
  }

  return notFound();
}

async function handleCreate(
  request: Request,
  env: AuthEnv,
  actor: Actor,
  requestId: string,
): Promise<Response> {
  const body = await readJson<CreateKeyBody>(request);
  if (!body.ok) return body.response;
  if (typeof body.value.label !== 'string') {
    return errorResponse(400, 'INVALID_LABEL', 'label is required');
  }
  if (!Array.isArray(body.value.scopes)) {
    return errorResponse(400, 'INVALID_SCOPES', 'scopes must be an array');
  }
  if (
    body.value.expiresAt !== undefined &&
    body.value.expiresAt !== null &&
    typeof body.value.expiresAt !== 'string'
  ) {
    return errorResponse(400, 'INVALID_EXPIRES_AT');
  }

  const db = drizzle(env.DB);
  const now = new Date().toISOString();
  // Token format `fpk_<scope>.<random>` per ADR-013 §"Credential format".
  // The scope segment encodes the tenantId so the gateway can route
  // validation to the right D1 before calling AUTH_SERVICE.
  const token = generateApiKeyToken(actor.tenantId);
  const hash = await sha256Hex(token);
  const rotatedFrom =
    typeof body.value.rotatedFrom === 'string' ? body.value.rotatedFrom : null;

  if (rotatedFrom) {
    const predecessor = await apiKeysRepo.findForUser(db, actor.userId, rotatedFrom);
    if (!predecessor || !predecessor.revokedAt) {
      return errorResponse(
        400,
        'INVALID_ROTATED_FROM',
        'rotatedFrom must reference an owned revoked API key',
      );
    }
  }

  try {
    const key = await apiKeysRepo.create(
      db,
      {
        userId: actor.userId,
        label: body.value.label,
        // `prefix` stays as the first 8 chars of the raw token (e.g.
        // `fpk_abcd`) for partial-match lookups and human display.
        prefix: token.slice(0, 8),
        hash,
        scopes: body.value.scopes as string[],
        expiresAt:
          typeof body.value.expiresAt === 'string' ? body.value.expiresAt : null,
      },
      actor.userId,
      now,
      { maxActiveKeys: env.AUTH_OPTIONS.maxActiveKeys },
    );
    emitCredentialLog(rotatedFrom ? 'credential.rotated' : 'credential.created', {
      key,
      actor,
      requestId,
    });
    return jsonResponse(201, {
      success: true,
      data: { ...serializeKey(key, actor.tenantId), token },
    });
  } catch (err) {
    return mapRepoError(err);
  }
}

async function handleList(env: AuthEnv, actor: Actor): Promise<Response> {
  const keys = await apiKeysRepo.listForUser(drizzle(env.DB), actor.userId);
  return jsonResponse(200, {
    success: true,
    data: keys.map((k) => serializeKey(k, actor.tenantId)),
  });
}

async function handleGet(
  env: AuthEnv,
  actor: Actor,
  id: string,
): Promise<Response> {
  const key = await apiKeysRepo.findForUser(drizzle(env.DB), actor.userId, id);
  if (!key || key.revokedAt) return notFound();
  return jsonResponse(200, {
    success: true,
    data: serializeKey(key, actor.tenantId),
  });
}

async function handleRevoke(
  env: AuthEnv,
  actor: Actor,
  id: string,
  requestId: string,
): Promise<Response> {
  try {
    const key = await apiKeysRepo.revoke(
      drizzle(env.DB),
      actor.userId,
      id,
      actor.userId,
      new Date().toISOString(),
    );
    emitCredentialLog('credential.revoked', { key, actor, requestId });
    return jsonResponse(200, {
      success: true,
      data: serializeKey(key, actor.tenantId),
    });
  } catch (err) {
    return mapRepoError(err);
  }
}

async function handleValidate(
  request: Request,
  env: AuthEnv,
): Promise<Response> {
  const body = await readJson<ValidateBody>(request);
  if (!body.ok) return body.response;
  if (
    typeof body.value.credential !== 'string' ||
    body.value.credentialType !== 'apikey' ||
    !body.value.credential.startsWith('fpk_')
  ) {
    return errorResponse(401, 'INVALID_TOKEN');
  }
  if (typeof body.value.tenantId !== 'string' || body.value.tenantId.length === 0) {
    return errorResponse(401, 'INVALID_TOKEN');
  }
  const tenantId = body.value.tenantId;

  const db = drizzle(env.DB);
  const now = new Date().toISOString();
  const hash = await sha256Hex(body.value.credential);
  const key = await apiKeysRepo.validateByHash(db, hash, now);
  if (!key) return errorResponse(401, 'INVALID_TOKEN');

  const user = await usersRepo.findById(db, key.userId, { includeDeleted: true });
  if (!user || user.status !== 'active' || !hasAdminRights(user.role)) {
    return errorResponse(401, 'INVALID_TOKEN');
  }

  await touchLastUsed(env, db, key.id, now);
  return jsonResponse(200, {
    tenantId,
    userId: key.userId,
    scope: key.scope,
    credentialId: key.id,
    keyLabel: key.label,
  });
}

type AdminResult =
  | { ok: true; actor: Actor }
  | { ok: false; response: Response };

async function requireSessionAdmin(
  request: Request,
  env: AuthEnv,
): Promise<AdminResult> {
  const identity = extractIdentityHeaders(request.headers);
  if (!identity) {
    return { ok: false, response: errorResponse(401, 'UNAUTHENTICATED') };
  }
  const actor: Actor = { ...identity };
  if (actor.credentialType !== 'session') {
    return {
      ok: false,
      response: errorResponse(
        403,
        'ADMIN_CREDENTIAL_REQUIRED',
        'API key management requires session authentication.',
      ),
    };
  }
  const user = await usersRepo.findById(drizzle(env.DB), actor.userId, {
    includeDeleted: true,
  });
  if (!user || user.status !== 'active' || !hasAdminRights(user.role)) {
    return { ok: false, response: errorResponse(403, 'FORBIDDEN') };
  }
  return { ok: true, actor };
}

async function touchLastUsed(
  env: AuthEnv,
  db: Parameters<typeof apiKeysRepo.touchLastUsed>[0],
  credentialId: string,
  now: string,
): Promise<void> {
  const cacheKey = `last_seen:${credentialId}`;
  try {
    if (await env.LAST_USED_KV.get(cacheKey)) return;
  } catch {
    // KV is a write-coalescing optimization; fall through to D1.
  }
  await apiKeysRepo.touchLastUsed(db, credentialId, now);
  try {
    await env.LAST_USED_KV.put(cacheKey, now, {
      expirationTtl: LAST_USED_TTL_SECONDS,
    });
  } catch {
    // Last-used precision is best-effort.
  }
}

async function readJson<T>(
  request: Request,
): Promise<{ ok: true; value: T } | { ok: false; response: Response }> {
  const contentType = request.headers.get('Content-Type') ?? '';
  if (!contentType.includes('application/json')) {
    return {
      ok: false,
      response: errorResponse(400, 'INVALID_BODY', 'request body must be JSON'),
    };
  }
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) {
    return { ok: false, response: errorResponse(413, 'REQUEST_TOO_LARGE') };
  }
  try {
    return { ok: true, value: JSON.parse(text) as T };
  } catch {
    return { ok: false, response: errorResponse(400, 'INVALID_BODY') };
  }
}

function serializeKey(key: ApiKey, tenantId: string): Record<string, unknown> {
  return {
    id: key.id,
    tenantId,
    label: key.label,
    prefix: key.prefix,
    scopes: apiKeysRepo.parseStoredScopes(key.scopes) ?? [],
    expiresAt: key.expiresAt,
    lastUsedAt: key.lastUsedAt,
    revokedAt: key.revokedAt,
    createdAt: key.createdAt,
  };
}

/**
 * Format: `fpk_<tenantScope>.<32 random base64url bytes>`. The scope
 * encodes the tenantId so the gateway can route validation to the right
 * D1 before calling AUTH_SERVICE. Indie stamps `_system` as the scope.
 */
function generateApiKeyToken(tenantScope: string): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return `fpk_${tenantScope}.${base64UrlEncode(bytes)}`;
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function emitCredentialLog(
  action: 'credential.created' | 'credential.rotated' | 'credential.revoked',
  input: { key: ApiKey; actor: Actor; requestId: string },
): void {
  const logger = createLogger({ service: 'auth' })
    .withRequestId(input.requestId)
    .withTenantId(input.actor.tenantId)
    .withUserId(input.actor.userId);
  logger.info(action, {
    credentialId: input.key.id,
    userId: input.key.userId,
    tenantId: input.actor.tenantId,
    credentialType: 'apikey',
    keyLabel: input.key.label,
    timestamp: new Date().toISOString(),
  });
}

function mapRepoError(err: unknown): Response {
  if (!(err instanceof ApiKeysRepoError)) throw err;
  if (err.code === 'not_found') return notFound();
  if (err.code === 'invalid_input') {
    return errorResponse(400, err.detailCode ?? 'INVALID_INPUT', err.message);
  }
  if (err.code === 'wrong_state') {
    return errorResponse(409, err.detailCode ?? 'WRONG_STATE', err.message);
  }
  return errorResponse(500, 'INTERNAL_ERROR');
}

function errorResponse(status: number, code: string, message?: string): Response {
  return jsonResponse(status, {
    success: false,
    error: { code, ...(message ? { message } : {}) },
  });
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function methodNotAllowed(allow: string[]): Response {
  return new Response(
    JSON.stringify({ success: false, error: { code: 'METHOD_NOT_ALLOWED' } }),
    {
      status: 405,
      headers: {
        'Content-Type': 'application/json',
        Allow: allow.join(', '),
      },
    },
  );
}

function notFound(): Response {
  return errorResponse(404, 'NOT_FOUND');
}
