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
  toast,
} from "@flowpunk-indie/dashboard-ui";
import {
  useActiveSessions,
  useRevokeSession,
  useSignOutEverywhere,
} from "./hooks.js";

function relativeOrDate(value: string | null | undefined): string {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

function describeUserAgent(ua: string | null | undefined): string {
  if (!ua) return "Unknown device";
  if (/iPhone|iPad|iPod/.test(ua)) return "iOS device";
  if (/Android/.test(ua)) return "Android device";
  if (/Macintosh/.test(ua)) return "Mac";
  if (/Windows/.test(ua)) return "Windows";
  if (/Linux/.test(ua)) return "Linux";
  return ua.slice(0, 80);
}

export function SettingsSecurity() {
  const { query, tokenFor } = useActiveSessions();
  const { data: sessions, isLoading, error } = query;
  const revoke = useRevokeSession();
  const signOutEverywhere = useSignOutEverywhere();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between rounded-[var(--radius)] border border-border p-5">
        <div>
          <h2 className="text-[14px] font-semibold">Active sessions</h2>
          <p className="mt-1 text-[13px] text-foreground-muted">
            Every browser or device currently signed in with your account.
            Revoke any session you don't recognize.
          </p>
        </div>
        <Button
          variant="outline"
          disabled={signOutEverywhere.isPending}
          onClick={async () => {
            try {
              await signOutEverywhere.mutateAsync();
              toast.success("Other sessions signed out");
            } catch (err) {
              toast.error(
                err instanceof Error ? err.message : "Sign-out failed",
              );
            }
          }}
        >
          {signOutEverywhere.isPending
            ? "Signing out…"
            : "Sign out everywhere"}
        </Button>
      </div>

      {error && (
        <p role="alert" className="text-[13px] text-destructive">
          {error instanceof Error ? error.message : "Failed to load sessions"}
        </p>
      )}

      <div className="rounded-[var(--radius)] border border-border">
        <DataTable>
          <DataTableHead>
            <DataTableHeadRow>
              <DataTableHeadCell>Device</DataTableHeadCell>
              <DataTableHeadCell>IP</DataTableHeadCell>
              <DataTableHeadCell>Last active</DataTableHeadCell>
              <DataTableHeadCell>Expires</DataTableHeadCell>
              <DataTableHeadCell align="right" />
            </DataTableHeadRow>
          </DataTableHead>
          <DataTableBody>
            {(sessions ?? []).map((s) => (
              <DataTableRow key={s.id}>
                <DataTableCell>
                  <div className="flex items-center gap-2">
                    <span>{describeUserAgent(s.userAgent)}</span>
                    <Badge tone="neutral">{s.id.slice(0, 6)}</Badge>
                  </div>
                </DataTableCell>
                <DataTableCell>
                  <span className="text-foreground-muted">
                    {s.ipAddress ?? "—"}
                  </span>
                </DataTableCell>
                <DataTableCell>{relativeOrDate(s.updatedAt)}</DataTableCell>
                <DataTableCell>{relativeOrDate(s.expiresAt)}</DataTableCell>
                <DataTableCell align="right">
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={revoke.isPending}
                    onClick={async () => {
                      const token = tokenFor(s.id);
                      if (!token) {
                        toast.error("Session token not available — reload and try again.");
                        return;
                      }
                      try {
                        await revoke.revoke(token);
                        toast.success("Session revoked");
                      } catch (err) {
                        toast.error(
                          err instanceof Error
                            ? err.message
                            : "Revoke failed",
                        );
                      }
                    }}
                  >
                    Revoke
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
        {!isLoading && (sessions ?? []).length === 0 && (
          <p className="px-3 py-3 text-[13px] text-foreground-muted">
            No active sessions.
          </p>
        )}
      </div>
    </div>
  );
}
