import type { Logger } from '@flowpunk/service-utils';
import { withIdempotency } from '@flowpunk/service-utils';

import { parseIdentity } from './middleware/identity.js';
import type { Actor, ContactsEnv } from './types.js';

const ACCOUNTS_COLLECTION_PATH = '/api/v1/accounts';
const ACCOUNTS_ITEM_PREFIX = '/api/v1/accounts/';
const PEOPLE_COLLECTION_PATH = '/api/v1/people';
const PEOPLE_ITEM_PREFIX = '/api/v1/people/';

export async function route(
  request: Request,
  _env: ContactsEnv,
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

  if (
    pathname === ACCOUNTS_COLLECTION_PATH ||
    pathname.startsWith(ACCOUNTS_ITEM_PREFIX) ||
    pathname === PEOPLE_COLLECTION_PATH ||
    pathname.startsWith(PEOPLE_ITEM_PREFIX)
  ) {
    return notImplemented();
  }

  return notFound();
}

/**
 * Wrap a mutation handler in `withIdempotency` keyed per
 * `${tenantId}:${userId}` so two requests with the same `Idempotency-Key`
 * from the same actor de-dupe to a single side-effect. Phase 2 has no
 * mutation handlers; this helper is exported so Phase 3 can use it
 * verbatim.
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

function notImplemented(): Response {
  return new Response(
    JSON.stringify({ success: false, error: { code: 'NOT_IMPLEMENTED' } }),
    {
      status: 501,
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
