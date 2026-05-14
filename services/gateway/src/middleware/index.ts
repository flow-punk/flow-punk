import { composeMiddleware } from "./compose.js";
import { corsMiddleware } from "./cors.js";
import { requestIdMiddleware } from "./request-id.js";
import { loggingMiddleware } from "./logging.js";
import { authMiddleware } from "./auth.js";
import { indieAuthBootstrapMiddleware } from "./auth-bootstrap.js";
import { dispatchIndieRoute, routerMiddleware } from "./router.js";

export {
  composeMiddleware,
  corsMiddleware,
  requestIdMiddleware,
  loggingMiddleware,
  authMiddleware,
  indieAuthBootstrapMiddleware,
  dispatchIndieRoute,
  routerMiddleware,
};

import {
  INDIE_PUBLIC_PATHS,
  INDIE_BOOTSTRAP_PUBLIC_PATHS,
  OPENAPI_LOCAL_PATHS,
  getPublicPaths,
  isPublicPath,
} from "./public-paths.js";

export {
  INDIE_PUBLIC_PATHS,
  INDIE_BOOTSTRAP_PUBLIC_PATHS,
  OPENAPI_LOCAL_PATHS,
  getPublicPaths,
  isPublicPath,
};
export const PUBLIC_PATHS = INDIE_PUBLIC_PATHS;

/**
 * Creates the indie middleware chain in the correct order:
 * CORS → Request-ID → Logging → Auth → Bootstrap → Router
 *
 * `indieAuthBootstrapMiddleware` runs AFTER auth so the bootstrap path's
 * presence in `INDIE_BOOTSTRAP_PUBLIC_PATHS` (which the auth middleware
 * unions into its own public-path check) shields it from auth challenges,
 * and BEFORE the router so /auth/login dispatches to the OAuth handler
 * without going through the shared `dispatchIndieRoute` (managed reuses
 * that, so /auth/login must NOT be reachable through it).
 *
 * Managed builds its own chain from the exported primitives — and notably
 * does NOT include `indieAuthBootstrapMiddleware` or the bootstrap public
 * paths, so /auth/login resolves to 404 on managed by construction.
 */
export function createIndieChain() {
  return composeMiddleware([
    corsMiddleware,
    requestIdMiddleware,
    loggingMiddleware,
    authMiddleware,
    indieAuthBootstrapMiddleware,
    routerMiddleware,
  ]);
}
