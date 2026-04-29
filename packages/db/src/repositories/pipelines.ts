/**
 * Pipelines repository — indie base CRM entity.
 *
 * Functional style (matches indie/packages/db/src/repositories/persons.ts).
 * Throws `PipelinesRepoError` for caller-actionable failures; handlers map
 * via `mapRepoError` in the pipeline service.
 *
 * Validation lives here, not in handlers, so any caller (REST handler,
 * future internal job, future MCP tool) gets the same input contract.
 *
 * `tenant_id` is intentionally absent (single-tenant indie per ADR-011);
 * isolation is the deploy itself.
 *
 * Cascade-block on softDelete: a pipeline cannot be deleted while it has
 * any active stages or active deals. Enforced by a single conditional
 * UPDATE — atomic vs. concurrent stage/deal inserts.
 */
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import { and, desc, eq, lt, or, sql } from 'drizzle-orm';
import { generateId } from '@flowpunk/service-utils';

import { deals } from '../schema/deals.js';
import {
  ALLOWED_PATCH_FIELDS,
  NULLABLE_PATCH_FIELDS,
  isAllowedPatchField,
  isImmutablePatchField,
  pipelines,
  type NewPipeline,
  type Pipeline,
  type PipelinePatchableField,
} from '../schema/pipelines.js';
import { stages } from '../schema/stages.js';

type Db = DrizzleD1Database<Record<string, never>>;

export class PipelinesRepoError extends Error {
  constructor(
    public readonly code:
      | 'not_found'
      | 'invalid_input'
      | 'wrong_state'
      | 'invariant_violation',
    message: string,
  ) {
    super(message);
    this.name = 'PipelinesRepoError';
  }
}

const NAME_MIN = 1;
const NAME_MAX = 256;
const DESCRIPTION_MAX = 1024;

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

export interface CreatePipelineInput {
  name: string;
  description?: string | null;
  isDefault?: boolean | number;
}

export type UpdatePipelinePatch = Partial<{
  name: string;
  description: string | null;
  isDefault: boolean | number;
}>;

export interface ListOptions {
  limit?: number;
  cursor?: string | null;
  includeDeleted?: boolean;
}

export interface ListResult {
  items: Pipeline[];
  nextCursor: string | null;
}

export interface UpdateResult {
  pipeline: Pipeline;
  fieldsChanged: PipelinePatchableField[];
}

export async function create(
  db: Db,
  input: CreatePipelineInput,
  actorId: string,
  now: string,
): Promise<Pipeline> {
  const normalized = validateCreate(input);
  const row: NewPipeline = {
    id: generateId('pl'),
    name: normalized.name,
    description: normalized.description ?? null,
    isDefault: normalized.isDefault ?? 0,
    status: 'active',
    deletedAt: null,
    deletedBy: null,
    createdAt: now,
    createdBy: actorId,
    updatedAt: now,
    updatedBy: actorId,
  };

  try {
    const inserted = await db.insert(pipelines).values(row).returning();
    const pipeline = inserted[0];
    if (!pipeline) {
      throw new PipelinesRepoError(
        'invariant_violation',
        'insert returned no row',
      );
    }
    return pipeline;
  } catch (err) {
    // Partial unique index violation (default-pipeline collision).
    if (isUniqueDefaultViolation(err)) {
      throw new PipelinesRepoError(
        'wrong_state',
        'another active pipeline is already marked default',
      );
    }
    throw err;
  }
}

export async function findById(
  db: Db,
  id: string,
  options: { includeDeleted?: boolean } = {},
): Promise<Pipeline | null> {
  const rows = await db
    .select()
    .from(pipelines)
    .where(eq(pipelines.id, id))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  if (!options.includeDeleted && row.status !== 'active') return null;
  return row;
}

