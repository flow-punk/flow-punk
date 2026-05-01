import {
  AccountsRepoError,
  PersonsRepoError,
  accountsRepo,
  personsRepo,
  type CreateAccountInput,
  type CreatePersonInput,
  type UpdateAccountPatch,
  type UpdatePersonPatch,
} from '@flowpunk-indie/db';
import { createLogger } from '@flowpunk/service-utils';

import type { Actor, ContactsEnv } from '../types.js';
import { emitContactsAudit, getDb, type Db } from '../handlers/_shared.js';
import { buildContactsToolState } from './tools.js';
import {
  envelopeErr,
  envelopeOk,
  envelopeResponse,
  type ExecuteEnvelope,
  type MutationOptions,
} from './envelope.js';

interface ExecuteRequest {
  /** JSON-RPC request id forwarded by the gateway, surfaced in audit events. */
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

/**
 * MCP tool execution endpoint. Trust model:
 *  - parseIdentity has already populated `actor` from gateway-stamped headers.
 *  - X-MCP-Session-Id MUST be present (gateway-injected); body `sessionId` is
 *    informational only and never used for trust decisions.
 *  - Mutating tools rely on X-Idempotency-Key (synthesized by the gateway and
 *    enforced by the existing `withIdempotency` wrapper at the router layer).
 *  - Routes are reachable only via the gateway service binding (no public
 *    exposure).
 */
export async function handleMcpExecute(
  request: Request,
  env: ContactsEnv,
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
    if (err instanceof PersonsRepoError || err instanceof AccountsRepoError) {
      outcome = {
        status: repoErrorStatus(err.code),
        envelope: envelopeErr(repoErrorCode(err.code), err.message),
      };
    } else {
      createLogger({ service: 'contacts' })
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
  env: ContactsEnv,
  now: string,
): Promise<DispatchOutcome> {
  switch (name) {
    case 'persons_create':
      return executePersonsCreate(db, args, actor, env, now);
    case 'persons_get':
      return executePersonsGet(db, args, env);
    case 'persons_search':
      return executePersonsSearch(db, args, env);
    case 'persons_update':
      return executePersonsUpdate(db, args, actor, env, now);
    case 'accounts_create':
      return executeAccountsCreate(db, args, actor, env, now);
    case 'accounts_get':
      return executeAccountsGet(db, args, env);
    case 'accounts_search':
      return executeAccountsSearch(db, args, env);
    case 'accounts_update':
      return executeAccountsUpdate(db, args, actor, env, now);
    case 'contacts_search':
      return executeContactsSearch(db, args, env);
    default:
      return {
        status: 404,
        envelope: envelopeErr('UNKNOWN_TOOL', `unknown tool: ${name}`),
      };
  }
}

async function ensureAvailable(
  toolName: string,
  env: ContactsEnv,
): Promise<DispatchOutcome | null> {
  const state = await buildContactsToolState(env);
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

async function executePersonsCreate(
  db: Db,
  args: Record<string, unknown>,
  actor: Actor,
  _env: ContactsEnv,
  now: string,
): Promise<DispatchOutcome> {
  const person = await personsRepo.create(db, args as unknown as CreatePersonInput, actor.userId, now);
  emitContactsAudit(actor, {
    action: 'persons.created',
    resourceType: 'person',
    resourceId: person.id,
    detail: { hasAccountId: person.accountId !== null },
  });
  return {
    status: 200,
    envelope: envelopeOk({ person }),
    options: { invalidateTools: { reason: 'persons_table_mutated' } },
  };
}

async function executePersonsGet(
  db: Db,
  args: Record<string, unknown>,
  env: ContactsEnv,
): Promise<DispatchOutcome> {
  const guard = await ensureAvailable('persons_get', env);
  if (guard) return guard;
  const id = stringArg(args, 'id');
  if (!id) return invalidArg('id is required');
  const person = await personsRepo.findById(db, id);
  if (!person) {
    return {
      status: 404,
      envelope: envelopeErr('NOT_FOUND', `person ${id} not found`),
    };
  }
  return { status: 200, envelope: envelopeOk({ person }) };
}

async function executePersonsSearch(
  db: Db,
  args: Record<string, unknown>,
  env: ContactsEnv,
): Promise<DispatchOutcome> {
  const guard = await ensureAvailable('persons_search', env);
  if (guard) return guard;
  const limit = numberArg(args, 'limit');
  const cursor = stringArg(args, 'cursor');
  const accountId = stringArg(args, 'accountId');
  const result = await personsRepo.list(db, {
    limit,
    cursor,
    accountId,
    includeDeleted: false,
  });
  return { status: 200, envelope: envelopeOk(result) };
}

async function executePersonsUpdate(
  db: Db,
  args: Record<string, unknown>,
  actor: Actor,
  env: ContactsEnv,
  now: string,
): Promise<DispatchOutcome> {
  const guard = await ensureAvailable('persons_update', env);
  if (guard) return guard;
  const id = stringArg(args, 'id');
  if (!id) return invalidArg('id is required');
  const fields = (args.fields ?? {}) as UpdatePersonPatch;
  const result = await personsRepo.update(db, id, fields, actor.userId, now);
  if (result.fieldsChanged.length > 0) {
    emitContactsAudit(actor, {
      action: 'persons.updated',
      resourceType: 'person',
      resourceId: result.person.id,
      detail: { fieldsChanged: result.fieldsChanged },
    });
  }
  return {
    status: 200,
    envelope: envelopeOk({ person: result.person }),
    options: { invalidateTools: { reason: 'persons_table_mutated' } },
  };
}

async function executeAccountsCreate(
  db: Db,
  args: Record<string, unknown>,
  actor: Actor,
  _env: ContactsEnv,
  now: string,
): Promise<DispatchOutcome> {
  const account = await accountsRepo.create(db, args as unknown as CreateAccountInput, actor.userId, now);
  const country = typeof account.country === 'string' ? account.country : undefined;
  emitContactsAudit(actor, {
    action: 'accounts.created',
    resourceType: 'account',
    resourceId: account.id,
    detail: country ? { country } : {},
  });
  return {
    status: 200,
    envelope: envelopeOk({ account }),
    options: { invalidateTools: { reason: 'accounts_table_mutated' } },
  };
}

async function executeAccountsGet(
  db: Db,
  args: Record<string, unknown>,
  env: ContactsEnv,
): Promise<DispatchOutcome> {
  const guard = await ensureAvailable('accounts_get', env);
  if (guard) return guard;
  const id = stringArg(args, 'id');
  if (!id) return invalidArg('id is required');
  const account = await accountsRepo.findById(db, id);
  if (!account) {
    return {
      status: 404,
      envelope: envelopeErr('NOT_FOUND', `account ${id} not found`),
    };
  }
  return { status: 200, envelope: envelopeOk({ account }) };
}

async function executeAccountsSearch(
  db: Db,
  args: Record<string, unknown>,
  env: ContactsEnv,
): Promise<DispatchOutcome> {
  const guard = await ensureAvailable('accounts_search', env);
  if (guard) return guard;
  const limit = numberArg(args, 'limit');
  const cursor = stringArg(args, 'cursor');
  const result = await accountsRepo.list(db, {
    limit,
    cursor,
    includeDeleted: false,
  });
  return { status: 200, envelope: envelopeOk(result) };
}

async function executeAccountsUpdate(
  db: Db,
  args: Record<string, unknown>,
  actor: Actor,
  env: ContactsEnv,
  now: string,
): Promise<DispatchOutcome> {
  const guard = await ensureAvailable('accounts_update', env);
  if (guard) return guard;
  const id = stringArg(args, 'id');
  if (!id) return invalidArg('id is required');
  const fields = (args.fields ?? {}) as UpdateAccountPatch;
  const result = await accountsRepo.update(db, id, fields, actor.userId, now);
  if (result.fieldsChanged.length > 0) {
    emitContactsAudit(actor, {
      action: 'accounts.updated',
      resourceType: 'account',
      resourceId: result.account.id,
      detail: { fieldsChanged: result.fieldsChanged },
    });
  }
  return {
    status: 200,
    envelope: envelopeOk({ account: result.account }),
    options: { invalidateTools: { reason: 'accounts_table_mutated' } },
  };
}

async function executeContactsSearch(
  db: Db,
  args: Record<string, unknown>,
  env: ContactsEnv,
): Promise<DispatchOutcome> {
  const guard = await ensureAvailable('contacts_search', env);
  if (guard) return guard;
  const limit = numberArg(args, 'limit');
  const [personsResult, accountsResult] = await Promise.all([
    personsRepo.list(db, { limit, includeDeleted: false }),
    accountsRepo.list(db, { limit, includeDeleted: false }),
  ]);
  return {
    status: 200,
    envelope: envelopeOk({
      persons: personsResult.items,
      accounts: accountsResult.items,
    }),
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
