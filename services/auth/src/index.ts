import { createLogger } from '@flowpunk/service-utils';

import { route } from './router.js';
import type { AuthEnv } from './types.js';

export default {
  async fetch(request: Request, env: AuthEnv): Promise<Response> {
    const requestId =
      request.headers.get('X-Request-ID') ?? crypto.randomUUID();
    const tenantId = request.headers.get('X-Tenant-Id') ?? undefined;
    const logger = createLogger({ service: 'auth' })
      .withRequestId(requestId)
      .withTenantId(tenantId);

    try {
      return await route(request, env, requestId);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error('unhandled error in auth worker', {
        error: err,
        method: request.method,
        path: new URL(request.url).pathname,
      });
      return jsonResponse(500, {
        success: false,
        error: { code: 'INTERNAL_ERROR' },
      });
    }
  },
};

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
