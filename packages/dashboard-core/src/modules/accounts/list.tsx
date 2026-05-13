import { useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  Badge,
  Button,
  ChipButton,
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeadCell,
  DataTableHeadRow,
  DataTableRow,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Icon,
  Input,
  PageHeader,
  Toolbar,
} from "@flowpunk-indie/dashboard-ui";
import { useAccounts, type Account } from "./hooks.js";
import { usePersistedColumns } from "../use-persisted-columns.js";
import { useSlotFillers } from "../slots.js";
import { ACCOUNTS_LIST_COLUMNS_SLOT, type AccountsListColumn } from "./columns-slot.js";

interface BuiltinColumn {
  id: string;
  label: string;
  defaultVisible?: boolean;
  render: (a: Account) => ReactNode;
}

const BUILTIN_COLUMNS: BuiltinColumn[] = [
  {
    id: "name",
    label: "Name",
    render: (a) => <span className="text-foreground">{a.displayName}</span>,
  },
  {
    id: "domain",
    label: "Domain",
    render: (a) =>
      a.domain ? (
        <span className="text-foreground-muted">{a.domain}</span>
      ) : (
        <span className="text-foreground-subtle">—</span>
      ),
  },
  {
    id: "industry",
    label: "Industry",
    render: (a) =>
      a.industry ? (
        <span className="text-foreground-muted">{a.industry}</span>
      ) : (
        <span className="text-foreground-subtle">—</span>
      ),
  },
  {
    id: "owner",
    label: "Owner",
    render: (a) =>
      a.ownerUserId ? (
        <code className="text-[12.5px] font-mono text-foreground-muted">
          {a.ownerUserId}
        </code>
      ) : (
        <span className="text-foreground-subtle">—</span>
      ),
  },
  {
    id: "status",
    label: "Status",
    render: (a) => (
      <Badge tone={a.status === "active" ? "success" : "neutral"}>
        {a.status}
      </Badge>
    ),
  },
  {
    id: "city",
    label: "Location",
    defaultVisible: false,
    render: (a) =>
      a.city || a.country ? (
        <span className="text-foreground-muted">
          {[a.city, a.country].filter(Boolean).join(", ")}
        </span>
      ) : (
        <span className="text-foreground-subtle">—</span>
      ),
  },
  {
    id: "updated",
    label: "Updated",
    render: (a) => (
      <span className="text-foreground-muted">
        {new Date(a.updatedAt).toLocaleDateString()}
      </span>
    ),
  },
];

type StatusFilter = "all" | Account["status"];

