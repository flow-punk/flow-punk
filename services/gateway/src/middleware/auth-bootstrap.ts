import { route as oauthRoute } from '@flowpunk-indie/oauth';
import type { AppContext, Middleware } from '../types.js';

/**
 * Indie-only bootstrap dispatcher for `/auth/login`. Per ADR-019 amendment
 * 2026-05-06.
 *
 * Lives outside `dispatchIndieRoute` so managed (which delegates unmatched
 * paths to that shared dispatcher) can't accidentally inherit the
 * paste-token surface — `MANAGED_PUBLIC_PATHS` does not include
 * `INDIE_BOOTSTRAP_PUBLIC_PATHS`, and managed's chain does not append
 * this middleware. Net result: managed gateway returns 404 on /auth/login.
 *
 * Indie's `createIndieChain` appends this BEFORE `routerMiddleware` so it
 * can intercept early. Other paths flow straight through to `next()`.
 */
export const indieAuthBootstrapMiddleware: Middleware = async (
  ctx: AppContext,
  next: () => Promise<Response>,
): Promise<Response> => {
  const { pathname } = new URL(ctx.request.url);
  if (pathname !== '/auth/login') return next();

  // No session resolution — the entire point of /auth/login is to MINT
  // a session. Pass `null` so the OAuth route's session-aware handlers
  // (which currently only branch on this for /oauth/approve) treat the
  // request as unauthenticated.
  return oauthRoute(ctx.request, ctx.env, {
    requestId: ctx.requestId,
    session: null,
  });
};
