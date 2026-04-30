import type { DrizzleD1Database } from 'drizzle-orm/d1';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { generateId } from '@flowpunk/service-utils';

import {
  API_KEY_SCOPE_VALUES,
  apiKeys,
  type ApiKey,
  type ApiKeyScope,
  type NewApiKey,
} from '../schema/api-keys.js';

type Db = DrizzleD1Database<Record<string, never>>;

export class ApiKeysRepoError extends Error {
  constructor(
    public readonly code:
      | 'not_found'
      | 'invalid_input'
      | 'wrong_state'
      | 'invariant_violation',
    message: string,
    public readonly detailCode?: string,
  ) {
    super(message);
    this.name = 'ApiKeysRepoError';
  }
}

export const API_KEY_MAX_ACTIVE_INDIE = 1;
export const API_KEY_MAX_ACTIVE_MANAGED = 5;
export const API_KEY_MAX_EXPIRES_MS = 365 * 24 * 60 * 60 * 1000;
export const API_KEY_LABEL_MIN = 1;
export const API_KEY_LABEL_MAX = 64;

const API_KEY_SCOPE_SET = new Set<string>(API_KEY_SCOPE_VALUES);

export interface CreateApiKeyInput {
  userId: string;
  tenantId: string;
  label: string;
  hash: string;
  prefix: string;
  scopes: readonly string[];
  expiresAt?: string | null;
}

export interface CreateApiKeyOptions {
  maxActiveKeys: number;
}

export interface ListApiKeysOptions {
  includeRevoked?: boolean;
}

export interface ValidatedApiKey {
  id: string;
  userId: string;
  tenantId: string;
  label: string;
  scope: string;
  expiresAt: string | null;
}

export async function create(
  db: Db,
  input: CreateApiKeyInput,
  actorId: string,
  now: string,
  options: CreateApiKeyOptions,
): Promise<ApiKey> {
  const normalized = validateCreate(input, now);
  const activeCount = await countActiveForUser(db, normalized.userId);
  if (activeCount >= options.maxActiveKeys) {
    throw new ApiKeysRepoError(
      'wrong_state',
      'active API key limit reached',
      'API_KEY_LIMIT_REACHED',
    );
  }

  const id = generateId('apk');
  const row: NewApiKey = {
    id,
    userId: normalized.userId,
    tenantId: normalized.tenantId,
    label: normalized.label,
    hash: normalized.hash,
    prefix: normalized.prefix,
    scopes: JSON.stringify(normalized.scopes),
    expiresAt: normalized.expiresAt,
    lastUsedAt: null,
    revokedAt: null,
    createdAt: now,
    createdBy: actorId,
    updatedAt: now,
    updatedBy: actorId,
  };

  try {
    const inserted = await db.insert(apiKeys).values(row).returning();
    const key = inserted[0];
    if (!key) {
      throw new ApiKeysRepoError(
        'invariant_violation',
        'insert returned no row',
      );
    }
    return key;
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new ApiKeysRepoError(
        'wrong_state',
        'active API key label or token hash already exists',
        'API_KEY_CONFLICT',
      );
    }
    throw err;
  }
}

export async function listForUser(
  db: Db,
  userId: string,
  options: ListApiKeysOptions = {},
): Promise<ApiKey[]> {
  const conditions = [eq(apiKeys.userId, userId)];
  if (!options.includeRevoked) conditions.push(isNull(apiKeys.revokedAt));
  return db
    .select()
    .from(apiKeys)
    .where(and(...conditions))
    .orderBy(desc(apiKeys.createdAt), desc(apiKeys.id));
}

export async function findForUser(
  db: Db,
  userId: string,
  id: string,
): Promise<ApiKey | null> {
  const rows = await db
    .select()
    .from(apiKeys)
    .where(and(eq(apiKeys.userId, userId), eq(apiKeys.id, id)))
    .limit(1);
  return rows[0] ?? null;
}

export async function revoke(
  db: Db,
  userId: string,
  id: string,
  actorId: string,
  now: string,
): Promise<ApiKey> {
  await db
    .update(apiKeys)
    .set({ revokedAt: now, updatedAt: now, updatedBy: actorId })
    .where(
      and(eq(apiKeys.userId, userId), eq(apiKeys.id, id), isNull(apiKeys.revokedAt)),
    );
  const key = await findForUser(db, userId, id);
  if (!key) {
    throw new ApiKeysRepoError('not_found', 'API key not found');
  }
  return key;
}

