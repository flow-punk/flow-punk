import { useState } from "react";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Icon,
  PageHeader,
} from "@flowpunk-indie/dashboard-ui";
import {
  useApiKeys,
  useRevokeApiKey,
  type ApiKey,
} from "./hooks.js";
import { CreateApiKeyDialog } from "./create-dialog.js";

function formatDate(value: string | null): string {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleDateString();
  } catch {
    return value;
  }
}

function keyStatus(k: ApiKey): {
  label: string;
  tone: "success" | "warn" | "neutral";
} {
  if (k.revokedAt) return { label: "Revoked", tone: "neutral" };
  if (k.expiresAt && Date.parse(k.expiresAt) < Date.now()) {
    return { label: "Expired", tone: "warn" };
  }
  return { label: "Active", tone: "success" };
}

export function ApiKeysList() {
  const { data, isLoading, error } = useApiKeys();
  const revoke = useRevokeApiKey();
  const [createOpen, setCreateOpen] = useState(false);
  const [rotateOf, setRotateOf] = useState<ApiKey | null>(null);
  const [revokeOf, setRevokeOf] = useState<ApiKey | null>(null);

  const keys = (data ?? []).filter((k) => !k.revokedAt);

  return (
    <div className="flex flex-col gap-6 px-6 py-6">
      <PageHeader
        title="API keys"
        subtitle="Programmatic credentials for the gateway. The secret is shown exactly once at creation time."
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Icon name="plus" /> New key
          </Button>
        }
      />

      {error && (
        <p role="alert" className="text-[13px] text-destructive">
          {error instanceof Error ? error.message : "Failed to load keys"}
        </p>
      )}

      <div className="rounded-[var(--radius)] border border-border">
        <DataTable>
          <DataTableHead>
            <DataTableHeadRow>
              <DataTableHeadCell>Label</DataTableHeadCell>
              <DataTableHeadCell>Prefix</DataTableHeadCell>
              <DataTableHeadCell>Scopes</DataTableHeadCell>
              <DataTableHeadCell>Last used</DataTableHeadCell>
              <DataTableHeadCell>Created</DataTableHeadCell>
              <DataTableHeadCell>Status</DataTableHeadCell>
              <DataTableHeadCell align="right" />
            </DataTableHeadRow>
          </DataTableHead>
          <DataTableBody>
            {keys.map((k) => {
              const status = keyStatus(k);
              return (
                <DataTableRow key={k.id}>
                  <DataTableCell>{k.label}</DataTableCell>
                  <DataTableCell>
                    <code className="text-[12.5px] font-mono">{k.prefix}…</code>
                  </DataTableCell>
                  <DataTableCell>
                    {k.scopes.length === 0 ? (
                      <span className="text-foreground-subtle">—</span>
                    ) : (
                      <span className="text-[12.5px]">{k.scopes.join(", ")}</span>
                    )}
                  </DataTableCell>
                  <DataTableCell>{formatDate(k.lastUsedAt)}</DataTableCell>
                  <DataTableCell>{formatDate(k.createdAt)}</DataTableCell>
                  <DataTableCell>
                    <Badge tone={status.tone}>{status.label}</Badge>
                  </DataTableCell>
                  <DataTableCell align="right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" aria-label="Key actions">
                          <Icon name="more" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => setRotateOf(k)}>
                          Rotate
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setRevokeOf(k)}>
                          Revoke
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </DataTableCell>
                </DataTableRow>
              );
            })}
          </DataTableBody>
        </DataTable>
        {isLoading && (
          <p className="px-3 py-3 text-[13px] text-foreground-muted">
            Loading…
          </p>
        )}
        {!isLoading && keys.length === 0 && (
          <p className="px-3 py-3 text-[13px] text-foreground-muted">
            No active keys yet.
          </p>
        )}
      </div>

      <CreateApiKeyDialog
        open={createOpen || !!rotateOf}
        onOpenChange={(o) => {
          if (!o) {
            setCreateOpen(false);
            setRotateOf(null);
          }
        }}
        rotateOf={rotateOf ?? undefined}
      />

      <Dialog
        open={!!revokeOf}
        onOpenChange={(o) => {
          if (!o) setRevokeOf(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Revoke API key</DialogTitle>
            <DialogDescription>
              {revokeOf
                ? `"${revokeOf.label}" will stop working immediately. Any service using it must rotate to a new key.`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setRevokeOf(null)}
              disabled={revoke.isPending}
            >
              Cancel
            </Button>
            <Button
              variant="default"
              disabled={revoke.isPending}
              onClick={async () => {
                if (!revokeOf) return;
                await revoke.mutateAsync(revokeOf.id);
                setRevokeOf(null);
              }}
            >
              {revoke.isPending ? "Revoking…" : "Revoke key"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
