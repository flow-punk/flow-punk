import type { DashboardModule } from "../types.js";
import { Icon } from "@flowpunk-indie/dashboard-ui";
import { UsersList } from "./list.js";
import { UserDetail } from "./detail.js";

export interface MakeUsersModuleOptions {
  /**
   * When true, the UI mirrors users-core's `enforceSingleOwner: true`
   * contract: the active owner's role control is disabled with a
   * tooltip. The server is still authoritative; this is a usability
   * hint only.
   *
   * Indie passes `true`. Managed's multi-seat replacement passes `false`
   * (and is wired through `dashboard-extensions.replace.users`).
   */
  enforceSingleOwner: boolean;
  /**
   * When true, surface an "Invite" CTA on the list view. Indie passes
   * `false` because the server endpoint does not exist yet (the
   * `useInviteUser` mutation throws `InviteNotImplementedError`).
   * Managed multi-seat passes `true`.
   */
  showInvite?: boolean;
}

/**
 * Build the users module. The shape is parameterized at construction
 * time (per ADR-011 — no runtime edition branching). Indie's wrapper
 * passes `{ enforceSingleOwner: true, showInvite: false }`; managed's
 * multi-seat variant replaces this module entirely via
 * `resolveTenantExtensions.replace.users`.
 */
export function makeUsersModule(
  options: MakeUsersModuleOptions,
): DashboardModule {
  const enforceSingleOwner = options.enforceSingleOwner;
  const showInvite = options.showInvite ?? false;
  return {
    id: "users",
    nav: [
      {
        id: "workspace.users",
        label: "Workspace",
        items: [
          {
            id: "users",
            label: "Users",
            to: "/users",
            icon: ({ className }) => (
              <Icon name="users" className={className} />
            ),
          },
        ],
      },
    ],
    routes: [
      {
        path: "/users",
        component: () => (
          <UsersList
            enforceSingleOwner={enforceSingleOwner}
            showInvite={showInvite}
          />
        ),
      },
      {
        path: "/users/$id",
        component: () => (
          <UserDetail enforceSingleOwner={enforceSingleOwner} />
        ),
      },
    ],
  };
}

export { UsersList } from "./list.js";
export { UserDetail } from "./detail.js";
export {
  useUsers,
  useUser,
  useUpdateUser,
  useDeactivateUser,
  useInviteUser,
  InviteNotImplementedError,
  UsersError,
  USERS_QUERY_KEY,
  type User,
  type UserRole,
  type UserStatus,
  type UpdateUserInput,
  type InviteUserInput,
} from "./hooks.js";