export async function list(db: Db, options: ListOptions = {}): Promise<ListResult> {
  const limit = clampLimit(options.limit);
  const cursor = options.cursor ? decodeCursor(options.cursor) : null;

  const filters = [];
  if (!options.includeDeleted) filters.push(eq(pipelines.status, 'active'));
  if (cursor) {
    filters.push(
      or(
        lt(pipelines.createdAt, cursor.createdAt),
        and(
          eq(pipelines.createdAt, cursor.createdAt),
          lt(pipelines.id, cursor.id),
        ),
      )!,
    );
  }

  const where =
    filters.length === 0
      ? undefined
      : filters.length === 1
        ? filters[0]
        : and(...filters);

  const rows = await db
    .select()
    .from(pipelines)
    .where(where as any)
    .orderBy(desc(pipelines.createdAt), desc(pipelines.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor =
    hasMore && items.length > 0
      ? encodeCursor({
          createdAt: items[items.length - 1]!.createdAt,
          id: items[items.length - 1]!.id,
        })
      : null;

  return { items, nextCursor };
}

export async function update(
  db: Db,
  id: string,
  patch: UpdatePipelinePatch,
  actorId: string,
  now: string,
): Promise<UpdateResult> {
  for (const key of Object.keys(patch)) {
    if (isImmutablePatchField(key)) {
      throw new PipelinesRepoError(
        'invalid_input',
        `field "${key}" is immutable`,
      );
    }
    if (!isAllowedPatchField(key)) {
      throw new PipelinesRepoError(
        'invalid_input',
        `field "${key}" is not patchable`,
      );
    }
  }

  const changes: Partial<Record<PipelinePatchableField, unknown>> = {};
  const fieldsChanged: PipelinePatchableField[] = [];

  for (const field of ALLOWED_PATCH_FIELDS) {
    if (!(field in patch)) continue;
    const value = patch[field];
    if (value === null) {
      if (!NULLABLE_PATCH_FIELDS.has(field)) {
        throw new PipelinesRepoError(
          'invalid_input',
          `field "${field}" cannot be null`,
        );
      }
      changes[field] = null;
      fieldsChanged.push(field);
      continue;
    }
    if (value === undefined) continue;
    validateField(field, value);
    changes[field] = normalizeField(field, value);
    fieldsChanged.push(field);
  }

  if (fieldsChanged.length === 0) {
    const current = await findById(db, id);
    if (!current) {
      throw new PipelinesRepoError('not_found', `pipeline "${id}" not found`);
    }
    return { pipeline: current, fieldsChanged: [] };
  }

  try {
    const updated = await db
      .update(pipelines)
      .set({ ...changes, updatedAt: now, updatedBy: actorId } as any)
      .where(and(eq(pipelines.id, id), eq(pipelines.status, 'active')))
      .returning();

    const row = updated[0];
    if (!row) {
      const existing = await db
        .select({ status: pipelines.status })
        .from(pipelines)
        .where(eq(pipelines.id, id))
        .limit(1);
      if (existing[0]) {
        throw new PipelinesRepoError(
          'wrong_state',
          `pipeline "${id}" is not active`,
        );
      }
      throw new PipelinesRepoError('not_found', `pipeline "${id}" not found`);
    }

    return { pipeline: row, fieldsChanged };
  } catch (err) {
    if (err instanceof PipelinesRepoError) throw err;
    if (isUniqueDefaultViolation(err)) {
      throw new PipelinesRepoError(
        'wrong_state',
        'another active pipeline is already marked default',
      );
    }
    throw err;
  }
}

/**
 * Soft-delete a pipeline. Atomic guard: blocked when ANY active stage or
 * active deal references this pipeline. The conditional UPDATE includes
 * `NOT EXISTS` clauses so concurrent stage/deal inserts cannot slip
 * through between a pre-check and the write.
 */
export async function softDelete(
  db: Db,
  id: string,
  actorId: string,
  now: string,
): Promise<Pipeline> {
  const updated = await db
    .update(pipelines)
    .set({
      status: 'deleted',
      deletedAt: now,
      deletedBy: actorId,
      updatedAt: now,
      updatedBy: actorId,
    })
    .where(
      and(
        eq(pipelines.id, id),
        eq(pipelines.status, 'active'),
        sql`NOT EXISTS (SELECT 1 FROM stages WHERE pipeline_id = ${id} AND status = 'active')`,
        sql`NOT EXISTS (SELECT 1 FROM deals WHERE pipeline_id = ${id} AND status = 'active')`,
      ),
    )
    .returning();

  const row = updated[0];
  if (row) return row;

  // Disambiguate the failure: not found / already deleted / has dependents.
  const existing = await db
    .select({ status: pipelines.status })
    .from(pipelines)
    .where(eq(pipelines.id, id))
    .limit(1);
  if (!existing[0]) {
    throw new PipelinesRepoError('not_found', `pipeline "${id}" not found`);
  }
  if (existing[0].status !== 'active') {
    throw new PipelinesRepoError(
      'wrong_state',
      `pipeline "${id}" is already deleted`,
    );
  }

  const stageCount = await db
    .select({ id: stages.id })
    .from(stages)
    .where(and(eq(stages.pipelineId, id), eq(stages.status, 'active')))
    .limit(1);
  if (stageCount[0]) {
    throw new PipelinesRepoError(
      'wrong_state',
      `pipeline "${id}" has active stages`,
    );
  }
  const dealCount = await db
    .select({ id: deals.id })
    .from(deals)
    .where(and(eq(deals.pipelineId, id), eq(deals.status, 'active')))
    .limit(1);
  if (dealCount[0]) {
    throw new PipelinesRepoError(
      'wrong_state',
      `pipeline "${id}" has active deals`,
    );
  }
  throw new PipelinesRepoError(
    'invariant_violation',
    `pipeline "${id}" softDelete failed for unknown reason`,
  );
}

// ---------- validation / normalization ----------

interface NormalizedCreate {
  name: string;
  description?: string | null;
  isDefault?: number;
}

function validateCreate(input: CreatePipelineInput): NormalizedCreate {
  if (typeof input.name !== 'string') {
    throw new PipelinesRepoError(
      'invalid_input',
      'name is required and must be a string',
    );
  }
  const out: NormalizedCreate = { name: input.name.trim() };
  validateName(out.name);

  if ('description' in input) {
    if (input.description === null || input.description === undefined) {
      out.description = null;
    } else {
      validateDescription(input.description);
      out.description = input.description.trim();
    }
  }

  if ('isDefault' in input && input.isDefault !== undefined) {
    out.isDefault = normalizeIsDefault(input.isDefault);
  }

  return out;
}

function validateField(field: PipelinePatchableField, value: unknown): void {
  switch (field) {
    case 'name':
      if (typeof value !== 'string') {
        throw new PipelinesRepoError('invalid_input', 'name must be a string');
      }
      validateName(value.trim());
      return;
    case 'description':
      validateDescription(value);
      return;
    case 'isDefault':
      // normalize handles range; just type-check here
      if (typeof value !== 'boolean' && typeof value !== 'number') {
        throw new PipelinesRepoError(
          'invalid_input',
          'isDefault must be a boolean or 0/1',
        );
      }
      return;
  }
}

function normalizeField(field: PipelinePatchableField, value: unknown): unknown {
  if (field === 'name' && typeof value === 'string') return value.trim();
  if (field === 'description' && typeof value === 'string') {
    return value.trim();
  }
  if (field === 'isDefault') return normalizeIsDefault(value as any);
  return value;
}

function normalizeIsDefault(raw: boolean | number): number {
  if (typeof raw === 'boolean') return raw ? 1 : 0;
  if (raw === 0 || raw === 1) return raw;
  throw new PipelinesRepoError(
    'invalid_input',
    'isDefault must be a boolean or 0/1',
  );
}

function validateName(value: string): void {
  if (value.length < NAME_MIN || value.length > NAME_MAX) {
    throw new PipelinesRepoError(
      'invalid_input',
      `name must be ${NAME_MIN}-${NAME_MAX} characters`,
    );
  }
}

function validateDescription(value: unknown): void {
  if (typeof value !== 'string') {
    throw new PipelinesRepoError(
      'invalid_input',
      'description must be a string',
    );
  }
  if (value.length > DESCRIPTION_MAX) {
    throw new PipelinesRepoError(
      'invalid_input',
      `description must be ≤ ${DESCRIPTION_MAX} characters`,
    );
  }
}

function clampLimit(raw: unknown): number {
  if (raw === undefined || raw === null) return DEFAULT_LIMIT;
  if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 1) {
    throw new PipelinesRepoError(
      'invalid_input',
      'limit must be a positive integer',
    );
  }
  return Math.min(raw, MAX_LIMIT);
}

function isUniqueDefaultViolation(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /idx_pipelines_default_unique|UNIQUE constraint/i.test(msg);
}

// ---------- cursor (duplicated from persons; consolidate in v2) ----------

export interface CursorPayload {
  createdAt: string;
  id: string;
}

export function encodeCursor(payload: CursorPayload): string {
  const json = JSON.stringify({ createdAt: payload.createdAt, id: payload.id });
  return base64UrlEncode(json);
}

export function decodeCursor(raw: string): CursorPayload {
  let json: string;
  try {
    json = base64UrlDecode(raw);
  } catch {
    throw new PipelinesRepoError('invalid_input', 'malformed cursor');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new PipelinesRepoError('invalid_input', 'malformed cursor');
  }
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    Array.isArray(parsed)
  ) {
    throw new PipelinesRepoError('invalid_input', 'malformed cursor');
  }
  const obj = parsed as Record<string, unknown>;
  const keys = Object.keys(obj);
  if (
    keys.length !== 2 ||
    !keys.includes('createdAt') ||
    !keys.includes('id') ||
    typeof obj.createdAt !== 'string' ||
    typeof obj.id !== 'string'
  ) {
    throw new PipelinesRepoError('invalid_input', 'malformed cursor');
  }
  return { createdAt: obj.createdAt, id: obj.id };
}

function base64UrlEncode(input: string): string {
  const utf8 = new TextEncoder().encode(input);
  let bin = '';
  for (const byte of utf8) bin += String.fromCharCode(byte);
  const b64 = typeof btoa === 'function' ? btoa(bin) : nodeBtoa(bin);
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(input: string): string {
  const padded =
    input.replace(/-/g, '+').replace(/_/g, '/') +
    '='.repeat((4 - (input.length % 4)) % 4);
  const bin = typeof atob === 'function' ? atob(padded) : nodeAtob(padded);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

function nodeBtoa(s: string): string {
  return Buffer.from(s, 'binary').toString('base64');
}

function nodeAtob(s: string): string {
  return Buffer.from(s, 'base64').toString('binary');
}
