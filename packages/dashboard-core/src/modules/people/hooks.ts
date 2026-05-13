/**
 * Data hooks for the people module. Wire to contacts-core's
 * `/api/v1/persons/*` surface through the gateway.
 *
 * Note: the contacts service models the entity as `persons`; only the
 * dashboard surface is named "People". The hook names and query keys
 * here follow the UI vocabulary.
 *
 * Field names mirror `indie/packages/db/src/schema/persons.ts` exactly
 * — the contacts handlers return Drizzle's `$inferSelect` rows over the
 * wire, and the PATCH whitelist (`ALLOWED_PATCH_FIELDS` in that same
 * schema) is what the patch builder in the detail view targets.
 *
 * Pagination is cursor-based (opaque base64url `{createdAt,id}` cursor —
 * see `managed/docs/services/contacts.md`).
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

export type Phone1Type = "mobile" | "landline" | "voip" | "fax" | "other";
export type EmailConsent = "subscribed" | "unsubscribed" | "no_consent";

export interface Person {
  id: string;
  accountId: string | null;
  displayName: string;
  firstName: string | null;
  lastName: string | null;
  emailPrimary: string | null;
  phone1CountryCode: string | null;
  phone1Number: string | null;
  phone1Ext: string | null;
  phone1Type: Phone1Type | null;
  title: string | null;
  streetLine1: string | null;
  streetLine2: string | null;
  city: string | null;
  region: string | null;
  postalCode: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  imageAvatar: string | null;
  consentEmail: EmailConsent;
  status: "active" | "deleted";
  createdAt: string;
  updatedAt: string;
}

export interface PersonsListResponse {
  items: Person[];
  nextCursor: string | null;
}

export const PEOPLE_QUERY_KEY = ["people"] as const;
export const personQueryKey = (id: string) => ["people", id] as const;

export interface UsePeopleOptions {
  cursor?: string | null;
  limit?: number;
  /** Filter to persons linked to a single account (server-side). */
  accountId?: string;
}

export function usePeople(
  options: UsePeopleOptions = {},
): UseQueryResult<PersonsListResponse> {
  const apiOrigin = useApiOrigin();
  const search = new URLSearchParams();
  if (options.cursor) search.set("cursor", options.cursor);
  if (options.limit) search.set("limit", String(options.limit));
  if (options.accountId) search.set("accountId", options.accountId);
  const qs = search.toString();
  return useQuery({
    queryKey: [...PEOPLE_QUERY_KEY, qs],
    queryFn: async () => {
      const res = await gatewayFetch({
        apiOrigin,
        path: `/api/v1/persons${qs ? `?${qs}` : ""}`,
      });
      if (!res.ok) {
        throw new PeopleError(
          `persons list failed (${res.status})`,
          `HTTP_${res.status}`,
          res.status,
        );
      }
      return (await res.json()) as PersonsListResponse;
    },
  });
}

export function usePerson(id: string | null): UseQueryResult<Person> {
  const apiOrigin = useApiOrigin();
  return useQuery({
    enabled: !!id,
    queryKey: id ? personQueryKey(id) : ["people", "_disabled"],
    queryFn: async () => {
      const res = await gatewayFetch({
        apiOrigin,
        path: `/api/v1/persons/${id}`,
      });
      if (!res.ok) {
        throw new PeopleError(
          `person fetch failed (${res.status})`,
          `HTTP_${res.status}`,
          res.status,
        );
      }
      const body = (await res.json()) as { person: Person };
      return body.person;
    },
  });
}

/**
 * PATCH input. Keys here are a strict subset of `ALLOWED_PATCH_FIELDS`
 * in `indie/packages/db/src/schema/persons.ts`. Any column outside that
 * whitelist is rejected by contacts-core as `400 INVALID_INPUT`.
 *
 * `consentEmail` is **not nullable** — to clear, send the literal
 * `"no_consent"` (the schema's default). See `contacts.md` §Validation.
 */
export interface UpdatePersonInput {
  id: string;
  patch: Partial<{
    accountId: string | null;
    displayName: string;
    firstName: string | null;
    lastName: string | null;
    emailPrimary: string | null;
    phone1CountryCode: string | null;
    phone1Number: string | null;
    phone1Ext: string | null;
    phone1Type: Phone1Type | null;
    title: string | null;
    streetLine1: string | null;
    streetLine2: string | null;
    city: string | null;
    region: string | null;
    postalCode: string | null;
    country: string | null;
    latitude: number | null;
    longitude: number | null;
    imageAvatar: string | null;
    consentEmail: EmailConsent;
  }>;
}

export function useUpdatePerson(): UseMutationResult<
  Person,
  Error,
  UpdatePersonInput
> {
  const apiOrigin = useApiOrigin();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }) => {
      const res = await gatewayFetch({
        apiOrigin,
        path: `/api/v1/persons/${id}`,
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: { code?: string; message?: string };
        };
        throw new PeopleError(
          body.error?.message ?? body.error?.code ?? `update failed (${res.status})`,
          body.error?.code ?? `HTTP_${res.status}`,
          res.status,
        );
      }
      const body = (await res.json()) as { person: Person };
      return body.person;
    },
    onSuccess: (person) => {
      qc.invalidateQueries({ queryKey: PEOPLE_QUERY_KEY });
      qc.setQueryData(personQueryKey(person.id), person);
    },
  });
}

export function useDeletePerson(): UseMutationResult<void, Error, string> {
  const apiOrigin = useApiOrigin();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id) => {
      const res = await gatewayFetch({
        apiOrigin,
        path: `/api/v1/persons/${id}`,
        method: "DELETE",
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: { code?: string; message?: string };
        };
        throw new PeopleError(
          body.error?.message ?? body.error?.code ?? `delete failed (${res.status})`,
          body.error?.code ?? `HTTP_${res.status}`,
          res.status,
        );
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: PEOPLE_QUERY_KEY }),
  });
}

export class PeopleError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "PeopleError";
  }
}
