import { createLogger } from '@flowpunk/service-utils';

import { route } from './router.js';
import type { PipelineEnv } from './types.js';

export default {
  async fetch(request: Request, env: PipelineEnv): Promise<Response> {
    const requestId =
      request.headers.get('X-Request-ID') ?? crypto.randomUUID();
    const tenantId = request.headers.get('X-Tenant-Id') ?? undefined;
    const logger = createLogger({ service: 'pipeline' })
      .withRequestId(requestId)
      .withTenantId(tenantId);

    try {
      return await route(request, env, logger);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error('unhandled error in pipeline worker', {
        error: err,
        method: request.method,
        path: new URL(request.url).pathname,
      });
      return new Response(
        JSON.stringify({
          success: false,
          error: { code: 'INTERNAL_ERROR' },
        }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }
  },
};

export type { PipelineEnv } from './types.js';
