import { createLogger, emitAuditEvent } from '@flowpunk/service-utils';
import {
  route,
  type AuthCoreOptions,
  type AuthEnv,
} from '@flowpunk-indie/auth-core';
import {
  createAuthHandler,
  indieDefaultConfig,
  listEnabledProviders,
  validateDashboardSession,
  type AuthFactoryConfig,
} from '@flowpunk-indie/auth-better';

/**
 * Indie auth worker.
 *
 * Two concerns coexist (ADR-021 §7 — api-key auth is unchanged):
 *   - Better-auth — dashboard human auth at `/api/auth/*` (Phase 1).
 *   - Auth-core — api-key CRUD + `POST /auth/validate` for `fpk_*` tokens.
 *
 * Per ADR-012 §"Per-edition caps", indie permits 1 active API key per
 * deploy (single-admin model per ADR-011). We pass `maxActiveKeys: 1`
 * to auth-core. Per ADR-021 §4 + ADR-011:201 we do NOT branch any
 * package on an `EDITION` env var — provider variation is by config.
 */
const INDIE_AUTH_CORE_OPTIONS: AuthCoreOptions = {
  maxActiveKeys: 1,
};

interface IndieAuthBetterEnv {
  DB: D1Database;
  /** Session-signing secret (required). */
  AUTH_SECRET: string;
  /** Public origin where the dashboard is served. Used for OAuth
   *  callbacks + cookie/CORS validation. */
  GATEWAY_PUBLIC_ORIGIN: string;
}

type IndieAuthEnv = Omit<AuthEnv, 'AUTH_OPTIONS'> & IndieAuthBetterEnv;

let cachedConfig: AuthFactoryConfig | null = null;
function resolveConfig(env: IndieAuthBetterEnv): AuthFactoryConfig {
  if (cachedConfig) return cachedConfig;
  cachedConfig = indieDefaultConfig({
    publicOrigin: env.GATEWAY_PUBLIC_ORIGIN || 'http://localhost:3000',
    secret: env.AUTH_SECRET,
  });
  return cachedConfig;
}

export default {
  async fetch(request: Request, env: IndieAuthEnv): Promise<Response> {
    const requestId =
      request.headers.get('X-Request-ID') ?? crypto.randomUUID();
    const tenantId = request.headers.get('X-Tenant-Id') ?? undefined;
    const logger = createLogger({ service: 'auth' })
      .withRequestId(requestId)
      .withTenantId(tenantId);

    const url = new URL(request.url);

    // Gateway-internal session validation (Phase 1.2 — ADR-021 §4). The
    // gateway forwards the inbound Cookie header here; we resolve the
    // better-auth session and the linked domain `users` row, then return
    // a stable identity body. 401 on any failure — the gateway falls
    // through to its other credential paths.
    if (
      url.pathname === '/auth/session-identity' &&
      request.method === 'POST'
    ) {
      try {
        const config = resolveConfig(env);
        const identity = await validateDashboardSession({
          d1: env.DB,
          config,
          request,
        });
        if (!identity) {
          return jsonResponse(401, {
            success: false,
            error: { code: 'INVALID_SESSION' },
          });
        }
        return jsonResponse(200, {
          userId: identity.userId,
          sessionId: identity.sessionId,
          expiresAt: identity.expiresAt,
          email: identity.email,
          role: identity.role,
        });
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        logger.error('session-identity check failed', { error: err });
        return jsonResponse(500, {
          success: false,
          error: { code: 'AUTH_INTERNAL_ERROR' },
        });
      }
    }

    // Better-auth surface — dashboard sign-in / sign-up / sessions / OAuth.
    if (url.pathname.startsWith('/api/auth/')) {
      try {
        const config = resolveConfig(env);

        // Lightweight, edition-agnostic provider discovery so the UI can
        // render provider buttons dynamically (ADR-021 §4). Indie returns
        // `['emailPassword']`; managed returns email + google + apple
        // based on whatever its config object holds.
        if (url.pathname === '/api/auth/providers') {
          if (request.method !== 'GET' && request.method !== 'HEAD') {
            return new Response(null, {
              status: 405,
              headers: { Allow: 'GET, HEAD' },
            });
          }
          return jsonResponse(200, { providers: listEnabledProviders(config) });
        }

        const { handler } = createAuthHandler({
          d1: env.DB,
          config,
          audit: {
            actorTenantId: '_system',
            emit: (event) => emitAuditEvent(logger, event),
          },
        });
        return await handler(request);
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        logger.error('better-auth handler failed', {
          error: err,
          method: request.method,
          path: url.pathname,
        });
        return jsonResponse(500, {
          success: false,
          error: { code: 'AUTH_INTERNAL_ERROR' },
        });
      }
    }

    // Api-key surface — machine credentials, unchanged from before Phase 1.
    try {
      return await route(
        request,
        { ...env, AUTH_OPTIONS: INDIE_AUTH_CORE_OPTIONS },
        requestId,
      );
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error('unhandled error in auth worker', {
        error: err,
        method: request.method,
        path: url.pathname,
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
