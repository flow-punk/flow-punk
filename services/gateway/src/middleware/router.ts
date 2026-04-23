import type { AppContext, Middleware } from '../types.js';
import { handleMcp } from '../mcp/index.js';
import { handleRest } from '../rest/handler.js';

/**
 * Pure indie route dispatcher shared by indie's own router middleware and
 * managed's wrapper router.
 *
 * Dispatches to the appropriate handler based on path:
 *   - /health → health check response
 *   - /mcp → MCP handler
 *   - /api/v1/* → REST handler
 *
 * Routing only dispatches; it does not own request-body enforcement.
 */
export async function dispatchIndieRoute(
  ctx: AppContext,
): Promise<Response> {
  const { pathname } = new URL(ctx.request.url);

  if (pathname === '/health') {
    return new Response(JSON.stringify({ status: 'ok' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (pathname === '/mcp') return handleMcp(ctx);
  if (pathname.startsWith('/api/v1/')) return handleRest(ctx);

  return new Response('Not Found', { status: 404 });
}

/**
 * Router middleware (final in the chain).
 */
export const routerMiddleware: Middleware = async (
  ctx: AppContext,
  _next: () => Promise<Response>,
): Promise<Response> => dispatchIndieRoute(ctx);
