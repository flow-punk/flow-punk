import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { drizzle } from 'drizzle-orm/d1';
import type { AuthFactoryConfig } from './config/types.js';
import {
  authAccount,
  authSession,
  authUser,
  authVerification,
} from '@flowpunk-indie/db';

/**
 * Inputs the wrapper service supplies. The factory is edition-agnostic;
 * Indie wraps it with `indieDefaultConfig`, managed wraps it with config
 * that adds `socialProviders.{ google, apple }`.
 *
 * The L3 swap boundary documented in ADR-021 §4 is *this* function shape:
 * fork-and-replace `@flowpunk-indie/auth-better` with anything that
 * exports `createAuthHandler({ db, config }): { handler: (req) => Response }`.
 */
export interface CreateAuthHandlerInput {
  /** Tenant D1 (indie: the single bound D1; managed: per-tenant D1). */
  d1: D1Database;
  /** Resolved config (from `indieDefaultConfig` or managed equivalent). */
  config: AuthFactoryConfig;
}

export interface AuthHandler {
  /** Hono-compatible request handler mounted under `/api/auth/*`. */
  handler: (request: Request) => Promise<Response>;
}

export function createAuthHandler(input: CreateAuthHandlerInput): AuthHandler {
  const db = drizzle(input.d1);

  const socialProviders: Record<string, unknown> = {};
  const google = input.config.socialProviders?.google;
  if (google?.enabled) {
    socialProviders.google = {
      clientId: google.clientId,
      clientSecret: google.clientSecret,
    };
  }
  const apple = input.config.socialProviders?.apple;
  if (apple?.enabled) {
    socialProviders.apple = {
      clientId: apple.clientId,
      clientSecret: apple.clientSecret,
      teamId: apple.teamId,
      keyId: apple.keyId,
    };
  }

  const instance = betterAuth({
    baseURL: input.config.publicOrigin,
    basePath: '/api/auth',
    secret: input.config.secret,
    database: drizzleAdapter(db, {
      provider: 'sqlite',
      schema: {
        user: authUser,
        session: authSession,
        account: authAccount,
        verification: authVerification,
      },
    }),
    emailAndPassword: {
      enabled: input.config.emailPassword.enabled,
      requireEmailVerification:
        input.config.emailPassword.requireEmailVerification,
    },
    socialProviders,
    user: {
      additionalFields: {
        domainUserId: {
          type: 'string',
          required: false,
          input: false,
        },
      },
    },
    advanced: {
      cookies: {
        // Per ADR-021 §6 the cookie semantics required by ADR-016 are
        // preserved: HttpOnly + Secure + SameSite=Strict + host-scoped.
        sessionToken: {
          attributes: {
            httpOnly: true,
            secure: true,
            sameSite: 'strict',
          },
        },
      },
      ...(input.config.cookieDomain
        ? { defaultCookieAttributes: { domain: input.config.cookieDomain } }
        : {}),
    },
  });

  return {
    handler: (request) => instance.handler(request),
  };
}

/**
 * Edition-agnostic helper: list provider IDs the server is configured for.
 * Mounted at `GET /api/auth/providers` by the wrapper service so the
 * dashboard UI can render provider buttons dynamically (ADR-021 §4).
 *
 * Indie default returns `['emailPassword']`; managed default returns
 * `['emailPassword', 'google', 'apple']`. The wrapper never branches on
 * edition — it reads what config it was given.
 */
export function listEnabledProviders(config: AuthFactoryConfig): string[] {
  const out: string[] = [];
  if (config.emailPassword.enabled) out.push('emailPassword');
  if (config.socialProviders?.google?.enabled) out.push('google');
  if (config.socialProviders?.apple?.enabled) out.push('apple');
  return out;
}
