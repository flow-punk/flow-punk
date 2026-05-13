import { useMemo, useState } from "react";
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
import { usePeople, type Person } from "./hooks.js";
import { usePersistedColumns } from "../use-persisted-columns.js";

interface PeopleColumn {
  id: string;
  label: string;
  defaultVisible?: boolean;
  render: (p: Person) => React.ReactNode;
}

function avatarInitials(p: Person): string {
  const source =
    [p.firstName, p.lastName].filter(Boolean).join(" ") || p.displayName;
  return source
    .split(/\s+/)
    .map((s) => s[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

const BUILTIN_COLUMNS: PeopleColumn[] = [
  {
    id: "name",
    label: "Name",
    render: (p) => (
      <div className="flex items-center gap-2">
        <span className="grid h-6 w-6 place-items-center rounded-full bg-background-muted text-[10px] font-medium uppercase text-foreground-muted">
          {avatarInitials(p)}
        </span>
        <span className="text-foreground">{p.displayName}</span>
      </div>
    ),
  },
  {
    id: "title",
    label: "Title",
    render: (p) =>
      p.title ? (
        <span className="text-foreground-muted">{p.title}</span>
      ) : (
        <span className="text-foreground-subtle">—</span>
      ),
  },
  {
    id: "account",
    label: "Account",
    render: (p) =>
      p.accountId ? (
        <code className="text-[12.5px] font-mono text-foreground-muted">
          {p.accountId}
        </code>
      ) : (
        <span className="text-foreground-subtle">—</span>
      ),
  },
  {
    id: "email",
    label: "Email",
    render: (p) =>
      p.emailPrimary ? (
        <span className="text-foreground-muted">{p.emailPrimary}</span>
      ) : (
        <span className="text-foreground-subtle">—</span>
      ),
  },
  {
    id: "consent",
    label: "Consent",
    defaultVisible: false,
    render: (p) => <Badge tone={consentTone(p.consentEmail)}>{p.consentEmail}</Badge>,
  },
  {
    id: "city",
    label: "Location",
    defaultVisible: false,
    render: (p) =>
      p.city || p.country ? (
        <span className="text-foreground-muted">
          {[p.city, p.country].filter(Boolean).join(", ")}
        </span>
      ) : (
        <span className="text-foreground-subtle">—</span>
      ),
  },
  {
    id: "updated",
    label: "Updated",
    render: (p) => (
      <span className="text-foreground-muted">
        {new Date(p.updatedAt).toLocaleDateString()}
      </span>
    ),
  },
];

function consentTone(c: Person["consentEmail"]): "success" | "warn" | "neutral" {
  if (c === "subscribed") return "success";
  if (c === "unsubscribed") return "warn";
  return "neutral";
}

type ConsentFilter = "all" | Person["consentEmail"];

export function PeopleList() {
  const [cursorStack, setCursorStack] = useState<string[]>([]);
  const cursor = cursorStack[cursorStack.length - 1] ?? null;
  const [search, setSearch] = useState("");
  const [consent, setConsent] = useState<ConsentFilter>("all");
  const cols = usePersistedColumns(
    "people",
    BUILTIN_COLUMNS.map((c) => c.id),
    {
      hiddenByDefault: BUILTIN_COLUMNS.filter(
        (c) => c.defaultVisible === false,
      ).map((c) => c.id),
    },
  );

  const navigate = useNavigate();
  const { data, isLoading, error } = usePeople({ cursor });

  const visibleColumns = useMemo(
    () => BUILTIN_COLUMNS.filter((c) => cols.isVisible(c.id)),
    [cols],
  );

  const rows = useMemo(() => {
    const items = data?.items ?? [];
    const q = search.trim().toLowerCase();
    return items
      .filter((p) => (consent === "all" ? true : p.consentEmail === consent))
      .filter((p) => {
        if (!q) return true;
        const hay = [
          p.displayName,
          p.firstName,
          p.lastName,
          p.emailPrimary,
          p.title,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return hay.includes(q);
      });
  }, [data?.items, search, consent]);

  const consentLabel = consent === "all" ? "All" : consent;
  const cycleConsent = () => {
    const order: ConsentFilter[] = [
      "all",
      "subscribed",
      "unsubscribed",
      "no_consent",
    ];
    const idx = order.indexOf(consent);
    setConsent(order[(idx + 1) % order.length]!);
  };

  return (
    <div className="flex flex-col gap-6 px-6 py-6">
      <PageHeader
        title="People"
        subtitle={
          data ? `${data.items.length} people on this page` : "People in your CRM."
        }
        actions={
          <Button>
            <Icon name="plus" /> New person
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
            placeholder="Search people…"
            className="h-8 pl-8"
          />
        </div>
        <ChipButton
          label={`Consent: ${consentLabel}`}
          hasValue={consent !== "all"}
          onClick={cycleConsent}
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
              {BUILTIN_COLUMNS.map((c) => (
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
          {error instanceof Error ? error.message : "Failed to load people"}
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
            {rows.map((p) => (
              <DataTableRow
                key={p.id}
                onClick={() => navigate({ to: `/people/${p.id}` as "/" })}
              >
                {visibleColumns.map((c) => (
                  <DataTableCell key={c.id}>{c.render(p)}</DataTableCell>
                ))}
                <DataTableCell align="right">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate({ to: `/people/${p.id}` as "/" });
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
            No people match.
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
