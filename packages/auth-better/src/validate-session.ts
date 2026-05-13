/**
 * Server-side dashboard-session validator (ADR-021 §4 + implementation
 * plan §1.2).
 *
 * The gateway forwards the inbound `Cookie` header to AUTH_SERVICE via
 * a service binding and AUTH_SERVICE answers with a stable identity
 * shape (or 401). The factory below produces the function that the
 * wrapper service mounts behind `POST /auth/session-identity`.
 *
 * Why a thin wrapper around `auth.api.getSession`:
 *   - Keeps the gateway free of better-auth's wire format. The gateway
 *     speaks only our internal identity contract.
 *   - Lets the auth worker enforce the bidirectional FK invariant
 *     (`auth_user.domain_user_id` → `users.id`) and the domain-side
 *     status / role gates in one place.
 *   - The L3 swap boundary (ADR-021 §4) becomes "anything that
 *     exposes `createAuthHandler` + `validateDashboardSession`".
 */
import { drizzle } from 'drizzle-orm/d1';
import {
  hasAdminRights,
  usersRepo,
  type Role,
  type UserStatus,
} from '@flowpunk-indie/db';
import { createAuthInstance, type CreateAuthHandlerInput } from './handler.js';

export interface DashboardSessionIdentity {
  /** Domain `users.id`. */
  userId: string;
  /** Better-auth `auth_session.id` — opaque to consumers, used as
   *  `credentialId` by the gateway. */
  sessionId: string;
  /** Session expiry as ISO-8601. */
  expiresAt: string;
  /** Authenticated user's email (PII; logged opaque per ADR-007). */
  email: string;
  /** Domain role. */
  role: Role;
}

export interface ValidateDashboardSessionInput extends CreateAuthHandlerInput {
  /** Incoming request, forwarded headers carry the session cookie. */
  request: Request;
}

/**
 * Validates a better-auth session cookie and joins to the domain `users`
 * row. Returns null when:
 *   - No session cookie / invalid signature / expired session.
 *   - Better-auth user has no `domainUserId` (linking is incomplete).
 *   - Domain user not found, not active, or role lacks admin rights.
 *
 * Callers MUST translate null into 401. This function never throws on
 * authorization failure — only on programming errors.
 */
export async function validateDashboardSession(
  input: ValidateDashboardSessionInput,
): Promise<DashboardSessionIdentity | null> {
  const instance = createAuthInstance(input);

  // `getSession` reads the cookie from the supplied headers; passes
  // through the standard better-auth signature + revocation checks.
  let resolved: Awaited<ReturnType<typeof instance.api.getSession>>;
  try {
    resolved = await instance.api.getSession({
      headers: input.request.headers,
    });
  } catch {
    return null;
  }
  if (!resolved) return null;

  const session = resolved.session as
    | { id: string; expiresAt: Date | string }
    | undefined;
  const authUser = resolved.user as
    | { id: string; email: string; domainUserId?: string | null }
    | undefined;
  if (!session || !authUser) return null;

  const domainUserId = authUser.domainUserId ?? null;
  if (!domainUserId) return null;

  const db = drizzle(input.d1);
  const user = await usersRepo.findById(db, domainUserId, {
    includeDeleted: true,
  });
  if (!user) return null;
  if ((user.status as UserStatus) !== 'active') return null;
  if (!hasAdminRights(user.role)) return null;

  const expiresAt =
    session.expiresAt instanceof Date
      ? session.expiresAt.toISOString()
      : String(session.expiresAt);

  return {
    userId: user.id,
    sessionId: session.id,
    expiresAt,
    email: user.email,
    role: user.role,
  };
}
