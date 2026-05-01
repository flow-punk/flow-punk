import type { Logger } from '@flowpunk/service-utils';
import { withIdempotency } from '@flowpunk/service-utils';

import { handleCreateDeal } from './handlers/deals/create.js';
import { handleGetDeal } from './handlers/deals/get.js';
import { handleListDeals } from './handlers/deals/list.js';
import { handleSoftDeleteDeal } from './handlers/deals/softDelete.js';
import { handleUpdateDeal } from './handlers/deals/update.js';
import { handleCreatePipeline } from './handlers/pipelines/create.js';
import { handleGetPipeline } from './handlers/pipelines/get.js';
import { handleListPipelines } from './handlers/pipelines/list.js';
import { handleSoftDeletePipeline } from './handlers/pipelines/softDelete.js';
import { handleUpdatePipeline } from './handlers/pipelines/update.js';
import { handleCreateStage } from './handlers/stages/create.js';
import { handleGetStage } from './handlers/stages/get.js';
import { handleListStages } from './handlers/stages/list.js';
import { handleSoftDeleteStage } from './handlers/stages/softDelete.js';
import { handleUpdateStage } from './handlers/stages/update.js';
import { parseIdentity } from './middleware/identity.js';
import type { Actor, PipelineEnv } from './types.js';

const PIPELINES_COLLECTION_PATH = '/api/v1/pipelines';
const PIPELINES_ITEM_PREFIX = '/api/v1/pipelines/';
const STAGES_COLLECTION_PATH = '/api/v1/stages';
const STAGES_ITEM_PREFIX = '/api/v1/stages/';
const DEALS_COLLECTION_PATH = '/api/v1/deals';
const DEALS_ITEM_PREFIX = '/api/v1/deals/';

export async function route(
  request: Request,
  env: PipelineEnv,
  _logger?: Logger,
): Promise<Response> {
  const url = new URL(request.url);
  const { pathname } = url;
  const method = request.method.toUpperCase();

  // Liveness probe — runs BEFORE the identity guard so the worker is
  // reachable without forging headers.
  if (pathname === '/health') {
    if (method === 'GET' || method === 'HEAD') {
      return jsonResponse(200, { ok: true, service: 'pipeline' });
    }
    return methodNotAllowed(['GET', 'HEAD']);
  }

  const actor = parseIdentity(request);
  if (!actor) return unauthenticated();

  // /api/v1/pipelines collection
  if (pathname === PIPELINES_COLLECTION_PATH) {
    if (method === 'GET' || method === 'HEAD') {
      return handleListPipelines(request, env, actor);
    }
    if (method === 'POST') {
      return idempotent(request, env, actor, () =>
        handleCreatePipeline(request, env, actor),
      );
    }
    return methodNotAllowed(['GET', 'HEAD', 'POST']);
  }
  if (pathname.startsWith(PIPELINES_ITEM_PREFIX)) {
    const id = pathname.slice(PIPELINES_ITEM_PREFIX.length);
    if (id.length === 0 || id.includes('/')) return notFound();
    if (method === 'GET' || method === 'HEAD') {
      return handleGetPipeline(request, env, actor, id);
    }
    if (method === 'PATCH') {
      return idempotent(request, env, actor, () =>
        handleUpdatePipeline(request, env, actor, id),
      );
    }
    if (method === 'DELETE') {
      return idempotent(request, env, actor, () =>
        handleSoftDeletePipeline(request, env, actor, id),
      );
    }
    return methodNotAllowed(['GET', 'HEAD', 'PATCH', 'DELETE']);
  }

  // /api/v1/stages collection
  if (pathname === STAGES_COLLECTION_PATH) {
    if (method === 'GET' || method === 'HEAD') {
      return handleListStages(request, env, actor);
    }
    if (method === 'POST') {
      return idempotent(request, env, actor, () =>
        handleCreateStage(request, env, actor),
      );
    }
    return methodNotAllowed(['GET', 'HEAD', 'POST']);
  }
  if (pathname.startsWith(STAGES_ITEM_PREFIX)) {
    const id = pathname.slice(STAGES_ITEM_PREFIX.length);
    if (id.length === 0 || id.includes('/')) return notFound();
    if (method === 'GET' || method === 'HEAD') {
      return handleGetStage(request, env, actor, id);
    }
    if (method === 'PATCH') {
      return idempotent(request, env, actor, () =>
        handleUpdateStage(request, env, actor, id),
      );
    }
    if (method === 'DELETE') {
      return idempotent(request, env, actor, () =>
        handleSoftDeleteStage(request, env, actor, id),
      );
    }
    return methodNotAllowed(['GET', 'HEAD', 'PATCH', 'DELETE']);
  }

  // /api/v1/deals collection
  if (pathname === DEALS_COLLECTION_PATH) {
    if (method === 'GET' || method === 'HEAD') {
      return handleListDeals(request, env, actor);
    }
    if (method === 'POST') {
      return idempotent(request, env, actor, () =>
        handleCreateDeal(request, env, actor),
      );
    }
    return methodNotAllowed(['GET', 'HEAD', 'POST']);
  }
  if (pathname.startsWith(DEALS_ITEM_PREFIX)) {
    const id = pathname.slice(DEALS_ITEM_PREFIX.length);
    if (id.length === 0 || id.includes('/')) return notFound();
    if (method === 'GET' || method === 'HEAD') {
      return handleGetDeal(request, env, actor, id);
    }
    if (method === 'PATCH') {
      return idempotent(request, env, actor, () =>
        handleUpdateDeal(request, env, actor, id),
      );
    }
    if (method === 'DELETE') {
      return idempotent(request, env, actor, () =>
        handleSoftDeleteDeal(request, env, actor, id),
      );
    }
    return methodNotAllowed(['GET', 'HEAD', 'PATCH', 'DELETE']);
  }

  return notFound();
}

export function idempotent(
  request: Request,
  env: PipelineEnv,
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
