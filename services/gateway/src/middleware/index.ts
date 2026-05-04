import { composeMiddleware } from './compose.js';
import { corsMiddleware } from './cors.js';
import { requestIdMiddleware } from './request-id.js';
import { loggingMiddleware } from './logging.js';
import { authMiddleware } from './auth.js';
import { dispatchIndieRoute, routerMiddleware } from './router.js';

export {
  composeMiddleware,
  corsMiddleware,
  requestIdMiddleware,
  loggingMiddleware,
  authMiddleware,
  dispatchIndieRoute,
  routerMiddleware,
};

import { INDIE_PUBLIC_PATHS, OPENAPI_LOCAL_PATHS, getPublicPaths, isPublicPath } from './public-paths.js';

export { INDIE_PUBLIC_PATHS, OPENAPI_LOCAL_PATHS, getPublicPaths, isPublicPath };
export const PUBLIC_PATHS = INDIE_PUBLIC_PATHS;

/**
 * Creates the indie middleware chain in the correct order:
 * CORS → Request-ID → Logging → Auth → Router
 *
 * This is a convenience for indie's own index.ts.
 * Managed builds its own chain from the exported primitives.
 */
export function createIndieChain() {
  return composeMiddleware([
    corsMiddleware,
    requestIdMiddleware,
    loggingMiddleware,
    authMiddleware,
    routerMiddleware,
  ]);
}
