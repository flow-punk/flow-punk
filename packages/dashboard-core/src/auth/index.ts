/** Better-auth client + `useAuth` / `useSession` hooks land in Phase 1.
 *  Phase 0 ships only the type surface so consumers can compile. */

export interface AuthProviderDescriptor {
  id: "google" | "apple" | "emailPassword" | (string & {});
  /** Display label, e.g., "Continue with Google". */
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
