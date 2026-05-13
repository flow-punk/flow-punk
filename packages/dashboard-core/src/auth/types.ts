/**
 * Auth surface types — consumed by `useSession`, `SignInScreen`, and the
 * router context.
 *
 * Provider IDs come from better-auth's config and are surfaced verbatim
 * by `GET /api/auth/providers` (ADR-021 §4). Indie's default is just
 * `emailPassword`; managed adds `google` + `apple`.
 *
 * Roles are domain values from `@flowpunk-indie/db.users.role`. The
 * dashboard treats them as opaque buckets for nav gating; admin / owner
 * privileges are enforced server-side (gateway middleware + repo gates).
 */
export interface AuthProviderDescriptor {
  id: "google" | "apple" | "emailPassword" | (string & {});
  label: string;
}

export interface SessionUser {
  id: string;
  email: string;
  name: string | null;
  role: "platform-admin" | "tenant-admin" | "tenant-member";
}

export interface Session {
  user: SessionUser;
  expiresAt: string;
}
