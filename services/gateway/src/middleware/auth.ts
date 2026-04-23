import type { AppContext, Middleware } from '../types.js';
import { extractAuthMaterial } from '../auth/extract-material.js';
import { enforceRestScope } from '../auth/scope.js';
import { validateApiKey } from '../auth/validate-apikey.js';
import {
  stripIdentityHeadersFromRequest,
  withIdentityHeaders,
} from '../auth/identity-headers.js';
import { unauthorized } from '../auth/unauthorized.js';
import { isPublicPath, INDIE_PUBLIC_PATHS } from './public-paths.js';

/**
 * Auth middleware (indie edition).
 */
export const authMiddleware: Middleware = async (
  ctx: AppContext,
  next: () => Promise<Response>,
): Promise<Response> => {
  const url = new URL(ctx.request.url);
  if (isPublicPath(url.pathname, INDIE_PUBLIC_PATHS)) {
    ctx.request = stripIdentityHeadersFromRequest(ctx.request);
    return next();
  }

  const material = extractAuthMaterial(ctx.request);
  if (!material || material.credentialType !== 'apikey') {
    return unauthorized();
  }

  const validation = await validateApiKey(
    ctx.env.AUTH_SERVICE,
    material.rawCredential,
    ctx.env.SERVICE_TIMEOUT_MS,
  );
  if (!validation) return unauthorized({ invalidToken: true });

  ctx.tenantId = validation.tenantId;
  ctx.userId = validation.userId;
  ctx.credentialId = validation.credentialId;
  ctx.credentialType = 'apikey';
  ctx.keyLabel = validation.keyLabel ?? null;
  ctx.scope = validation.scope;

  const scopeDenial = enforceRestScope(ctx.request.method, validation.scope);
  if (scopeDenial) return scopeDenial;

  ctx.request = new Request(ctx.request, {
    headers: withIdentityHeaders(ctx.request.headers, {
      tenantId: validation.tenantId,
      userId: validation.userId,
      scope: validation.scope,
      credentialType: 'apikey',
      credentialId: validation.credentialId,
    }),
  });

  return next();
};
