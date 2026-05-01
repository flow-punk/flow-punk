import type { Logger } from '@flowpunk/service-utils';
import { withIdempotency } from '@flowpunk/service-utils';

import { handleCreateAccount } from './handlers/accounts/create.js';
import { handleGetAccount } from './handlers/accounts/get.js';
import { handleListAccounts } from './handlers/accounts/list.js';
import { handleSoftDeleteAccount } from './handlers/accounts/softDelete.js';
import { handleUpdateAccount } from './handlers/accounts/update.js';
import { handleCreatePerson } from './handlers/persons/create.js';
import { handleGetPerson } from './handlers/persons/get.js';
import { handleListPersons } from './handlers/persons/list.js';
import { handleSoftDeletePerson } from './handlers/persons/softDelete.js';
import { handleUpdatePerson } from './handlers/persons/update.js';
import { handleMcpExecute } from './mcp/execute.js';
import { handleMcpTools } from './mcp/tools.js';
import { parseIdentity } from './middleware/identity.js';
import type { Actor, ContactsEnv } from './types.js';

const ACCOUNTS_COLLECTION_PATH = '/api/v1/accounts';
const ACCOUNTS_ITEM_PREFIX = '/api/v1/accounts/';
const PERSONS_COLLECTION_PATH = '/api/v1/persons';
const PERSONS_ITEM_PREFIX = '/api/v1/persons/';
const MCP_TOOLS_PATH = '/mcp/tools';
const MCP_EXECUTE_PATH = '/mcp/execute';

export async function route(
  request: Request,
  env: ContactsEnv,
  _logger?: Logger,
): Promise<Response> {
  const url = new URL(request.url);
  const { pathname } = url;
  const method = request.method.toUpperCase();

  // Liveness probe — runs BEFORE the identity guard so the worker is
  // reachable without forging headers.
  if (pathname === '/health') {
    if (method === 'GET' || method === 'HEAD') {
      return jsonResponse(200, { ok: true, service: 'contacts' });
    }
    return methodNotAllowed(['GET', 'HEAD']);
  }

  const actor = parseIdentity(request);
  if (!actor) return unauthenticated();

  // MCP endpoints — internal-only (gateway service-binding ingress).
  // Trust model: identity headers + X-MCP-Session-Id + X-Idempotency-Key
  // (synthesized by the gateway for mutating tools).
  if (pathname === MCP_TOOLS_PATH) {
    if (method === 'GET' || method === 'HEAD') {
      return handleMcpTools(env);
    }
    return methodNotAllowed(['GET', 'HEAD']);
  }
  if (pathname === MCP_EXECUTE_PATH) {
    if (method === 'POST') {
      return idempotent(request, env, actor, () =>
        handleMcpExecute(request, env, actor),
      );
    }
    return methodNotAllowed(['POST']);
  }

  // /api/v1/accounts collection
  if (pathname === ACCOUNTS_COLLECTION_PATH) {
    if (method === 'GET' || method === 'HEAD') {
      return handleListAccounts(request, env, actor);
    }
    if (method === 'POST') {
      return idempotent(request, env, actor, () =>
        handleCreateAccount(request, env, actor),
      );
    }
    return methodNotAllowed(['GET', 'HEAD', 'POST']);
  }

  // /api/v1/accounts/:id item
  if (pathname.startsWith(ACCOUNTS_ITEM_PREFIX)) {
    const id = pathname.slice(ACCOUNTS_ITEM_PREFIX.length);
    // Reject sub-resource paths until they are explicitly added (e.g.
    // `/accounts/:id/people` would land here unrouted otherwise).
    if (id.length === 0 || id.includes('/')) return notFound();

    if (method === 'GET' || method === 'HEAD') {
      return handleGetAccount(request, env, actor, id);
    }
    if (method === 'PATCH') {
      return idempotent(request, env, actor, () =>
        handleUpdateAccount(request, env, actor, id),
      );
    }
    if (method === 'DELETE') {
      return idempotent(request, env, actor, () =>
        handleSoftDeleteAccount(request, env, actor, id),
      );
    }
    return methodNotAllowed(['GET', 'HEAD', 'PATCH', 'DELETE']);
  }

  // /api/v1/persons collection
  if (pathname === PERSONS_COLLECTION_PATH) {
    if (method === 'GET' || method === 'HEAD') {
      return handleListPersons(request, env, actor);
    }
    if (method === 'POST') {
      return idempotent(request, env, actor, () =>
        handleCreatePerson(request, env, actor),
      );
    }
    return methodNotAllowed(['GET', 'HEAD', 'POST']);
  }

  // /api/v1/persons/:id item
  if (pathname.startsWith(PERSONS_ITEM_PREFIX)) {
    const id = pathname.slice(PERSONS_ITEM_PREFIX.length);
    if (id.length === 0 || id.includes('/')) return notFound();

    if (method === 'GET' || method === 'HEAD') {
      return handleGetPerson(request, env, actor, id);
    }
    if (method === 'PATCH') {
      return idempotent(request, env, actor, () =>
        handleUpdatePerson(request, env, actor, id),
      );
    }
    if (method === 'DELETE') {
      return idempotent(request, env, actor, () =>
        handleSoftDeletePerson(request, env, actor, id),
      );
    }
    return methodNotAllowed(['GET', 'HEAD', 'PATCH', 'DELETE']);
  }

  return notFound();
}

/**
 * Wrap a mutation handler in `withIdempotency` keyed per
 * `${tenantId}:${userId}` so two requests with the same `Idempotency-Key`
 * from the same actor de-dupe to a single side-effect.
 */
export function idempotent(
  request: Request,
  env: ContactsEnv,
  actor: Actor,
  handler: () => Promise<Response>,
): Promise<Response> {
  return withIdempotency(request, env.IDEMPOTENCY_KV, handler, {
    scopeKey: `${actor.tenantId}:${actor.userId}`,
  });
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function unauthenticated(): Response {
  return new Response(
    JSON.stringify({ success: false, error: { code: 'UNAUTHENTICATED' } }),
    {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    },
  );
}

function methodNotAllowed(allow: string[]): Response {
  return new Response(
    JSON.stringify({
      success: false,
      error: { code: 'METHOD_NOT_ALLOWED' },
    }),
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
  return new Response(
    JSON.stringify({ success: false, error: { code: 'NOT_FOUND' } }),
    {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    },
  );
}
