import type { Logger } from '@flowpunk/service-utils';
import { withIdempotency } from '@flowpunk/service-utils';

import { handleCreate } from './handlers/create.js';
import { handleGet } from './handlers/get.js';
import { handleList } from './handlers/list.js';
import { handleSoftDelete } from './handlers/softDelete.js';
import { handleUpdate } from './handlers/update.js';
import { requireAdmin } from './middleware/require-admin.js';
import { requireAuthenticated } from './middleware/require-authenticated.js';
import type { Actor, UsersEnv } from './types.js';

const COLLECTION_PATH = '/api/v1/users';
const ITEM_PREFIX = '/api/v1/users/';

export async function route(
  request: Request,
  env: UsersEnv,
  logger?: Logger,
): Promise<Response> {
  const url = new URL(request.url);
  const { pathname } = url;
  const method = request.method.toUpperCase();

  // Liveness probe — runs BEFORE any auth so the worker is reachable
  // without forging headers.
  if (pathname === '/health') {
    if (method === 'GET' || method === 'HEAD') {
      return jsonResponse(200, { ok: true, service: 'users' });
    }
    return methodNotAllowed(['GET', 'HEAD']);
  }

  // Collection — admin only.
  if (pathname === COLLECTION_PATH || pathname === COLLECTION_PATH + '/') {
    const guard = await requireAdmin(request, env, logger);
    if (!guard.ok) return guard.response;
    const { actor } = guard;
    if (method === 'GET') return handleList(request, env);
    if (method === 'POST') {
      return idempotent(request, env, actor, () =>
        handleCreate(request, env, actor),
      );
    }
    return methodNotAllowed(['GET', 'POST']);
  }

  // Item — self OR admin for GET/PATCH; admin only for DELETE.
  if (pathname.startsWith(ITEM_PREFIX)) {
    const id = pathname.slice(ITEM_PREFIX.length);
    if (id.length === 0 || id.includes('/')) return notFound();

    if (method === 'DELETE') {
      const guard = await requireAdmin(request, env, logger);
      if (!guard.ok) return guard.response;
      const { actor } = guard;
      return idempotent(request, env, actor, () =>
        handleSoftDelete(request, env, actor, id),
      );
    }

    if (method === 'GET' || method === 'HEAD') {
      const guard = await requireAuthenticated(request, env);
      if (!guard.ok) return guard.response;
      return handleGet(request, env, guard.actor, guard.isAdmin, id);
    }

    if (method === 'PATCH') {
      const guard = await requireAuthenticated(request, env);
      if (!guard.ok) return guard.response;
      return idempotent(request, env, guard.actor, () =>
        handleUpdate(request, env, guard.actor, guard.isAdmin, id),
      );
    }

    return methodNotAllowed(['GET', 'HEAD', 'PATCH', 'DELETE']);
  }

  return notFound();
}

/**
 * Wrap a mutation handler in `withIdempotency` keyed per actor. Indie
 * has no separate tenant axis, so the scope key is just the userId.
 */
function idempotent(
  request: Request,
  env: UsersEnv,
  actor: Actor,
  handler: () => Promise<Response>,
): Promise<Response> {
  return withIdempotency(request, env.IDEMPOTENCY_KV, handler, {
    scopeKey: actor.userId,
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
