import { useMemo, useState } from "react";
import { useParams, useNavigate } from "@tanstack/react-router";
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Icon,
  Input,
  Label,
  PageHeader,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  toast,
} from "@flowpunk-indie/dashboard-ui";
import {
  useDeactivateUser,
  useUpdateUser,
  useUser,
  useUsers,
  type UserRole,
} from "./hooks.js";

const ROLE_OPTIONS: UserRole[] = ["owner", "admin", "member", "readonly"];

export interface UserDetailProps {
  enforceSingleOwner: boolean;
}

export function UserDetail({ enforceSingleOwner }: UserDetailProps) {
  const params = useParams({ strict: false }) as { id?: string };
  const id = params.id ?? null;
  const navigate = useNavigate();
  const { data: user, isLoading, error } = useUser(id);
  const { data: allUsers } = useUsers();
  const update = useUpdateUser();
  const deactivate = useDeactivateUser();
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [editing, setEditing] = useState(false);

  const activeOwnerCount = useMemo(() => {
    return (allUsers ?? []).filter(
      (u) => u.status === "active" && u.role === "owner",
    ).length;
  }, [allUsers]);

  const isOnlyOwner =
    enforceSingleOwner &&
    user?.role === "owner" &&
    activeOwnerCount <= 1;

  if (isLoading) {
    return (
      <div className="px-6 py-6 text-[13px] text-foreground-muted">
        Loading…
      </div>
    );
  }
  if (error || !user) {
    return (
      <div className="px-6 py-6">
        <p role="alert" className="text-[13px] text-destructive">
          {error instanceof Error ? error.message : "User not found"}
        </p>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate({ to: "/users" as "/" })}
        >
          ← Back to users
        </Button>
      </div>
    );
  }

  const startEdit = () => {
    setDisplayName(user.displayName);
    setEditing(true);
  };

  const saveName = async () => {
    if (!displayName.trim()) return;
    try {
      await update.mutateAsync({
        id: user.id,
        patch: { displayName: displayName.trim() },
      });
      toast.success("Profile updated");
      setEditing(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update failed");
    }
  };

  const setRole = async (role: UserRole) => {
    if (role === user.role) return;
    try {
      await update.mutateAsync({ id: user.id, patch: { role } });
      toast.success(`Role changed to ${role}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Role change failed");
    }
  };

  const roleControl = (
    <Select
      value={user.role}
      onValueChange={(v) => setRole(v as UserRole)}
      disabled={isOnlyOwner || update.isPending}
    >
      <SelectTrigger className="w-40">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {ROLE_OPTIONS.map((r) => (
          <SelectItem key={r} value={r}>
            <span className="capitalize">{r}</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  return (
    <div className="flex flex-col gap-6 px-6 py-6">
      <PageHeader
        title={user.displayName}
        subtitle={user.email}
        actions={
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate({ to: "/users" as "/" })}
          >
            <Icon name="arrow-r" className="rotate-180" /> Back
          </Button>
        }
      />

      <section className="rounded-[var(--radius)] border border-border p-5">
        <h2 className="text-[13px] font-semibold uppercase tracking-wider text-foreground-muted">
          Profile
        </h2>
        <div className="mt-3 flex items-end gap-3">
          {editing ? (
            <>
              <div className="flex-1">
                <Label htmlFor="user-name" className="mb-1.5 block">
                  Display name
                </Label>
                <Input
                  id="user-name"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                />
              </div>
              <Button onClick={saveName} disabled={update.isPending}>
                {update.isPending ? "Saving…" : "Save"}
              </Button>
              <Button
                variant="ghost"
                onClick={() => setEditing(false)}
                disabled={update.isPending}
              >
                Cancel
              </Button>
            </>
          ) : (
            <>
              <div className="flex-1">
                <p className="text-[12.5px] uppercase tracking-wider text-foreground-subtle">
                  Display name
                </p>
                <p className="text-[15px]">{user.displayName}</p>
              </div>
              <Button variant="ghost" size="sm" onClick={startEdit}>
                <Icon name="edit" /> Edit
              </Button>
            </>
          )}
        </div>
      </section>

      <section className="rounded-[var(--radius)] border border-border p-5">
        <h2 className="text-[13px] font-semibold uppercase tracking-wider text-foreground-muted">
          Access
        </h2>
        <div className="mt-3 flex items-center justify-between gap-4">
          <div>
            <p className="text-[12.5px] uppercase tracking-wider text-foreground-subtle">
              Role
            </p>
            {isOnlyOwner ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>{roleControl}</span>
                </TooltipTrigger>
                <TooltipContent>
                  Promote another user to owner before changing this role —
                  exactly one active owner is allowed.
                </TooltipContent>
              </Tooltip>
            ) : (
              roleControl
            )}
          </div>
          <div>
            <p className="text-[12.5px] uppercase tracking-wider text-foreground-subtle">
              Status
            </p>
            <Badge tone={user.status === "active" ? "success" : "neutral"}>
              {user.status === "active" ? "Active" : "Deactivated"}
            </Badge>
          </div>
        </div>
      </section>

      <section className="rounded-[var(--radius)] border border-border p-5">
        <h2 className="text-[13px] font-semibold uppercase tracking-wider text-foreground-muted">
          Danger zone
        </h2>
        <div className="mt-3 flex items-center justify-between gap-4">
          <p className="text-[13px] text-foreground-muted">
            Deactivating a user revokes their session and prevents new sign-ins.
            Their owned data is preserved.
          </p>
          <Button
            variant="outline"
            onClick={() => setConfirmDeactivate(true)}
            disabled={user.status !== "active" || isOnlyOwner}
          >
            Deactivate
          </Button>
        </div>
      </section>

      <Dialog
        open={confirmDeactivate}
        onOpenChange={(o) => setConfirmDeactivate(o)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Deactivate user</DialogTitle>
            <DialogDescription>
              {user.displayName} will be signed out and unable to access the
              workspace.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setConfirmDeactivate(false)}
              disabled={deactivate.isPending}
            >
              Cancel
            </Button>
            <Button
              disabled={deactivate.isPending}
              onClick={async () => {
                try {
                  await deactivate.mutateAsync(user.id);
                  toast.success("User deactivated");
                  setConfirmDeactivate(false);
                  navigate({ to: "/users" as "/" });
                } catch (err) {
                  toast.error(
                    err instanceof Error ? err.message : "Deactivate failed",
                  );
                }
              }}
            >
              {deactivate.isPending ? "Deactivating…" : "Deactivate user"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
