import {
  DealsRepoError,
  PipelinesRepoError,
  StagesRepoError,
  dealsRepo,
  pipelinesRepo,
  stagesRepo,
  type CreateDealInput,
  type UpdateDealPatch,
} from '@flowpunk-indie/db';
import { createLogger } from '@flowpunk/service-utils';

import type { Actor, PipelineEnv } from '../types.js';
import { getDb, type Db } from '../handlers/_shared.js';
import { buildPipelineToolState } from './tools.js';
import {
  envelopeErr,
  envelopeOk,
  envelopeResponse,
  type ExecuteEnvelope,
  type MutationOptions,
} from './envelope.js';

interface ExecuteRequest {
  jsonrpcId?: string | number | null;
  /** Informational only — trust comes from X-MCP-Session-Id (already validated by the gateway). */
  sessionId?: string;
  name: string;
  arguments?: Record<string, unknown>;
}

interface DispatchOutcome {
  status: number;
  envelope: ExecuteEnvelope;
  options?: MutationOptions;
}

const SESSION_HEADER = 'X-MCP-Session-Id';

export async function handleMcpExecute(
  request: Request,
  env: PipelineEnv,
  actor: Actor,
): Promise<Response> {
  if (!request.headers.get(SESSION_HEADER)) {
    return envelopeResponse(
      400,
      envelopeErr('MISSING_SESSION', `${SESSION_HEADER} header is required`),
    );
  }

  let body: ExecuteRequest;
  try {
    body = (await request.json()) as ExecuteRequest;
  } catch {
    return envelopeResponse(
      400,
      envelopeErr('INVALID_BODY', 'request body must be JSON'),
    );
  }
  if (!body || typeof body.name !== 'string' || body.name.length === 0) {
    return envelopeResponse(
      400,
      envelopeErr('INVALID_BODY', 'tool name is required'),
    );
  }

  const args = body.arguments ?? {};
  const db = getDb(env);
  const now = new Date().toISOString();

  let outcome: DispatchOutcome;
  try {
    outcome = await dispatch(body.name, args, db, actor, env, now);
  } catch (err) {
    if (
      err instanceof DealsRepoError ||
      err instanceof StagesRepoError ||
      err instanceof PipelinesRepoError
    ) {
      outcome = {
        status: repoErrorStatus(err.code),
        envelope: envelopeErr(repoErrorCode(err.code), err.message),
      };
    } else {
      createLogger({ service: 'pipeline' })
        .withTenantId(actor.tenantId)
        .withUserId(actor.userId)
        .error('mcp_execute_failed', {
          tool: body.name,
          errorName: err instanceof Error ? err.name : 'UnknownError',
          errorMessage: err instanceof Error ? err.message : 'unknown error',
        });
      outcome = {
        status: 500,
        envelope: envelopeErr('INTERNAL_ERROR', 'tool execution failed'),
      };
    }
  }

  return envelopeResponse(outcome.status, outcome.envelope, outcome.options);
}

async function dispatch(
  name: string,
  args: Record<string, unknown>,
  db: Db,
  actor: Actor,
  env: PipelineEnv,
  now: string,
): Promise<DispatchOutcome> {
  switch (name) {
    case 'pipeline_search':
      return executePipelineSearch(db, args, env);
    case 'stages_search':
      return executeStagesSearch(db, args, env);
    case 'deals_create':
      return executeDealsCreate(db, args, actor, env, now);
    case 'deals_get':
      return executeDealsGet(db, args, env);
    case 'deals_search':
      return executeDealsSearch(db, args, env);
    case 'deals_update':
      return executeDealsUpdate(db, args, actor, env, now);
    case 'deals_move_stage':
      return executeDealsMoveStage(db, args, actor, env, now);
    default:
      return {
        status: 404,
        envelope: envelopeErr('UNKNOWN_TOOL', `unknown tool: ${name}`),
      };
  }
}

async function ensureAvailable(
  toolName: string,
  env: PipelineEnv,
): Promise<DispatchOutcome | null> {
  const state = await buildPipelineToolState(env);
  const unavailable = state.unavailableTools.find((t) => t.name === toolName);
  if (unavailable) {
    return {
      status: 409,
      envelope: envelopeErr('TOOL_UNAVAILABLE', unavailable.availability.reason ?? '', {
        nextStep: unavailable.availability.nextStep,
      }),
    };
  }
  return null;
}

async function executePipelineSearch(
  db: Db,
  args: Record<string, unknown>,
  env: PipelineEnv,
): Promise<DispatchOutcome> {
  const guard = await ensureAvailable('pipeline_search', env);
  if (guard) return guard;
  const limit = numberArg(args, 'limit');
  const cursor = stringArg(args, 'cursor');
  const result = await pipelinesRepo.list(db, {
    limit,
    cursor,
    includeDeleted: false,
  });
  return { status: 200, envelope: envelopeOk(result) };
}

