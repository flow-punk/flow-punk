import { createLogger } from '@flowpunk/service-utils';
import {
  route,
  type UsersCoreOptions,
  type UsersEnv,
} from '@flowpunk-indie/users-core';

/**
 * Indie users worker.
 *
 * Per ADR-011 §"Indie multi-user foundation", indie enforces exactly one
 * active owner per deploy. We pass `enforceSingleOwner: true` here so the
 * shared core repo refuses to create/promote a second owner. Per
 * ADR-011:201 we do NOT branch the core code on an `EDITION` env var —
 * the option object is the entire interface.
 */
const INDIE_OPTIONS: UsersCoreOptions = {
  enforceSingleOwner: true,
};

type IndieUsersEnv = Omit<UsersEnv, 'USERS_OPTIONS'>;

export default {
  async fetch(request: Request, env: IndieUsersEnv): Promise<Response> {
    const requestId =
      request.headers.get('X-Request-ID') ?? crypto.randomUUID();
    const tenantId = request.headers.get('X-Tenant-Id') ?? undefined;
    const logger = createLogger({ service: 'users' })
      .withRequestId(requestId)
      .withTenantId(tenantId);

    try {
      return await route(
        request,
        { ...env, USERS_OPTIONS: INDIE_OPTIONS },
        logger,
      );
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error('unhandled error in users worker', {
        error: err,
        method: request.method,
        path: new URL(request.url).pathname,
      });
      return new Response(
        JSON.stringify({
          success: false,
          error: { code: 'INTERNAL_ERROR' },
        }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }
  },
};

export type { UsersEnv } from '@flowpunk-indie/users-core';
