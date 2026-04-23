import type { AppContext, Middleware } from '../types.js';

/**
 * Composes an ordered array of middleware into a single handler.
 * Each middleware calls `next()` to proceed to the next in the chain.
 */
export function composeMiddleware(
  middlewares: Middleware[],
): (ctx: AppContext) => Promise<Response> {
  return (ctx: AppContext) => {
    let index = -1;

    function dispatch(i: number): Promise<Response> {
      if (i <= index) {
        return Promise.reject(new Error('next() called multiple times'));
      }
      index = i;

      const mw = middlewares[i];
      if (!mw) {
        return Promise.resolve(new Response('Not Found', { status: 404 }));
      }

      return mw(ctx, () => dispatch(i + 1));
    }

    return dispatch(0);
  };
}
