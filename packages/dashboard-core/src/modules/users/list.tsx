import {
  Badge,
  Button,
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeadCell,
  DataTableHeadRow,
  DataTableRow,
  Icon,
  PageHeader,
  toast,
} from "@flowpunk-indie/dashboard-ui";
import { useUsers, useInviteUser, type User } from "./hooks.js";
import { useNavigate } from "@tanstack/react-router";

export interface UsersListProps {
  /**
   * When true, the active-owner row's role control is rendered as
   * disabled with a tooltip. The server is authoritative — this mirror
   * exists only to keep the UI from suggesting an action that will
   * 409 back. Set by indie's wrapper; managed multi-seat variant flips
   * it off.
   */
  enforceSingleOwner: boolean;
  /**
   * When true, surfaces an "Invite" CTA. Indie hides it because the
   * server has no invite endpoint yet (see `InviteNotImplementedError`).
   * Managed's multi-seat variant turns it on.
   */
  showInvite: boolean;
}

function statusTone(u: User): "success" | "neutral" {
  return u.status === "active" ? "success" : "neutral";
}

export function UsersList({ enforceSingleOwner: _, showInvite }: UsersListProps) {
  const { data, isLoading, error } = useUsers();
  const invite = useInviteUser();
  const navigate = useNavigate();
  const users = data ?? [];

  return (
    <div className="flex flex-col gap-6 px-6 py-6">
      <PageHeader
        title="Users"
        subtitle="People with access to this workspace."
        actions={
          showInvite ? (
            <Button
              onClick={() =>
                invite
                  .mutateAsync({ email: "", role: "member" })
                  .catch((err) => {
                    toast.error(
                      err instanceof Error
                        ? err.message
                        : "Invite not yet supported",
                    );
                  })
              }
            >
              <Icon name="plus" /> Invite user
            </Button>
          ) : undefined
        }
      />

      {error && (
        <p role="alert" className="text-[13px] text-destructive">
          {error instanceof Error ? error.message : "Failed to load users"}
        </p>
      )}

      <div className="rounded-[var(--radius)] border border-border">
        <DataTable>
          <DataTableHead>
            <DataTableHeadRow>
              <DataTableHeadCell>Name</DataTableHeadCell>
              <DataTableHeadCell>Email</DataTableHeadCell>
              <DataTableHeadCell>Role</DataTableHeadCell>
              <DataTableHeadCell>Status</DataTableHeadCell>
              <DataTableHeadCell>Last login</DataTableHeadCell>
              <DataTableHeadCell align="right" />
            </DataTableHeadRow>
          </DataTableHead>
          <DataTableBody>
            {users.map((u) => (
              <DataTableRow key={u.id}>
                <DataTableCell>{u.displayName}</DataTableCell>
                <DataTableCell>
                  <span className="text-foreground-muted">{u.email}</span>
                </DataTableCell>
                <DataTableCell>
                  <span className="capitalize">{u.role}</span>
                </DataTableCell>
                <DataTableCell>
                  <Badge tone={statusTone(u)}>
                    {u.status === "active" ? "Active" : "Deactivated"}
                  </Badge>
                </DataTableCell>
                <DataTableCell>
                  {u.lastLoginAt
                    ? new Date(u.lastLoginAt).toLocaleDateString()
                    : "—"}
                </DataTableCell>
                <DataTableCell align="right">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => navigate({ to: `/users/${u.id}` as "/" })}
                  >
                    Open
                  </Button>
                </DataTableCell>
              </DataTableRow>
            ))}
          </DataTableBody>
        </DataTable>
        {isLoading && (
          <p className="px-3 py-3 text-[13px] text-foreground-muted">
            Loading…
          </p>
        )}
        {!isLoading && users.length === 0 && (
          <p className="px-3 py-3 text-[13px] text-foreground-muted">
            No users yet.
          </p>
        )}
      </div>
    </div>
  );
}
