/**
 * Data hooks for the api-keys module. Wire to auth-core's
 * `/api/v1/auth/keys/*` surface through the gateway. The raw `fpk_*`
 * value lives only inside the create/rotate mutation result; never
 * cached, never re-fetched (ADR-012 §"One-time display").
 */
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";
import { useCallback } from "react";
import { useApiOrigin } from "../../auth/api-origin.js";
import { gatewayFetch } from "../../api/index.js";

export interface ApiKey {
  id: string;
  tenantId: string;
  label: string;
  prefix: string;
  scopes: string[];
  expiresAt: string | null;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

export interface ApiKeyWithSecret extends ApiKey {
  /** Raw `fpk_*` token — server returns it exactly once on create. */
  token: string;
}

export interface CreateApiKeyInput {
  label: string;
  scopes: string[];
  expiresAt?: string | null;
  /** When set, the server records this rotation so audit + telemetry can
   *  pair the new key with the predecessor it replaces. The predecessor
   *  must already be revoked. */
  rotatedFrom?: string;
}

const KEYS_QUERY_KEY = ["api-keys"] as const;

interface ApiEnvelope<T> {
  success: boolean;
  data?: T;
  error?: { code: string; message?: string };
}

async function readEnvelope<T>(res: Response): Promise<T> {
  const body = (await res.json()) as ApiEnvelope<T>;
  if (!res.ok || !body.success || body.data === undefined) {
    throw new ApiKeysError(
      body.error?.message ?? body.error?.code ?? `request failed (${res.status})`,
      body.error?.code ?? `HTTP_${res.status}`,
      res.status,
    );
  }
  return body.data;
}

export function useApiKeys(): UseQueryResult<ApiKey[]> {
  const apiOrigin = useApiOrigin();
  return useQuery({
    queryKey: KEYS_QUERY_KEY,
    queryFn: async () => {
      const res = await gatewayFetch({
        apiOrigin,
        path: "/api/v1/auth/keys",
      });
      return readEnvelope<ApiKey[]>(res);
    },
  });
}

/**
 * Imperative create-key command. The raw `fpk_*` value is returned to
 * the caller exactly once and is NEVER stored in the React Query cache
 * (per ADR-012: the secret must not survive the create call). The
 * dialog component owns the secret in local component state; this hook
 * does not.
 *
 * Implemented as a plain async function (not `useMutation`) for that
 * reason — `useMutation` would put the result in the mutation cache,
 * which the React Query devtools surface and which serializers can
 * capture.
 */
export function useCreateApiKey(): {
  create: (input: CreateApiKeyInput) => Promise<ApiKeyWithSecret>;
} {
  const apiOrigin = useApiOrigin();
  const qc = useQueryClient();
  const create = useCallback(
    async (input: CreateApiKeyInput) => {
      const res = await gatewayFetch({
        apiOrigin,
        path: "/api/v1/auth/keys",
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const result = await readEnvelope<ApiKeyWithSecret>(res);
      qc.invalidateQueries({ queryKey: KEYS_QUERY_KEY });
      return result;
    },
    [apiOrigin, qc],
  );
  return { create };
}

export function useRevokeApiKey(): UseMutationResult<void, Error, string> {
  const apiOrigin = useApiOrigin();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await gatewayFetch({
        apiOrigin,
        path: `/api/v1/auth/keys/${id}`,
        method: "DELETE",
      });
      await readEnvelope<ApiKey>(res);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS_QUERY_KEY });
    },
  });
}

export interface RotateApiKeyInput {
  id: string;
  label: string;
  scopes: string[];
  expiresAt?: string | null;
}

/**
 * Imperative rotate-key command. ADR-012:130 + auth-core's `rotatedFrom`
 * predicate require the predecessor to be REVOKED before the
 * replacement is created, so the order is forced:
 *
 *   1. DELETE predecessor (soft-revoke).
 *   2. POST new key with `rotatedFrom: predecessor.id`.
 *
 * A failure between (1) and (2) leaves the caller with no active key
 * temporarily. The dialog surfaces a retry path that re-runs only the
 * create step (the predecessor stays revoked; `rotatedFrom` remains
 * valid). That ergonomic concern is constrained by the backend
 * contract — a future atomic-rotate endpoint would let us swap the
 * order. Tracked as a Phase 2.5 follow-up.
 *
 * The returned secret is held only in the caller's local state — never
 * in the React Query cache (per ADR-012).
 */
export function useRotateApiKey(): {
  rotate: (input: RotateApiKeyInput) => Promise<ApiKeyWithSecret>;
  /** Retry the create step alone after a partial failure. */
  retryCreate: (input: RotateApiKeyInput) => Promise<ApiKeyWithSecret>;
} {
  const apiOrigin = useApiOrigin();
  const qc = useQueryClient();

  const createWithRotatedFrom = useCallback(
    async (input: RotateApiKeyInput) => {
      const res = await gatewayFetch({
        apiOrigin,
        path: "/api/v1/auth/keys",
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: input.label,
          scopes: input.scopes,
          expiresAt: input.expiresAt ?? null,
          rotatedFrom: input.id,
        }),
      });
      const result = await readEnvelope<ApiKeyWithSecret>(res);
      qc.invalidateQueries({ queryKey: KEYS_QUERY_KEY });
      return result;
    },
    [apiOrigin, qc],
  );

  const rotate = useCallback(
    async (input: RotateApiKeyInput) => {
      const revokeRes = await gatewayFetch({
        apiOrigin,
        path: `/api/v1/auth/keys/${input.id}`,
        method: "DELETE",
      });
      await readEnvelope<ApiKey>(revokeRes);
      qc.invalidateQueries({ queryKey: KEYS_QUERY_KEY });
      return createWithRotatedFrom(input);
    },
    [apiOrigin, qc, createWithRotatedFrom],
  );

  return { rotate, retryCreate: createWithRotatedFrom };
}

export class ApiKeysError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "ApiKeysError";
  }
}

export { KEYS_QUERY_KEY };
