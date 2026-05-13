/**
 * Data hooks for the people module. Wire to contacts-core's
 * `/api/v1/persons/*` surface through the gateway.
 *
 * Note: the contacts service models the entity as `persons`; only the
 * dashboard surface is named "People". The hook names and query keys
 * here follow the UI vocabulary.
 *
 * Pagination is cursor-based (opaque base64url `{createdAt,id}` cursor —
 * see `managed/docs/services/contacts.md`). The list hook returns the
 * current page only; the calling view advances `cursor` state on
 * "Next". Switching to `useInfiniteQuery` is straightforward when an
 * infinite-scroll UX lands.
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

export interface Person {
  id: string;
  displayName: string;
  firstName: string | null;
  lastName: string | null;
  emailPrimary: string | null;
  title: string | null;
  phone1: string | null;
  phone1Type: "mobile" | "landline" | "voip" | "fax" | "other" | null;
  accountId: string | null;
  consentEmail: "subscribed" | "unsubscribed" | "no_consent";
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  region: string | null;
  postalCode: string | null;
  country: string | null;
  timezone: string | null;
  language: string | null;
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
  accountId?: string;
  /**
   * Free-text client-side filter applied to the current page.
   * Server-side search lands when ADR-005 search wiring ships.
   */
  search?: string;
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
      const body = (await res.json()) as { person: Person } | Person;
      return ("person" in body ? body.person : body) as Person;
    },
  });
}

export interface UpdatePersonInput {
  id: string;
  patch: Partial<{
    displayName: string;
    firstName: string | null;
    lastName: string | null;
    emailPrimary: string | null;
    title: string | null;
    phone1: string | null;
    phone1Type: Person["phone1Type"];
    accountId: string | null;
    consentEmail: Person["consentEmail"];
    addressLine1: string | null;
    addressLine2: string | null;
    city: string | null;
    region: string | null;
    postalCode: string | null;
    country: string | null;
    timezone: string | null;
    language: string | null;
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
      const body = (await res.json()) as { person: Person } | Person;
      return ("person" in body ? body.person : body) as Person;
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
