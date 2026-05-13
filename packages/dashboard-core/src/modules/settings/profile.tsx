import { useEffect, useState, type FormEvent } from "react";
import {
  Button,
  Input,
  Label,
  toast,
} from "@flowpunk-indie/dashboard-ui";
import { useSession } from "../../auth/use-session.js";
import { useUpdateUser, useUser } from "../users/hooks.js";
import { useChangePassword } from "./hooks.js";

/**
 * Profile + password panel. The display-name and (admin-only) email
 * fields are persisted through users-core's PATCH endpoint; password
 * change goes through better-auth's `/change-password`. Email is shown
 * read-only for non-admin actors because users-core only permits an
 * admin caller to change it (see users-core `SELF_ALLOWED_PATCH_FIELDS`).
 */
export function SettingsProfile() {
  const { session } = useSession();
  const sessionUser = session?.user;
  const { data: user } = useUser(sessionUser?.id ?? null);
  const update = useUpdateUser();
  const changePassword = useChangePassword();

  const isAdmin =
    sessionUser?.role === "platform-admin" ||
    sessionUser?.role === "tenant-admin";

  const [displayName, setDisplayName] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");

  useEffect(() => {
    if (!user) return;
    setDisplayName(user.displayName);
    setFirstName(user.firstName ?? "");
    setLastName(user.lastName ?? "");
    setEmail(user.email);
  }, [user]);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [revokeOthers, setRevokeOthers] = useState(true);
  const [pwError, setPwError] = useState<string | null>(null);

  const saveProfile = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const patch: Record<string, string | null> = {};
    if (displayName.trim() !== user.displayName) {
      patch.displayName = displayName.trim();
    }
    if ((firstName.trim() || null) !== user.firstName) {
      patch.firstName = firstName.trim() || null;
    }
    if ((lastName.trim() || null) !== user.lastName) {
      patch.lastName = lastName.trim() || null;
    }
    if (isAdmin && email.trim() !== user.email) {
      patch.email = email.trim();
    }
    if (Object.keys(patch).length === 0) {
      toast.success("Nothing to save");
      return;
    }
    try {
      await update.mutateAsync({ id: user.id, patch });
      toast.success("Profile updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update failed");
    }
  };

  const submitPassword = async (e: FormEvent) => {
    e.preventDefault();
    setPwError(null);
    if (newPassword.length < 8) {
      setPwError("New password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwError("New password and confirmation do not match.");
      return;
    }
    try {
      await changePassword.mutateAsync({
        currentPassword,
        newPassword,
        revokeOtherSessions: revokeOthers,
      });
      toast.success(
        revokeOthers
          ? "Password changed — other sessions revoked"
          : "Password changed",
      );
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      setPwError(
        err instanceof Error ? err.message : "Password change failed",
      );
    }
  };

  if (!user) {
    return (
      <p className="text-[13px] text-foreground-muted">Loading profile…</p>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <form
        onSubmit={saveProfile}
        className="flex flex-col gap-4 rounded-[var(--radius)] border border-border p-5"
      >
        <h2 className="text-[14px] font-semibold">Profile</h2>
        <div>
          <Label htmlFor="settings-name" className="mb-1.5 block">
            Display name
          </Label>
          <Input
            id="settings-name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            required
          />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="settings-first" className="mb-1.5 block">
              First name
            </Label>
            <Input
              id="settings-first"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="settings-last" className="mb-1.5 block">
              Last name
            </Label>
            <Input
              id="settings-last"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
            />
          </div>
        </div>
        <div>
          <Label htmlFor="settings-email" className="mb-1.5 block">
            Email{!isAdmin && " (admin-only)"}
          </Label>
          <Input
            id="settings-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={!isAdmin}
          />
        </div>
        <div className="flex justify-end">
          <Button type="submit" disabled={update.isPending}>
            {update.isPending ? "Saving…" : "Save profile"}
          </Button>
        </div>
      </form>

      <form
        onSubmit={submitPassword}
        className="flex flex-col gap-4 rounded-[var(--radius)] border border-border p-5"
      >
        <h2 className="text-[14px] font-semibold">Password</h2>
        <div>
          <Label htmlFor="settings-cur-pw" className="mb-1.5 block">
            Current password
          </Label>
          <Input
            id="settings-cur-pw"
            type="password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            required
          />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="settings-new-pw" className="mb-1.5 block">
              New password
            </Label>
            <Input
              id="settings-new-pw"
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              minLength={8}
              required
            />
          </div>
          <div>
            <Label htmlFor="settings-conf-pw" className="mb-1.5 block">
              Confirm new password
            </Label>
            <Input
              id="settings-conf-pw"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              minLength={8}
              required
            />
          </div>
        </div>
        <label className="flex items-center gap-2 text-[13px] text-foreground-muted">
          <input
            type="checkbox"
            checked={revokeOthers}
            onChange={(e) => setRevokeOthers(e.target.checked)}
          />
          Sign out other sessions after changing password
        </label>
        {pwError && (
          <p role="alert" className="text-[13px] text-destructive">
            {pwError}
          </p>
        )}
        <div className="flex justify-end">
          <Button
            type="submit"
            disabled={
              changePassword.isPending ||
              !currentPassword ||
              !newPassword ||
              !confirmPassword
            }
          >
            {changePassword.isPending ? "Updating…" : "Change password"}
          </Button>
        </div>
      </form>
    </div>
  );
}
