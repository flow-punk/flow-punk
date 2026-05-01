import { createLogger } from '@flowpunk/service-utils';
import {
  route,
  type AuthCoreOptions,
  type AuthEnv,
} from '@flowpunk-indie/auth-core';

/**
 * Indie auth worker.
 *
 * Per ADR-012 §"Per-edition caps", indie permits 1 active API key per
 * deploy (single-admin model per ADR-011). We pass `maxActiveKeys: 1`
 * here so the shared core repo refuses to mint a second key. Per
 * ADR-011:201 we do NOT branch the core code on an `EDITION` env var.
 */
const INDIE_OPTIONS: AuthCoreOptions = {
  maxActiveKeys: 1,
};

type IndieAuthEnv = Omit<AuthEnv, 'AUTH_OPTIONS'>;

export default {
  async fetch(request: Request, env: IndieAuthEnv): Promise<Response> {
    const requestId =
      request.headers.get('X-Request-ID') ?? crypto.randomUUID();
    const tenantId = request.headers.get('X-Tenant-Id') ?? undefined;
    const logger = createLogger({ service: 'auth' })
      .withRequestId(requestId)
      .withTenantId(tenantId);

    try {
      return await route(
        request,
        { ...env, AUTH_OPTIONS: INDIE_OPTIONS },
        requestId,
      );
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

export type { AuthEnv } from '@flowpunk-indie/auth-core';
