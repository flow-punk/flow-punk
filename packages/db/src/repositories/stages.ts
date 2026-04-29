/**
 * Stages repository — indie base CRM entity.
 *
 * Functional style (matches indie/packages/db/src/repositories/persons.ts).
 * Throws `StagesRepoError` for caller-actionable failures; handlers map
 * via `mapRepoError` in the pipeline service.
 *
 * `pipeline_id` is immutable on PATCH. On create the repo asserts the
 * parent pipeline exists and is active (TOCTOU window vs. concurrent
 * pipeline soft-delete acknowledged — same posture as
 * `repositories/persons.ts:374-388`. The pipeline cascade-block guards the
 * other direction).
 *
 * Soft-delete is atomic: the conditional UPDATE includes a `NOT EXISTS`
 * clause that blocks deletion when any active deal references the stage.
 */
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import { and, asc, eq, or, sql } from 'drizzle-orm';
import { generateId } from '@flowpunk/service-utils';

import { deals } from '../schema/deals.js';
import { pipelines } from '../schema/pipelines.js';
import {
  ALLOWED_PATCH_FIELDS,
  NULLABLE_PATCH_FIELDS,
  TERMINAL_KIND_VALUES,
  isAllowedPatchField,
  isImmutablePatchField,
  stages,
  type NewStage,
  type Stage,
  type StagePatchableField,
  type StageTerminalKind,
} from '../schema/stages.js';

type Db = DrizzleD1Database<Record<string, never>>;

export class StagesRepoError extends Error {
  constructor(
    public readonly code:
      | 'not_found'
      | 'invalid_input'
      | 'wrong_state'
      | 'invariant_violation',
    message: string,
  ) {
    super(message);
    this.name = 'StagesRepoError';
  }
}

const PIPELINE_ID_REGEX = /^pl_[a-z0-9]{21}$/;
const NAME_MIN = 1;
const NAME_MAX = 256;

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

const TERMINAL_KIND_SET = new Set<string>(TERMINAL_KIND_VALUES);

export interface CreateStageInput {
  pipelineId: string;
  name: string;
  position: number;
  terminalKind?: StageTerminalKind | null;
  probability?: number | null;
}

export type UpdateStagePatch = Partial<{
  name: string;
  position: number;
  terminalKind: StageTerminalKind | null;
  probability: number | null;
}>;

export interface ListOptions {
  pipelineId: string;
  limit?: number;
  cursor?: string | null;
  includeDeleted?: boolean;
}

export interface ListResult {
  items: Stage[];
  nextCursor: string | null;
}

export interface UpdateResult {
  stage: Stage;
  fieldsChanged: StagePatchableField[];
}

export async function create(
  db: Db,
  input: CreateStageInput,
  actorId: string,
  now: string,
): Promise<Stage> {
  const normalized = validateCreate(input);

  await assertPipelineActive(db, normalized.pipelineId);

  const row: NewStage = {
    id: generateId('stg'),
    pipelineId: normalized.pipelineId,
    name: normalized.name,
    position: normalized.position,
    terminalKind: normalized.terminalKind ?? null,
    probability: normalized.probability ?? null,
    status: 'active',
    deletedAt: null,
    deletedBy: null,
    createdAt: now,
    createdBy: actorId,
    updatedAt: now,
    updatedBy: actorId,
  };

  try {
    const inserted = await db.insert(stages).values(row).returning();
    const stage = inserted[0];
    if (!stage) {
      throw new StagesRepoError(
        'invariant_violation',
        'insert returned no row',
      );
    }
    return stage;
  } catch (err) {
    if (isPositionUniqueViolation(err)) {
      throw new StagesRepoError(
        'wrong_state',
        `position ${normalized.position} is already taken in pipeline "${normalized.pipelineId}"`,
      );
    }
    throw err;
  }
}

export async function findById(
  db: Db,
  id: string,
  options: { includeDeleted?: boolean } = {},
): Promise<Stage | null> {
  const rows = await db.select().from(stages).where(eq(stages.id, id)).limit(1);
  const row = rows[0];
  if (!row) return null;
  if (!options.includeDeleted && row.status !== 'active') return null;
  return row;
}

/**
 * List stages within a pipeline. Ordered by `position ASC` (the natural
 * sales-process order). Cursor pagination is keyed on `(position, id)`
 * for deterministic continuation; same shape as persons but on a
 * different column pair.
 */
