/**
 * Data hooks for the settings module — better-auth backed (password
 * change + session admin) plus self-PATCH against users-core for the
 * profile name fields.
 */
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";
import { useCallback, useRef, useState } from "react";
import { useApiOrigin } from "../../auth/api-origin.js";
import {
  changePassword,
  listSessions,
  revokeSession,
  signOutEverywhere,
  type BetterAuthSessionRow,
  type ChangePasswordInput,
} from "../../auth/api.js";

const SESSIONS_QUERY_KEY = ["auth", "sessions"] as const;

/**
 * Session row that's safe to cache — better-auth's `/list-sessions`
 * payload includes the raw bearer `token` for each session (used by
 * `/revoke-session`), which we DO NOT want sitting in React Query's
 * cache where the devtools or a JSON serializer can pick it up.
 *
 * The hook strips `token` from the query result and stashes the
 * id→token map in a per-component ref. `useRevokeSession` consumes that
 * map by id, so the bearer value never leaves this module's render
 * scope.
 */
export type SafeSessionRow = Omit<BetterAuthSessionRow, "token">;

export interface UseActiveSessionsResult {
  query: UseQueryResult<SafeSessionRow[]>;
  /** Lookup id → opaque session token. Populated synchronously by the
   *  queryFn before React Query writes the sanitized rows into cache. */
  tokenFor: (sessionId: string) => string | null;
}

export function useActiveSessions(): UseActiveSessionsResult {
  const apiOrigin = useApiOrigin();
  // Per-component map; cleared on unmount. The map is intentionally not
  // a ref into the React Query cache — bearer tokens stay out of it.
  const tokensRef = useRef<Map<string, string>>(new Map());
  const query = useQuery<SafeSessionRow[]>({
    queryKey: SESSIONS_QUERY_KEY,
    queryFn: async () => {
      const rows = await listSessions(apiOrigin);
      const nextTokens = new Map<string, string>();
      const safe: SafeSessionRow[] = rows.map((row) => {
        const { token: _token, ...rest } = row;
        nextTokens.set(row.id, row.token);
        return rest;
      });
      tokensRef.current = nextTokens;
      return safe;
    },
  });
  const tokenFor = useCallback(
    (sessionId: string) => tokensRef.current.get(sessionId) ?? null,
    [],
  );
  return { query, tokenFor };
}

export function useChangePassword(): UseMutationResult<
  void,
  Error,
  ChangePasswordInput
> {
  const apiOrigin = useApiOrigin();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ChangePasswordInput) =>
      changePassword(apiOrigin, input),
    onSuccess: (_, vars) => {
      if (vars.revokeOtherSessions) {
        qc.invalidateQueries({ queryKey: SESSIONS_QUERY_KEY });
      }
    },
  });
}

/**
 * Imperative revoke-session command. Implemented as a plain async
 * helper (not `useMutation`) so the bearer `token` argument never lands
 * in the mutation cache's `variables` — only the consumer's in-flight
 * promise sees it.
 */
export function useRevokeSession(): {
  isPending: boolean;
  revoke: (token: string) => Promise<void>;
} {
  const apiOrigin = useApiOrigin();
  const qc = useQueryClient();
  const [pending, setPending] = useState(0);
  const revoke = useCallback(
    async (token: string) => {
      setPending((c) => c + 1);
      try {
        await revokeSession(apiOrigin, token);
        qc.invalidateQueries({ queryKey: SESSIONS_QUERY_KEY });
      } finally {
        setPending((c) => c - 1);
      }
    },
    [apiOrigin, qc],
  );
  return { isPending: pending > 0, revoke };
}

export function useSignOutEverywhere(): UseMutationResult<void, Error, void> {
  const apiOrigin = useApiOrigin();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => signOutEverywhere(apiOrigin),
    onSuccess: () => qc.invalidateQueries({ queryKey: SESSIONS_QUERY_KEY }),
  });
}

export { SESSIONS_QUERY_KEY };