export async function validateByHash(
  db: Db,
  hash: string,
  now: string,
): Promise<ValidatedApiKey | null> {
  if (!hash) return null;
  const rows = await db
    .select()
    .from(apiKeys)
    .where(eq(apiKeys.hash, hash))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  if (row.revokedAt) return null;
  if (row.expiresAt && !isFuture(row.expiresAt, now)) return null;
  const scopes = parseStoredScopes(row.scopes);
  if (!scopes) return null;
  return {
    id: row.id,
    userId: row.userId,
    tenantId: row.tenantId,
    label: row.label,
    scope: scopes.join(' '),
    expiresAt: row.expiresAt,
  };
}

export async function touchLastUsed(
  db: Db,
  id: string,
  now: string,
): Promise<void> {
  await db
    .update(apiKeys)
    .set({ lastUsedAt: now, updatedAt: now, updatedBy: 'auth-service' })
    .where(eq(apiKeys.id, id));
}

export function parseStoredScopes(raw: string): ApiKeyScope[] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed) || parsed.length === 0) return null;
  const scopes: ApiKeyScope[] = [];
  for (const value of parsed) {
    if (typeof value !== 'string' || !API_KEY_SCOPE_SET.has(value)) {
      return null;
    }
    scopes.push(value as ApiKeyScope);
  }
  return [...new Set(scopes)];
}

function validateCreate(input: CreateApiKeyInput, now: string): Required<CreateApiKeyInput> {
  const userId = input.userId.trim();
  const tenantId = input.tenantId.trim();
  const label = input.label.trim();
  const hash = input.hash.trim();
  const prefix = input.prefix.trim();

  if (!userId) throw invalid('userId is required', 'INVALID_USER_ID');
  if (!tenantId) throw invalid('tenantId is required', 'INVALID_TENANT_ID');
  if (label.length < API_KEY_LABEL_MIN || label.length > API_KEY_LABEL_MAX) {
    throw invalid('label must be 1-64 characters', 'INVALID_LABEL');
  }
  if (!hash) throw invalid('hash is required', 'INVALID_HASH');
  if (!prefix) throw invalid('prefix is required', 'INVALID_PREFIX');

  const scopes = normalizeScopes(input.scopes);
  const expiresAt = input.expiresAt ?? null;
  if (expiresAt !== null) validateExpiresAt(expiresAt, now);

  return { userId, tenantId, label, hash, prefix, scopes, expiresAt };
}

function normalizeScopes(scopes: readonly string[]): ApiKeyScope[] {
  if (!Array.isArray(scopes) || scopes.length === 0) {
    throw invalid('scopes must be a non-empty array', 'INVALID_SCOPES');
  }
  const out: ApiKeyScope[] = [];
  for (const scope of scopes) {
    if (typeof scope !== 'string' || !API_KEY_SCOPE_SET.has(scope)) {
      throw invalid('scopes may only include read and write', 'INVALID_SCOPES');
    }
    out.push(scope as ApiKeyScope);
  }
  return [...new Set(out)];
}

function validateExpiresAt(expiresAt: string, now: string): void {
  const expiresMs = Date.parse(expiresAt);
  const nowMs = Date.parse(now);
  if (!Number.isFinite(expiresMs) || !Number.isFinite(nowMs) || expiresMs <= nowMs) {
    throw invalid('expiresAt must be a future ISO 8601 timestamp', 'INVALID_EXPIRES_AT');
  }
  if (expiresMs - nowMs > API_KEY_MAX_EXPIRES_MS) {
    throw invalid('expiresAt must be within 1 year', 'INVALID_EXPIRES_AT');
  }
}

function isFuture(expiresAt: string, now: string): boolean {
  const expiresMs = Date.parse(expiresAt);
  const nowMs = Date.parse(now);
  return Number.isFinite(expiresMs) && Number.isFinite(nowMs) && expiresMs > nowMs;
}

async function countActiveForUser(db: Db, userId: string): Promise<number> {
  const rows = await db
    .select({ count: sql<number>`count(*)` })
    .from(apiKeys)
    .where(and(eq(apiKeys.userId, userId), isNull(apiKeys.revokedAt)));
  return Number(rows[0]?.count ?? 0);
}

function invalid(message: string, detailCode: string): ApiKeysRepoError {
  return new ApiKeysRepoError('invalid_input', message, detailCode);
}

function isUniqueViolation(err: unknown): boolean {
  return (
    err instanceof Error &&
    /unique constraint|constraint failed|SQLITE_CONSTRAINT/i.test(err.message)
  );
}
