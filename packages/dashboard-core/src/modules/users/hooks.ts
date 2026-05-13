/**
 * Data hooks for the users module. Wire to users-core's
 * `/api/v1/users` surface through the gateway. Role transitions and the
 * single-owner constraint are enforced server-side; the UI mirrors the
 * constraint client-side only as a usability hint (disabled controls +
 * tooltip).
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

export type UserRole = "owner" | "admin" | "member" | "readonly";
export type UserStatus = "active" | "deleted";

export interface User {
  id: string;
  email: string;
  displayName: string;
  firstName: string | null;
  lastName: string | null;
  role: UserRole;
  status: UserStatus;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UsersListResponse {
  data: User[];
  nextCursor?: string;
}

const USERS_QUERY_KEY = ["users"] as const;
const userQueryKey = (id: string) => ["users", id] as const;

export interface UseUsersOptions {
  /** Include soft-deleted users in the result. Defaults to false. */
  includeDeleted?: boolean;
  /** Filter by role. */
  role?: UserRole;
}

export function useUsers(
  options: UseUsersOptions = {},
): UseQueryResult<User[]> {
  const apiOrigin = useApiOrigin();
  const search = new URLSearchParams();
  if (options.includeDeleted) search.set("includeDeleted", "true");
  if (options.role) search.set("role", options.role);
  const qs = search.toString();
  return useQuery({
    queryKey: [...USERS_QUERY_KEY, qs],
    queryFn: async () => {
      const res = await gatewayFetch({
        apiOrigin,
        path: `/api/v1/users${qs ? `?${qs}` : ""}`,
      });
      if (!res.ok) throw new Error(`users list failed: ${res.status}`);
      const body = (await res.json()) as UsersListResponse;
      return body.data;
    },
  });
}

export function useUser(id: string | null): UseQueryResult<User> {
  const apiOrigin = useApiOrigin();
  return useQuery({
    enabled: !!id,
    queryKey: id ? userQueryKey(id) : ["users", "_disabled"],
    queryFn: async () => {
      const res = await gatewayFetch({
        apiOrigin,
        path: `/api/v1/users/${id}`,
      });
      if (!res.ok) throw new Error(`user fetch failed: ${res.status}`);
      const body = (await res.json()) as { user: User };
      return body.user;
    },
  });
}

export interface UpdateUserInput {
  id: string;
  patch: Partial<{
    email: string;
    displayName: string;
    firstName: string | null;
    lastName: string | null;
    role: UserRole;
  }>;
}

export function useUpdateUser(): UseMutationResult<User, Error, UpdateUserInput> {
  const apiOrigin = useApiOrigin();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: UpdateUserInput) => {
      const res = await gatewayFetch({
        apiOrigin,
        path: `/api/v1/users/${id}`,
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: { code?: string; message?: string };
        };
        throw new UsersError(
          body.error?.message ?? body.error?.code ?? `update failed (${res.status})`,
          body.error?.code ?? `HTTP_${res.status}`,
          res.status,
        );
      }
      const body = (await res.json()) as { user: User };
      return body.user;
    },
    onSuccess: (user) => {
      qc.invalidateQueries({ queryKey: USERS_QUERY_KEY });
      qc.setQueryData(userQueryKey(user.id), user);
    },
  });
}

export function useDeactivateUser(): UseMutationResult<void, Error, string> {
  const apiOrigin = useApiOrigin();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await gatewayFetch({
        apiOrigin,
        path: `/api/v1/users/${id}`,
        method: "DELETE",
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: { code?: string; message?: string };
        };
        throw new UsersError(
          body.error?.message ?? body.error?.code ?? `deactivate failed (${res.status})`,
          body.error?.code ?? `HTTP_${res.status}`,
          res.status,
        );
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: USERS_QUERY_KEY }),
  });
}

/**
 * Invite a user. The server endpoint does not yet exist (Phase 2.5
 * follow-up); the hook throws a typed `InviteNotImplementedError` so
 * the UI can surface a clear "not yet supported" message rather than
 * a generic network error.
 */
export class InviteNotImplementedError extends Error {
  constructor() {
    super(
      "Inviting users from the dashboard is not yet supported. " +
        "Track the gap in Phase 2.5 of the dashboard plan.",
    );
    this.name = "InviteNotImplementedError";
  }
}

export interface InviteUserInput {
  email: string;
  role: UserRole;
  displayName?: string;
}

export function useInviteUser(): UseMutationResult<
  never,
  Error,
  InviteUserInput
> {
  return useMutation<never, Error, InviteUserInput>({
    mutationFn: async () => {
      throw new InviteNotImplementedError();
    },
  });
}

export class UsersError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "UsersError";
  }
}

export { USERS_QUERY_KEY };
