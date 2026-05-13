import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getSession,
  signOut as apiSignOut,
  type GetSessionResponse,
} from "./api.js";
import { useApiOrigin } from "./api-origin.js";
import { useHostStrategy, type HostStrategyHint } from "./host-strategy.js";
import type { Session, SessionUser } from "./types.js";

const SESSION_QUERY_KEY = ["auth", "session"] as const;

/**
 * Map better-auth's `{user, session}` payload onto our domain Session
 * shape. Role mapping is host-class driven:
 *
 *   - On the console host (`hostStrategy === "console"`), any signed-in
 *     user is by definition a platform admin — the console better-auth
 *     instance is bound to PARENT_DB and is gated to `platform_admins`
 *     (ADR-013 §"Platform admin identity"). Cross-class session
 *     exchange is rejected at the gateway, so the client can safely
 *     trust the host class.
 *   - On tenant hosts the role defaults to `tenant-admin` until the
 *     gateway surfaces an authoritative `/me` route (ADR-021 §3 — the
 *     domain `users.role` is the source of truth).
 */
function toSession(
  response: GetSessionResponse | null,
  hostStrategy: HostStrategyHint,
): Session | null {
  if (!response) return null;
  const role: SessionUser["role"] =
    hostStrategy === "console" ? "platform-admin" : "tenant-admin";
  const sessionUser: SessionUser = {
    id: response.user.domainUserId ?? response.user.id,
    email: response.user.email,
    name: response.user.name,
    role,
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
  const hostStrategy = useHostStrategy();
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
    session: toSession(query.data ?? null, hostStrategy),
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
