import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getSession,
  signOut as apiSignOut,
  type GetSessionResponse,
} from "./api.js";
import { useApiOrigin } from "./api-origin.js";
import type { Session, SessionUser } from "./types.js";

const SESSION_QUERY_KEY = ["auth", "session"] as const;

/**
 * Map better-auth's `{user, session}` payload onto our domain Session
 * shape. The role mapping is intentionally narrow:
 *
 *   - The domain join is owned by the gateway; better-auth surfaces only
 *     the auth_user row plus our additionalField `domainUserId`.
 *   - The dashboard needs the role for nav gating, so the wrapper apps
 *     extend the session fetch with the role separately (Phase 1.3
 *     follow-up); for now we default to `tenant-admin` for any signed-in
 *     user. ADR-021 §3 — the domain `users.role` is the source of truth;
 *     this stub is replaced when the gateway exposes a `/me` route.
 */
function toSession(response: GetSessionResponse | null): Session | null {
  if (!response) return null;
  const sessionUser: SessionUser = {
    id: response.user.domainUserId ?? response.user.id,
    email: response.user.email,
    name: response.user.name,
    role: "tenant-admin",
  };
  return {
    user: sessionUser,
    expiresAt:
      typeof response.session.expiresAt === "string"
        ? response.session.expiresAt
        : new Date(response.session.expiresAt).toISOString(),
  };
}

export interface UseSessionResult {
  /** Current session, or null when signed out. */
  session: Session | null;
  /** True until the first fetch resolves. */
  isLoading: boolean;
  /** True for refetches after the first load. */
  isFetching: boolean;
  /** Force a refetch (e.g. after sign-in). */
  refresh: () => Promise<void>;
  /** Sign-out + clear cached query results. */
  signOut: () => Promise<void>;
}

export function useSession(): UseSessionResult {
  const apiOrigin = useApiOrigin();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: SESSION_QUERY_KEY,
    queryFn: () => getSession(apiOrigin),
    staleTime: 30_000,
    retry: false,
  });

  const signOutMutation = useMutation({
    mutationFn: () => apiSignOut(apiOrigin),
    onSuccess: () => {
      queryClient.setQueryData(SESSION_QUERY_KEY, null);
    },
  });

  return {
    session: toSession(query.data ?? null),
    isLoading: query.isPending,
    isFetching: query.isFetching,
    refresh: async () => {
      await query.refetch();
    },
    signOut: async () => {
      await signOutMutation.mutateAsync();
    },
  };
}

export { SESSION_QUERY_KEY };
