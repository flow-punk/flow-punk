import { createLogger } from '@flowpunk/service-utils';
import {
  route,
  type PipelineCoreOptions,
  type PipelineEnv,
} from '@flowpunk-indie/pipeline-core';

// Indie ships `deal_history` fully (ADR-022). The indie tenant is the
// single-D1 deploy, so `db.batch()` works end-to-end and history rows are
// co-emitted with every deal mutation. Per ADR-022 §14 / ADR-011 §201,
// edition-specific options thread through `route()`'s 4th argument.
const INDIE_OPTIONS: PipelineCoreOptions = {
  recordHistory: true,
};

export default {
  async fetch(request: Request, env: PipelineEnv): Promise<Response> {
    const requestId =
      request.headers.get('X-Request-ID') ?? crypto.randomUUID();
    const tenantId = request.headers.get('X-Tenant-Id') ?? undefined;
    const logger = createLogger({ service: 'pipeline' })
      .withRequestId(requestId)
      .withTenantId(tenantId);

    try {
      return await route(request, env, logger, INDIE_OPTIONS);
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

export type { PipelineEnv } from '@flowpunk-indie/pipeline-core';
