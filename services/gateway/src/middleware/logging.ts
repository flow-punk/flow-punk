import { createLogger } from '@flowpunk/service-utils';
import type {
  CredentialDescriptor,
  Logger,
  LogLevel,
} from '@flowpunk/service-utils';
import type { AppContext, Middleware } from '../types.js';

// TODO: when MCP SSE streaming lands (GET /mcp), emit separate `connect` and
// `close` log lines instead of a single completion line. A long-lived stream
// otherwise produces no log until the client disconnects.

/**
 * Logging middleware — slot 3 in the gateway chain (after Request-ID, before
 * Rate-Limit/Auth). Emits one access-log JSON line per request at completion
 * and owns the outer error boundary: any uncaught error from downstream
 * middleware or the handler is logged and converted to a 500 response with
 * the request ID so the client has a trace handle.
 */
export const loggingMiddleware: Middleware = async (ctx, next) => {
  const start = performance.now();
  const method = ctx.request.method;
  const path = new URL(ctx.request.url).pathname;
  const baseLogger = createLogger({ service: 'gateway' }).withRequestId(
    ctx.requestId,
  );

  try {
    const res = await next();
    const duration = Math.round((performance.now() - start) * 100) / 100;
    const level: LogLevel =
      res.status >= 500 ? 'error' : res.status >= 400 ? 'warn' : 'info';
    bindIdentity(baseLogger, ctx)[level]('request', {
      method,
      path,
      statusCode: res.status,
      duration,
      ...(ctx.scope !== undefined ? { scope: ctx.scope } : {}),
    });
    return res;
  } catch (err) {
    const duration = Math.round((performance.now() - start) * 100) / 100;
    bindIdentity(baseLogger, ctx).error('request', {
      method,
      path,
      statusCode: 500,
      duration,
      error: err,
      ...(ctx.scope !== undefined ? { scope: ctx.scope } : {}),
    });
    return new Response(
      JSON.stringify({ error: 'internal_error', requestId: ctx.requestId }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'X-Request-ID': ctx.requestId,
        },
      },
    );
  }
};

function bindIdentity(logger: Logger, ctx: AppContext): Logger {
  let bound = logger.withTenantId(ctx.tenantId).withUserId(ctx.userId);
  if (ctx.credentialId && ctx.credentialType) {
    const descriptor: CredentialDescriptor = {
      credentialId: ctx.credentialId,
      credentialType: ctx.credentialType,
      ...(ctx.credentialType === 'apikey'
        ? { keyLabel: ctx.keyLabel ?? null }
        : {}),
    };
    bound = bound.withCredential(descriptor);
  }
  return bound;
}
