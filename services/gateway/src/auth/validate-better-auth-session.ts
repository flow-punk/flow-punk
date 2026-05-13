/**
 * Validates a better-auth dashboard session cookie by forwarding the
 * inbound Cookie header to AUTH_SERVICE via service binding (Phase 1.2
 * of the dashboard implementation plan; ADR-021 §4).
 *
 * Why a service-binding hop rather than parsing the cookie here:
 *   - Better-auth controls the cookie format, signature, and refresh
 *     semantics. Re-implementing that in the gateway would couple us to
 *     a library detail that is allowed to churn.
 *   - The auth worker is the single place that can resolve the
 *     bidirectional FK (`auth_user.domain_user_id` → `users.id`) and run
 *     the domain `users` active/role gates.
 *   - Indie's auth-better instance lives on the indie tenant D1 binding;
 *     managed's instance lives on a per-tenant D1. The gateway is not
 *     supposed to know which D1 to read.
 *
 * The gateway sends `POST /auth/session-identity` to AUTH_SERVICE with
 * the original Cookie header and expects a JSON identity body (200) or
 * 401. No body content is required on the request.
 */
import { fetchWithServiceTimeout } from '../fetch-with-timeout.js';
import { parseCookies } from './cookies.js';

const BETTER_AUTH_COOKIE_NAME = 'better-auth.session_token';
const BETTER_AUTH_SECURE_COOKIE_NAME = '__Secure-better-auth.session_token';

export interface BetterAuthSessionIdentity {
  tenantId: string;
  userId: string;
  scope: 'admin';
  credentialType: 'session';
  credentialId: string;
  expiresAt: string;
}

/**
 * Returns true when the request carries at least the better-auth session
 * cookie shell. The actual signature/expiry checks happen in AUTH_SERVICE.
 * Short-circuits us out of the service-binding round-trip when no cookie
 * is present.
 */
export function hasBetterAuthCookie(request: Request): boolean {
  const cookies = parseCookies(request);
  return (
    cookies.has(BETTER_AUTH_COOKIE_NAME) ||
    cookies.has(BETTER_AUTH_SECURE_COOKIE_NAME)
  );
}

export interface ValidateBetterAuthSessionInput {
  authService: Fetcher;
  request: Request;
  serviceTimeoutMs: string;
  /**
   * Tenant the request resolves to. Indie always passes `_system`;
   * managed passes the host-resolved tenant (or omits + sets the
   * console header — see the managed gateway).
   */
  tenantId: string;
  /** Optional headers forwarded to AUTH_SERVICE (e.g. console class). */
  forwardHeaders?: Record<string, string>;
}

/**
 * Returns the resolved identity for the request's session cookie, or
 * null if the cookie is missing, invalid, expired, or the linked
 * domain user is not an active admin.
 */
export async function validateBetterAuthSession(
  input: ValidateBetterAuthSessionInput,
): Promise<BetterAuthSessionIdentity | null> {
  if (!hasBetterAuthCookie(input.request)) return null;

  const cookieHeader = input.request.headers.get('Cookie');
  if (!cookieHeader) return null;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Cookie: cookieHeader,
    'X-Tenant-Id': input.tenantId,
  };
  if (input.forwardHeaders) {
    for (const [k, v] of Object.entries(input.forwardHeaders)) {
      headers[k] = v;
    }
  }

  let res: Response;
  try {
    res = await fetchWithServiceTimeout(
      input.authService,
      'http://internal/auth/session-identity',
      {
        method: 'POST',
        headers,
        body: '{}',
      },
      input.serviceTimeoutMs,
    );
  } catch {
    return null;
  }
  if (!res.ok) return null;

  let body: Partial<{
    userId: string;
    sessionId: string;
    expiresAt: string;
  }>;
  try {
    body = (await res.json()) as typeof body;
  } catch {
    return null;
  }

  if (
    !body.userId ||
    typeof body.userId !== 'string' ||
    !body.sessionId ||
    typeof body.sessionId !== 'string' ||
    !body.expiresAt ||
    typeof body.expiresAt !== 'string'
  ) {
    return null;
  }

  return {
    tenantId: input.tenantId,
    userId: body.userId,
    scope: 'admin',
    credentialType: 'session',
    credentialId: body.sessionId,
    expiresAt: body.expiresAt,
  };
}
