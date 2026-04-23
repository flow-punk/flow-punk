import type { Middleware } from '../types.js';

const REQUEST_ID_HEADER = 'X-Request-ID';

/**
 * Request-ID middleware.
 * Always generates a fresh ID — inbound X-Request-ID is ignored because
 * the gateway is the external edge and untrusted client values must not
 * enter log correlation. Sets ctx.requestId and echoes it on the response.
 */
export const requestIdMiddleware: Middleware = async (ctx, next) => {
  ctx.requestId = crypto.randomUUID();
  const res = await next();
  const headers = new Headers(res.headers);
  headers.set(REQUEST_ID_HEADER, ctx.requestId);
  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers,
  });
};
