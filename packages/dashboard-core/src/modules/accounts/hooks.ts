/**
 * Data hooks for the accounts module. Wire to contacts-core's
 * `/api/v1/accounts/*` surface through the gateway.
 *
 * Field names mirror `indie/packages/db/src/schema/accounts.ts` exactly
 * — the contacts handlers return Drizzle's `$inferSelect` rows over the
 * wire, and the PATCH whitelist (`ALLOWED_PATCH_FIELDS` in that same
 * schema) is what the patch builder in the detail view targets.
 *
 * Cursor pagination follows the same opaque-cursor pattern as persons
 * (see `managed/docs/services/contacts.md`).
 */
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";
import { useApiOrigin } from "../../auth/api-origin.js";
import { gatewayFetch } from "../../api/index.js";

export interface Account {
  id: string;
  displayName: string;
  domain: string | null;
  website: string | null;
  industry: string | null;
  streetLine1: string | null;
  streetLine2: string | null;
  city: string | null;
  region: string | null;
  postalCode: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  phone1CountryCode: string | null;
  phone1Number: string | null;
  phone1Ext: string | null;
  phone2CountryCode: string | null;
  phone2Number: string | null;
  phone2Ext: string | null;
  imageLogo: string | null;
  ownerUserId: string | null;
  status: "active" | "deleted";
  createdAt: string;
  updatedAt: string;
}

export interface AccountsListResponse {
  items: Account[];
  nextCursor: string | null;
}

export const ACCOUNTS_QUERY_KEY = ["accounts"] as const;
export const accountQueryKey = (id: string) => ["accounts", id] as const;

export interface UseAccountsOptions {
  cursor?: string | null;
  limit?: number;
}

export function useAccounts(
  options: UseAccountsOptions = {},
): UseQueryResult<AccountsListResponse> {
  const apiOrigin = useApiOrigin();
  const search = new URLSearchParams();
  if (options.cursor) search.set("cursor", options.cursor);
  if (options.limit) search.set("limit", String(options.limit));
  const qs = search.toString();
  return useQuery({
    queryKey: [...ACCOUNTS_QUERY_KEY, qs],
    queryFn: async () => {
      const res = await gatewayFetch({
        apiOrigin,
        path: `/api/v1/accounts${qs ? `?${qs}` : ""}`,
      });
      if (!res.ok) {
        throw new AccountsError(
          `accounts list failed (${res.status})`,
          `HTTP_${res.status}`,
          res.status,
        );
      }
      return (await res.json()) as AccountsListResponse;
    },
  });
}

export function useAccount(id: string | null): UseQueryResult<Account> {
  const apiOrigin = useApiOrigin();
  return useQuery({
    enabled: !!id,
    queryKey: id ? accountQueryKey(id) : ["accounts", "_disabled"],
    queryFn: async () => {
      const res = await gatewayFetch({
        apiOrigin,
        path: `/api/v1/accounts/${id}`,
      });
      if (!res.ok) {
        throw new AccountsError(
          `account fetch failed (${res.status})`,
          `HTTP_${res.status}`,
          res.status,
        );
      }
      const body = (await res.json()) as { account: Account };
      return body.account;
    },
  });
}

/**
 * PATCH input. Keys are a strict subset of `ALLOWED_PATCH_FIELDS` in
 * `indie/packages/db/src/schema/accounts.ts`; anything outside is
 * rejected by contacts-core as `400 INVALID_INPUT`. Immutable columns
 * (id, createdAt, createdBy, status, deletedAt, deletedBy) are also
 * rejected if present — keep them out of the patch.
 */
export interface UpdateAccountInput {
  id: string;
  patch: Partial<{
    displayName: string;
    domain: string | null;
    website: string | null;
    industry: string | null;
    streetLine1: string | null;
    streetLine2: string | null;
    city: string | null;
    region: string | null;
    postalCode: string | null;
    country: string | null;
    latitude: number | null;
    longitude: number | null;
    phone1CountryCode: string | null;
    phone1Number: string | null;
    phone1Ext: string | null;
    phone2CountryCode: string | null;
    phone2Number: string | null;
    phone2Ext: string | null;
    imageLogo: string | null;
    ownerUserId: string | null;
  }>;
}

export function useUpdateAccount(): UseMutationResult<
  Account,
  Error,
  UpdateAccountInput
> {
  const apiOrigin = useApiOrigin();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }) => {
      const res = await gatewayFetch({
        apiOrigin,
        path: `/api/v1/accounts/${id}`,
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: { code?: string; message?: string };
        };
        throw new AccountsError(
          body.error?.message ?? body.error?.code ?? `update failed (${res.status})`,
          body.error?.code ?? `HTTP_${res.status}`,
          res.status,
        );
      }
      const body = (await res.json()) as { account: Account };
      return body.account;
    },
    onSuccess: (account) => {
      qc.invalidateQueries({ queryKey: ACCOUNTS_QUERY_KEY });
      qc.setQueryData(accountQueryKey(account.id), account);
    },
  });
}

export function useDeleteAccount(): UseMutationResult<void, Error, string> {
  const apiOrigin = useApiOrigin();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id) => {
      const res = await gatewayFetch({
        apiOrigin,
        path: `/api/v1/accounts/${id}`,
        method: "DELETE",
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: { code?: string; message?: string };
        };
        throw new AccountsError(
          body.error?.message ?? body.error?.code ?? `delete failed (${res.status})`,
          body.error?.code ?? `HTTP_${res.status}`,
          res.status,
        );
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ACCOUNTS_QUERY_KEY }),
  });
}

export class AccountsError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "AccountsError";
  }
}