export async function list(db: Db, options: ListOptions): Promise<ListResult> {
  if (!PIPELINE_ID_REGEX.test(options.pipelineId)) {
    throw new StagesRepoError(
      'invalid_input',
      'pipelineId must match "pl_<21 lowercase alphanumeric>"',
    );
  }
  const limit = clampLimit(options.limit);
  const cursor = options.cursor ? decodeStageCursor(options.cursor) : null;

  const filters = [eq(stages.pipelineId, options.pipelineId)];
  if (!options.includeDeleted) filters.push(eq(stages.status, 'active'));
  if (cursor) {
    filters.push(
      or(
        sql`${stages.position} > ${cursor.position}`,
        and(eq(stages.position, cursor.position), sql`${stages.id} > ${cursor.id}`),
      )!,
    );
  }

  const rows = await db
    .select()
    .from(stages)
    .where(and(...filters))
    .orderBy(asc(stages.position), asc(stages.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor =
    hasMore && items.length > 0
      ? encodeStageCursor({
          position: items[items.length - 1]!.position,
          id: items[items.length - 1]!.id,
        })
      : null;

  return { items, nextCursor };
}

export async function update(
  db: Db,
  id: string,
  patch: UpdateStagePatch,
  actorId: string,
  now: string,
): Promise<UpdateResult> {
  for (const key of Object.keys(patch)) {
    if (isImmutablePatchField(key)) {
      throw new StagesRepoError(
        'invalid_input',
        `field "${key}" is immutable`,
      );
    }
    if (!isAllowedPatchField(key)) {
      throw new StagesRepoError(
        'invalid_input',
        `field "${key}" is not patchable`,
      );
    }
  }

  const changes: Partial<Record<StagePatchableField, unknown>> = {};
  const fieldsChanged: StagePatchableField[] = [];

  for (const field of ALLOWED_PATCH_FIELDS) {
    if (!(field in patch)) continue;
    const value = patch[field];
    if (value === null) {
      if (!NULLABLE_PATCH_FIELDS.has(field)) {
        throw new StagesRepoError(
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
      throw new StagesRepoError('not_found', `stage "${id}" not found`);
    }
    return { stage: current, fieldsChanged: [] };
  }

  try {
    const updated = await db
      .update(stages)
      .set({ ...changes, updatedAt: now, updatedBy: actorId } as any)
      .where(and(eq(stages.id, id), eq(stages.status, 'active')))
      .returning();

    const row = updated[0];
    if (!row) {
      const existing = await db
        .select({ status: stages.status })
        .from(stages)
        .where(eq(stages.id, id))
        .limit(1);
      if (existing[0]) {
        throw new StagesRepoError(
          'wrong_state',
          `stage "${id}" is not active`,
        );
      }
      throw new StagesRepoError('not_found', `stage "${id}" not found`);
    }

    return { stage: row, fieldsChanged };
  } catch (err) {
    if (err instanceof StagesRepoError) throw err;
    if (isPositionUniqueViolation(err)) {
      throw new StagesRepoError(
        'wrong_state',
        'position is already taken by another active stage in this pipeline',
      );
    }
    throw err;
  }
}

/**
 * Soft-delete a stage. Atomic guard: blocked when ANY active deal
 * references this stage. Concurrent deal inserts/transitions cannot slip
 * through between a pre-check and the write because the `NOT EXISTS`
 * clause is in the same UPDATE.
 */
export async function softDelete(
  db: Db,
  id: string,
  actorId: string,
  now: string,
): Promise<Stage> {
  const updated = await db
    .update(stages)
    .set({
      status: 'deleted',
      deletedAt: now,
      deletedBy: actorId,
      updatedAt: now,
      updatedBy: actorId,
    })
    .where(
      and(
        eq(stages.id, id),
        eq(stages.status, 'active'),
        sql`NOT EXISTS (SELECT 1 FROM deals WHERE stage_id = ${id} AND status = 'active')`,
      ),
    )
    .returning();

  const row = updated[0];
  if (row) return row;

  const existing = await db
    .select({ status: stages.status })
    .from(stages)
    .where(eq(stages.id, id))
    .limit(1);
  if (!existing[0]) {
    throw new StagesRepoError('not_found', `stage "${id}" not found`);
  }
  if (existing[0].status !== 'active') {
    throw new StagesRepoError('wrong_state', `stage "${id}" is already deleted`);
  }
  const dealCount = await db
    .select({ id: deals.id })
    .from(deals)
    .where(and(eq(deals.stageId, id), eq(deals.status, 'active')))
    .limit(1);
  if (dealCount[0]) {
    throw new StagesRepoError(
      'wrong_state',
      `stage "${id}" has active deals`,
    );
  }
  throw new StagesRepoError(
    'invariant_violation',
    `stage "${id}" softDelete failed for unknown reason`,
  );
}

// ---------- pre-checks ----------

/**
 * NOTE: TOCTOU window — same trade-off documented at
 * `repositories/persons.ts:374-388`. The check and the subsequent INSERT
 * are two D1 statements; a pipeline soft-deleted between them produces a
 * stage attached to an inactive pipeline. Window is bounded by the gap
 * between statements (single-digit ms in practice). The pipeline
 * cascade-block guards the other direction (soft-deleting a pipeline
 * with active stages is rejected atomically).
 */
async function assertPipelineActive(
  db: Db,
  pipelineId: string,
): Promise<void> {
  const rows = await db
    .select({ status: pipelines.status })
    .from(pipelines)
    .where(eq(pipelines.id, pipelineId))
    .limit(1);
  const row = rows[0];
  if (!row) {
    throw new StagesRepoError(
      'invalid_input',
      `pipeline "${pipelineId}" not found (pipeline_not_found)`,
    );
  }
  if (row.status !== 'active') {
    throw new StagesRepoError(
      'invalid_input',
      `pipeline "${pipelineId}" is not active (pipeline_not_active)`,
    );
  }
}

// ---------- validation / normalization ----------

interface NormalizedCreate {
  pipelineId: string;
  name: string;
  position: number;
  terminalKind?: StageTerminalKind | null;
  probability?: number | null;
}

function validateCreate(input: CreateStageInput): NormalizedCreate {
  if (typeof input.pipelineId !== 'string' || !PIPELINE_ID_REGEX.test(input.pipelineId)) {
    throw new StagesRepoError(
      'invalid_input',
      'pipelineId must match "pl_<21 lowercase alphanumeric>"',
    );
  }
  if (typeof input.name !== 'string') {
    throw new StagesRepoError('invalid_input', 'name must be a string');
  }
  const name = input.name.trim();
  validateName(name);

  if (typeof input.position !== 'number' || !Number.isInteger(input.position) || input.position < 0) {
    throw new StagesRepoError(
      'invalid_input',
      'position must be a non-negative integer',
    );
  }

  const out: NormalizedCreate = {
    pipelineId: input.pipelineId,
    name,
    position: input.position,
  };

  if ('terminalKind' in input) {
    if (input.terminalKind === null || input.terminalKind === undefined) {
      out.terminalKind = null;
    } else {
      validateTerminalKind(input.terminalKind);
      out.terminalKind = input.terminalKind;
    }
  }
  if ('probability' in input) {
    if (input.probability === null || input.probability === undefined) {
      out.probability = null;
    } else {
      validateProbability(input.probability);
      out.probability = input.probability;
    }
  }
  return out;
}

function validateField(field: StagePatchableField, value: unknown): void {
  switch (field) {
    case 'name':
      if (typeof value !== 'string') {
        throw new StagesRepoError('invalid_input', 'name must be a string');
      }
      validateName(value.trim());
      return;
    case 'position':
      if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
        throw new StagesRepoError(
          'invalid_input',
          'position must be a non-negative integer',
        );
      }
      return;
    case 'terminalKind':
      validateTerminalKind(value);
      return;
    case 'probability':
      validateProbability(value);
      return;
  }
}

function normalizeField(field: StagePatchableField, value: unknown): unknown {
  if (field === 'name' && typeof value === 'string') return value.trim();
  return value;
}

function validateName(value: string): void {
  if (value.length < NAME_MIN || value.length > NAME_MAX) {
    throw new StagesRepoError(
      'invalid_input',
      `name must be ${NAME_MIN}-${NAME_MAX} characters`,
    );
  }
}

function validateTerminalKind(value: unknown): void {
  if (typeof value !== 'string' || !TERMINAL_KIND_SET.has(value)) {
    throw new StagesRepoError(
      'invalid_input',
      `terminalKind must be one of ${[...TERMINAL_KIND_VALUES].join(' | ')}`,
    );
  }
}

function validateProbability(value: unknown): void {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > 100
  ) {
    throw new StagesRepoError(
      'invalid_input',
      'probability must be a number in [0, 100]',
    );
  }
}

function clampLimit(raw: unknown): number {
  if (raw === undefined || raw === null) return DEFAULT_LIMIT;
  if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 1) {
    throw new StagesRepoError(
      'invalid_input',
      'limit must be a positive integer',
    );
  }
  return Math.min(raw, MAX_LIMIT);
}

function isPositionUniqueViolation(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /idx_stages_position_unique|UNIQUE constraint/i.test(msg);
}

// ---------- cursor (position, id) ----------

interface StageCursorPayload {
  position: number;
  id: string;
}

function encodeStageCursor(payload: StageCursorPayload): string {
  const json = JSON.stringify({ position: payload.position, id: payload.id });
  return base64UrlEncode(json);
}

function decodeStageCursor(raw: string): StageCursorPayload {
  let json: string;
  try {
    json = base64UrlDecode(raw);
  } catch {
    throw new StagesRepoError('invalid_input', 'malformed cursor');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new StagesRepoError('invalid_input', 'malformed cursor');
  }
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    Array.isArray(parsed)
  ) {
    throw new StagesRepoError('invalid_input', 'malformed cursor');
  }
  const obj = parsed as Record<string, unknown>;
  if (
    typeof obj.position !== 'number' ||
    !Number.isInteger(obj.position) ||
    typeof obj.id !== 'string'
  ) {
    throw new StagesRepoError('invalid_input', 'malformed cursor');
  }
  return { position: obj.position, id: obj.id };
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
