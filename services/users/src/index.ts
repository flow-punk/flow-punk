import { drizzle } from "drizzle-orm/d1";
import { createLogger } from "@flowpunk/service-utils";
import {
  route,
  type UsersCoreOptions,
  type UsersEnv,
} from "@flowpunk-indie/users-core";
import { oauthTokensRepo } from "@flowpunk-indie/db";

/**
 * Indie users worker.
 *
 * Per ADR-011 §"Indie multi-user foundation", indie enforces exactly one
 * active owner per deploy. We pass `enforceSingleOwner: true` here so the
 * shared core repo refuses to create/promote a second owner. Per
 * ADR-011:201 we do NOT branch the core code on an `EDITION` env var —
 * the option object is the entire interface.
 *
 * Per ADR-019 §B5, the wrapper cascades on successful soft-delete:
 *   1. Revoke the user's OAuth tokens via `oauthTokensRepo.revokeForUser`.
 *   2. Write the `user_invalidated:_system:<userId>` tombstone to
 *      `OAUTH_TOKEN_CACHE` so the gateway's identity-cache hit path
 *      stops returning the deleted user's identity within 60s.
 *
 * Idempotency replays return the cached response and never reach this
 * wrapper code path; the cascade runs exactly once on the original DELETE.
 */
const INDIE_OPTIONS: UsersCoreOptions = {
  enforceSingleOwner: true,
};

const USER_INVALIDATION_TTL_SECONDS = 60;
const INDIE_SCOPE = "_system";

type IndieUsersEnv = Omit<UsersEnv, "USERS_OPTIONS"> & {
  /**
   * OAuth identity + revocation cache. The wrapper writes a
   * `user_invalidated:_system:<userId>` tombstone on successful
   * soft-delete (per ADR-019 §B5).
   */
  OAUTH_TOKEN_CACHE: KVNamespace;
};

export default {
  async fetch(request: Request, env: IndieUsersEnv): Promise<Response> {
    const requestId =
      request.headers.get("X-Request-ID") ?? crypto.randomUUID();
    const tenantId = request.headers.get("X-Tenant-Id") ?? undefined;
    const logger = createLogger({ service: "users" })
      .withRequestId(requestId)
      .withTenantId(tenantId);

    let response: Response;
    try {
      response = await route(
        request,
        { ...env, USERS_OPTIONS: INDIE_OPTIONS },
        logger,
      );
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error("unhandled error in users worker", {
        error: err,
        method: request.method,
        path: new URL(request.url).pathname,
      });
      return new Response(
        JSON.stringify({
          success: false,
          error: { code: "INTERNAL_ERROR" },
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    // OAuth cascade for successful DELETE /api/v1/users/:id (per ADR-019 §B5).
    // Idempotency replays bypass this wrapper code path and never re-fire
    // the cascade — original-request semantics.
    const url = new URL(request.url);
    if (
      request.method === "DELETE" &&
      response.status >= 200 &&
      response.status < 300 &&
      url.pathname.startsWith("/api/v1/users/")
    ) {
      const targetUserId = url.pathname.slice("/api/v1/users/".length);
      if (targetUserId && !targetUserId.includes("/")) {
        await cascadeRevokeOauth(env, targetUserId, logger);
      }
    }

    return response;
  },
};

async function cascadeRevokeOauth(
  env: IndieUsersEnv,
  userId: string,
  logger: ReturnType<typeof createLogger>,
): Promise<void> {
  const now = new Date().toISOString();

  try {
    const db = drizzle(env.DB);
    const revokedCount = await oauthTokensRepo.revokeForUser(db, userId, now);
    logger.info("oauth.revokedForUser", { userId, revokedCount });
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error("oauth cascade revoke failed", { error: err, userId });
  }

  // User-invalidation tombstone — independent of the DB revoke. Both
  // matter: the DB revoke is durable, the tombstone short-circuits the
  // 60s identity-cache window.
  try {
    await env.OAUTH_TOKEN_CACHE.put(
      `user_invalidated:${INDIE_SCOPE}:${userId}`,
      now,
      { expirationTtl: USER_INVALIDATION_TTL_SECONDS },
    );
    logger.info("oauth.userInvalidationTombstoneWritten", { userId });
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.warn("oauth user-invalidation tombstone write failed", {
      error: err,
      userId,
    });
  }
}

export type { UsersEnv } from "@flowpunk-indie/users-core";