export function AccountsList() {
  const [cursorStack, setCursorStack] = useState<string[]>([]);
  const cursor = cursorStack[cursorStack.length - 1] ?? null;
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const navigate = useNavigate();
  const { data, isLoading, error } = useAccounts({ cursor });

  // Slot-driven extension columns appended after built-ins.
  const extensionFillers = useSlotFillers(ACCOUNTS_LIST_COLUMNS_SLOT);
  const extensionColumns = useMemo<AccountsListColumn[]>(() => {
    const out: AccountsListColumn[] = [];
    for (const f of extensionFillers) {
      // Each column-slot filler's component is the descriptor factory.
      // Calling it with `null` would be wrong; per the slot contract
      // (documented on the SlotDefinition) fillers expose a static
      // descriptor on the component. To keep the slot shape uniform we
      // accept a component that returns the descriptor via a static
      // property, OR a render function that the filler defines on its
      // module side. To keep this v1 simple, we rely on the documented
      // shape: each filler's `component` is the cell renderer and its
      // `id` is the column id; the label is derived from id (Title
      // Case) unless the module provides one via a colon suffix
      // (`billing:Billing`).
      const [rawId, rawLabel] = f.id.split(":", 2);
      out.push({
        id: rawId ?? f.id,
        label: rawLabel ?? toTitle(rawId ?? f.id),
        defaultVisible: true,
        render: (a) => {
          const Cell = f.component as React.ComponentType<{ account: Account }>;
          return <Cell account={a} />;
        },
      });
    }
    return out;
  }, [extensionFillers]);

  const allColumns: BuiltinColumn[] = useMemo(
    () => [...BUILTIN_COLUMNS, ...extensionColumns],
    [extensionColumns],
  );

  const cols = usePersistedColumns(
    "accounts",
    allColumns.map((c) => c.id),
    {
      hiddenByDefault: allColumns
        .filter((c) => c.defaultVisible === false)
        .map((c) => c.id),
    },
  );

  const visibleColumns = useMemo(
    () => allColumns.filter((c) => cols.isVisible(c.id)),
    [allColumns, cols],
  );

  const rows = useMemo(() => {
    const items = data?.items ?? [];
    const q = search.trim().toLowerCase();
    return items
      .filter((a) => (status === "all" ? true : a.status === status))
      .filter((a) => {
        if (!q) return true;
        const hay = [a.displayName, a.domain, a.industry, a.city, a.country]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return hay.includes(q);
      });
  }, [data?.items, search, status]);

  return (
    <div className="flex flex-col gap-6 px-6 py-6">
      <PageHeader
        title="Accounts"
        subtitle={
          data
            ? `${data.items.length} accounts on this page`
            : "Companies in your CRM."
        }
        actions={
          <Button>
            <Icon name="plus" /> New account
          </Button>
        }
      />

      <Toolbar>
        <div className="relative flex w-72 items-center">
          <Icon
            name="search"
            className="pointer-events-none absolute left-2.5 text-foreground-subtle"
          />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search accounts…"
            className="h-8 pl-8"
          />
        </div>
        <ChipButton
          label={`Status: ${status === "all" ? "All" : status}`}
          hasValue={status !== "all"}
          onClick={() =>
            setStatus(
              status === "all"
                ? "active"
                : status === "active"
                  ? "deleted"
                  : "all",
            )
          }
        />
        <div className="ml-auto">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <Icon name="sliders" /> Columns
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>Toggle columns</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {allColumns.map((c) => (
                <DropdownMenuItem
                  key={c.id}
                  onSelect={(e) => {
                    e.preventDefault();
                    cols.toggle(c.id);
                  }}
                >
                  <span className="mr-2 inline-block w-3 text-center">
                    {cols.isVisible(c.id) ? "✓" : ""}
                  </span>
                  {c.label}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={(e) => {
                  e.preventDefault();
                  cols.reset();
                }}
              >
                Reset to defaults
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </Toolbar>

      {error && (
        <p role="alert" className="text-[13px] text-destructive">
          {error instanceof Error ? error.message : "Failed to load accounts"}
        </p>
      )}

      <div className="rounded-[var(--radius)] border border-border">
        <DataTable>
          <DataTableHead>
            <DataTableHeadRow>
              {visibleColumns.map((c) => (
                <DataTableHeadCell key={c.id}>{c.label}</DataTableHeadCell>
              ))}
              <DataTableHeadCell align="right" />
            </DataTableHeadRow>
          </DataTableHead>
          <DataTableBody>
            {rows.map((a) => (
              <DataTableRow
                key={a.id}
                onClick={() => navigate({ to: `/accounts/${a.id}` as "/" })}
              >
                {visibleColumns.map((c) => (
                  <DataTableCell key={c.id}>{c.render(a)}</DataTableCell>
                ))}
                <DataTableCell align="right">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate({ to: `/accounts/${a.id}` as "/" });
                    }}
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
        {!isLoading && rows.length === 0 && (
          <p className="px-3 py-3 text-[13px] text-foreground-muted">
            No accounts match.
          </p>
        )}
      </div>

      <div className="flex items-center justify-end gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={cursorStack.length === 0}
          onClick={() => setCursorStack((s) => s.slice(0, -1))}
        >
          Previous
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={!data?.nextCursor}
          onClick={() =>
            data?.nextCursor &&
            setCursorStack((s) => [...s, data.nextCursor as string])
          }
        >
          Next
        </Button>
      </div>
    </div>
  );
}

function toTitle(s: string): string {
  return s.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