async function executeStagesSearch(
  db: Db,
  args: Record<string, unknown>,
  env: PipelineEnv,
): Promise<DispatchOutcome> {
  const guard = await ensureAvailable('stages_search', env);
  if (guard) return guard;
  const pipelineId = stringArg(args, 'pipelineId');
  if (!pipelineId) {
    return invalidArg('pipelineId is required (stages are pipeline-scoped)');
  }
  const limit = numberArg(args, 'limit');
  const cursor = stringArg(args, 'cursor');
  const result = await stagesRepo.list(db, {
    pipelineId,
    limit,
    cursor,
    includeDeleted: false,
  });
  return { status: 200, envelope: envelopeOk(result) };
}

async function executeDealsCreate(
  db: Db,
  args: Record<string, unknown>,
  actor: Actor,
  env: PipelineEnv,
  now: string,
): Promise<DispatchOutcome> {
  const guard = await ensureAvailable('deals_create', env);
  if (guard) return guard;
  const deal = await dealsRepo.create(db, args as unknown as CreateDealInput, actor.userId, now);
  return {
    status: 200,
    envelope: envelopeOk({ deal }),
    options: { invalidateTools: { reason: 'deals_table_mutated' } },
  };
}

async function executeDealsGet(
  db: Db,
  args: Record<string, unknown>,
  env: PipelineEnv,
): Promise<DispatchOutcome> {
  const guard = await ensureAvailable('deals_get', env);
  if (guard) return guard;
  const id = stringArg(args, 'id');
  if (!id) return invalidArg('id is required');
  const deal = await dealsRepo.findById(db, id);
  if (!deal) {
    return {
      status: 404,
      envelope: envelopeErr('NOT_FOUND', `deal ${id} not found`),
    };
  }
  return { status: 200, envelope: envelopeOk({ deal }) };
}

async function executeDealsSearch(
  db: Db,
  args: Record<string, unknown>,
  env: PipelineEnv,
): Promise<DispatchOutcome> {
  const guard = await ensureAvailable('deals_search', env);
  if (guard) return guard;
  const limit = numberArg(args, 'limit');
  const cursor = stringArg(args, 'cursor');
  const pipelineId = stringArg(args, 'pipelineId');
  const stageId = stringArg(args, 'stageId');
  const result = await dealsRepo.list(db, {
    limit,
    cursor,
    pipelineId,
    stageId,
    includeDeleted: false,
  });
  return { status: 200, envelope: envelopeOk(result) };
}

async function executeDealsUpdate(
  db: Db,
  args: Record<string, unknown>,
  actor: Actor,
  env: PipelineEnv,
  now: string,
): Promise<DispatchOutcome> {
  const guard = await ensureAvailable('deals_update', env);
  if (guard) return guard;
  const id = stringArg(args, 'id');
  if (!id) return invalidArg('id is required');
  const fields = (args.fields ?? {}) as UpdateDealPatch;
  const result = await dealsRepo.update(db, id, fields, actor.userId, now);
  return {
    status: 200,
    envelope: envelopeOk({ deal: result.deal }),
    options: { invalidateTools: { reason: 'deals_table_mutated' } },
  };
}

async function executeDealsMoveStage(
  db: Db,
  args: Record<string, unknown>,
  actor: Actor,
  env: PipelineEnv,
  now: string,
): Promise<DispatchOutcome> {
  const guard = await ensureAvailable('deals_move_stage', env);
  if (guard) return guard;
  const id = stringArg(args, 'id');
  const stageId = stringArg(args, 'stageId');
  if (!id) return invalidArg('id is required');
  if (!stageId) return invalidArg('stageId is required');
  // Per-pipeline correctness (target stage in same pipeline as the deal) is
  // enforced atomically by dealsRepo.update via assertStageInActivePipeline.
  const result = await dealsRepo.update(db, id, { stageId } as UpdateDealPatch, actor.userId, now);
  return {
    status: 200,
    envelope: envelopeOk({ deal: result.deal }),
    options: { invalidateTools: { reason: 'deals_table_mutated' } },
  };
}

function stringArg(args: Record<string, unknown>, key: string): string | undefined {
  const value = args[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function numberArg(args: Record<string, unknown>, key: string): number | undefined {
  const value = args[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function invalidArg(message: string): DispatchOutcome {
  return {
    status: 400,
    envelope: envelopeErr('INVALID_INPUT', message),
  };
}

function repoErrorStatus(code: 'not_found' | 'invalid_input' | 'wrong_state' | 'invariant_violation'): number {
  switch (code) {
    case 'not_found':
      return 404;
    case 'invalid_input':
      return 400;
    case 'wrong_state':
      return 409;
    case 'invariant_violation':
      return 500;
  }
}

function repoErrorCode(code: 'not_found' | 'invalid_input' | 'wrong_state' | 'invariant_violation'): string {
  switch (code) {
    case 'not_found':
      return 'NOT_FOUND';
    case 'invalid_input':
      return 'INVALID_INPUT';
    case 'wrong_state':
      return 'WRONG_STATE';
    case 'invariant_violation':
      return 'INTERNAL_ERROR';
  }
}
