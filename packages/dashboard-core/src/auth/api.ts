/**
 * Better-auth HTTP client thinly typed against the wire endpoints we
 * actually call. Each helper hits `/api/auth/*` on the gateway with
 * `credentials: 'include'` so the host-scoped session cookie round-trips.
 *
 * We do NOT pull in `better-auth/react`. The sign-in surface is small
 * enough that a hand-rolled client avoids a 60kB+ runtime cost and a
 * library upgrade dance for what is essentially three POST calls.
 */
import { SessionExpiredError } from "../api/index.js";

export interface BetterAuthUser {
  id: string;
  email: string;
  name: string | null;
  emailVerified: boolean;
  image?: string | null;
  /** Bidirectional FK to the domain `users.id`. Null until linked. */
  domainUserId?: string | null;
}

export interface BetterAuthSession {
  id: string;
  expiresAt: string;
  token: string;
  userId: string;
}

export interface GetSessionResponse {
  user: BetterAuthUser;
  session: BetterAuthSession;
}

async function authFetch(
  apiOrigin: string,
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const res = await fetch(`${apiOrigin}${path}`, {
    credentials: "include",
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  return res;
}

/**
 * Reads the current session. Better-auth returns `null` body (status
 * 200) when no session exists; we map that to `null` so callers don't
 * need to distinguish "no cookie" from "expired cookie".
 */
export async function getSession(
  apiOrigin: string,
): Promise<GetSessionResponse | null> {
  const res = await authFetch(apiOrigin, "/api/auth/get-session");
  if (!res.ok) {
    if (res.status === 401) throw new SessionExpiredError();
    throw new Error(`getSession failed: ${res.status}`);
  }
  const text = await res.text();
  if (!text || text === "null") return null;
  return JSON.parse(text) as GetSessionResponse;
}

export interface ProvidersResponse {
  providers: ReadonlyArray<string>;
}

export async function listProviders(
  apiOrigin: string,
): Promise<ProvidersResponse> {
  const res = await authFetch(apiOrigin, "/api/auth/providers");
  if (!res.ok) throw new Error(`listProviders failed: ${res.status}`);
  return (await res.json()) as ProvidersResponse;
}

export interface SignInEmailInput {
  email: string;
  password: string;
}

export interface SignInResponse {
  /** Whether better-auth completed sign-in immediately. When
   *  `requireEmailVerification` is true and the user is unverified,
   *  better-auth returns a 200 with a verification-pending payload. */
  user?: BetterAuthUser;
  /** Set when an additional step is needed (e.g. verify email). */
  twoFactorRedirect?: boolean;
  /** Free-form. Treated opaquely. */
  [key: string]: unknown;
}

export async function signInWithEmail(
  apiOrigin: string,
  input: SignInEmailInput,
): Promise<SignInResponse> {
  const res = await authFetch(apiOrigin, "/api/auth/sign-in/email", {
    method: "POST",
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}) as Record<string, unknown>);
    throw new SignInError(
      typeof (body as { message?: unknown }).message === "string"
        ? ((body as { message: string }).message)
        : `sign-in failed (${res.status})`,
      res.status,
    );
  }
  return (await res.json()) as SignInResponse;
}

export interface SignUpEmailInput {
  email: string;
  password: string;
  name: string;
}

export async function signUpWithEmail(
  apiOrigin: string,
  input: SignUpEmailInput,
): Promise<SignInResponse> {
  const res = await authFetch(apiOrigin, "/api/auth/sign-up/email", {
    method: "POST",
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}) as Record<string, unknown>);
    throw new SignInError(
      typeof (body as { message?: unknown }).message === "string"
        ? ((body as { message: string }).message)
        : `sign-up failed (${res.status})`,
      res.status,
    );
  }
  return (await res.json()) as SignInResponse;
}

/**
 * Redirects to the social provider via better-auth's hosted authorize
 * URL. Returns the URL so callers can choose how to navigate (full
 * page redirect vs. popup). For the dashboard we do a hard redirect.
 */
export async function signInWithSocial(
  apiOrigin: string,
  provider: string,
  callbackURL: string,
): Promise<{ url: string }> {
  const res = await authFetch(apiOrigin, "/api/auth/sign-in/social", {
    method: "POST",
    body: JSON.stringify({ provider, callbackURL }),
  });
  if (!res.ok) throw new SignInError(`social sign-in failed (${res.status})`, res.status);
  return (await res.json()) as { url: string };
}

export async function signOut(apiOrigin: string): Promise<void> {
  const res = await authFetch(apiOrigin, "/api/auth/sign-out", {
    method: "POST",
    body: "{}",
  });
  if (!res.ok && res.status !== 401) {
    throw new Error(`sign-out failed: ${res.status}`);
  }
}

export async function requestPasswordReset(
  apiOrigin: string,
  email: string,
  redirectTo: string,
): Promise<void> {
  const res = await authFetch(apiOrigin, "/api/auth/request-password-reset", {
    method: "POST",
    body: JSON.stringify({ email, redirectTo }),
  });
  if (!res.ok) {
    throw new SignInError(`request-password-reset failed (${res.status})`, res.status);
  }
}

export async function resetPassword(
  apiOrigin: string,
  token: string,
  newPassword: string,
): Promise<void> {
  const res = await authFetch(apiOrigin, "/api/auth/reset-password", {
    method: "POST",
    body: JSON.stringify({ token, newPassword }),
  });
  if (!res.ok) {
    throw new SignInError(`reset-password failed (${res.status})`, res.status);
  }
}

export class SignInError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "SignInError";
  }
}
