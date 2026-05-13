import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearch } from "@tanstack/react-router";
import {
  Badge,
  Button,
  Icon,
  Input,
  KvStrip,
  Label,
  PageHeader,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  toast,
} from "@flowpunk-indie/dashboard-ui";
import {
  useAccount,
  useDeleteAccount,
  useUpdateAccount,
  type Account,
} from "./hooks.js";
import { useSlotFillers } from "../slots.js";
import {
  ACCOUNTS_DETAIL_TABS_SLOT,
  AccountTabProvider,
} from "./tabs/context.js";

interface EditableForm {
  displayName: string;
  domain: string;
  website: string;
  industry: string;
  ownerUserId: string;
  city: string;
  country: string;
}

function emptyForm(): EditableForm {
  return {
    displayName: "",
    domain: "",
    website: "",
    industry: "",
    ownerUserId: "",
    city: "",
    country: "",
  };
}

function formFrom(a: Account): EditableForm {
  return {
    displayName: a.displayName,
    domain: a.domain ?? "",
    website: a.website ?? "",
    industry: a.industry ?? "",
    ownerUserId: a.ownerUserId ?? "",
    city: a.city ?? "",
    country: a.country ?? "",
  };
}

function buildPatch(a: Account, f: EditableForm) {
  const patch: Record<string, unknown> = {};
  const setIfChanged = (
    key: keyof EditableForm,
    current: string | null,
    treatEmptyAsNull = true,
  ) => {
    const next = f[key].trim();
    if (next === "" && treatEmptyAsNull) {
      if (current !== null && current !== "") patch[key] = null;
      return;
    }
    if (next !== (current ?? "")) patch[key] = next;
  };
  setIfChanged("displayName", a.displayName, false);
  setIfChanged("domain", a.domain);
  setIfChanged("website", a.website);
  setIfChanged("industry", a.industry);
  setIfChanged("ownerUserId", a.ownerUserId);
  setIfChanged("city", a.city);
  setIfChanged("country", a.country);
  return patch;
}

export function AccountDetail() {
  const params = useParams({ strict: false }) as { id?: string };
  const id = params.id ?? null;
  const search = useSearch({ strict: false }) as { tab?: string };
  const navigate = useNavigate();
  const { data: account, isLoading, error } = useAccount(id);
  const update = useUpdateAccount();
  const remove = useDeleteAccount();

  const tabFillers = useSlotFillers(ACCOUNTS_DETAIL_TABS_SLOT);

  // Tabs come entirely from the slot. The list is stable per
  // `useSlotFillers`, already sorted by `order`. We use each filler's
  // id as the tab value; a duplicate {slot,id} pair is rejected at
  // compose time, so ids here are guaranteed unique.
  const tabIds = useMemo(() => tabFillers.map((f) => f.id), [tabFillers]);
  const defaultTab = tabIds[0] ?? "overview";
  const activeTab =
    typeof search?.tab === "string" && tabIds.includes(search.tab)
      ? search.tab
      : defaultTab;

  const [form, setForm] = useState<EditableForm>(emptyForm());
  useEffect(() => {
    if (account) setForm(formFrom(account));
  }, [account]);

  if (isLoading) {
    return (
      <div className="px-6 py-6 text-[13px] text-foreground-muted">
        Loading…
      </div>
    );
  }
  if (error || !account) {
    return (
      <div className="px-6 py-6">
        <p role="alert" className="text-[13px] text-destructive">
          {error instanceof Error ? error.message : "Account not found"}
        </p>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate({ to: "/accounts" as "/" })}
        >
          ← Back to accounts
        </Button>
      </div>
    );
  }

  const dirty = Object.keys(buildPatch(account, form)).length > 0;

  const save = async () => {
    try {
      const patch = buildPatch(account, form);
      await update.mutateAsync({ id: account.id, patch });
      toast.success("Account updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update failed");
    }
  };

  const remove_ = async () => {
    try {
      await remove.mutateAsync(account.id);
      toast.success("Account deleted");
      navigate({ to: "/accounts" as "/" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    }
  };

  return (
    <div className="flex flex-col gap-6 px-6 py-6">
      <div className="flex items-center gap-2 text-[13px] text-foreground-muted">
        <button
          type="button"
          className="hover:text-foreground"
          onClick={() => navigate({ to: "/accounts" as "/" })}
        >
          Accounts
        </button>
        <Icon name="chev-r" size={12} />
        <span>{account.displayName}</span>
      </div>

      <PageHeader
        title={account.displayName}
        subtitle={account.domain ?? account.website ?? undefined}
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate({ to: "/accounts" as "/" })}
            >
              <Icon name="arrow-r" className="rotate-180" /> Back
            </Button>
            <Button onClick={save} disabled={!dirty || update.isPending}>
              {update.isPending ? "Saving…" : "Save changes"}
            </Button>
          </>
        }
      />

      <KvStrip
        items={[
          { label: "ID", value: <code className="font-mono text-[12.5px]">{account.id}</code> },
          {
            label: "Status",
            value: (
              <Badge tone={account.status === "active" ? "success" : "neutral"}>
                {account.status}
              </Badge>
            ),
          },
          {
            label: "Created",
            value: new Date(account.createdAt).toLocaleDateString(),
          },
        ]}
      />

      <section className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <div className="rounded-[var(--radius)] border border-border p-5">
          <h2 className="mb-4 text-[13px] font-semibold uppercase tracking-wider text-foreground-muted">
            Details
          </h2>
          <div className="grid gap-3">
            <Field
              label="Display name"
              value={form.displayName}
              onChange={(v) => setForm({ ...form, displayName: v })}
            />
            <Field
              label="Domain"
              value={form.domain}
              onChange={(v) => setForm({ ...form, domain: v })}
              hint="Lowercase, DNS-shaped. Empty clears."
            />
            <Field
              label="Website"
              value={form.website}
              onChange={(v) => setForm({ ...form, website: v })}
              hint="Must start with http(s)://"
            />
            <Field
              label="Industry"
              value={form.industry}
              onChange={(v) => setForm({ ...form, industry: v })}
            />
            <Field
              label="Owner user id"
              value={form.ownerUserId}
              onChange={(v) => setForm({ ...form, ownerUserId: v })}
            />
            <div className="grid grid-cols-2 gap-3">
              <Field
                label="City"
                value={form.city}
                onChange={(v) => setForm({ ...form, city: v })}
              />
              <Field
                label="Country"
                value={form.country}
                onChange={(v) => setForm({ ...form, country: v })}
              />
            </div>
          </div>
        </div>

        <div className="rounded-[var(--radius)] border border-border p-5">
          {tabFillers.length === 0 ? (
            <p className="text-[13px] text-foreground-muted">
              No tabs are registered for this account.
            </p>
          ) : (
            <AccountTabProvider accountId={account.id}>
              <Tabs
                value={activeTab}
                onValueChange={(v) =>
                  navigate({
                    to: `/accounts/${account.id}` as "/",
                    search: { tab: v } as never,
                  })
                }
              >
                <TabsList>
                  {tabFillers.map((f) => (
                    <TabsTrigger key={f.id} value={f.id}>
                      {tabLabel(f.id)}
                    </TabsTrigger>
                  ))}
                </TabsList>
                {tabFillers.map((f) => {
                  const Comp = f.component as React.ComponentType;
                  return (
                    <TabsContent key={f.id} value={f.id}>
                      <Comp />
                    </TabsContent>
                  );
                })}
              </Tabs>
            </AccountTabProvider>
          )}
        </div>
      </section>

      <section className="rounded-[var(--radius)] border border-border p-5">
        <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-wider text-foreground-muted">
          Danger zone
        </h2>
        <div className="flex items-center justify-between gap-4">
          <p className="text-[13px] text-foreground-muted">
            Deleting an account soft-deletes the record. Linked persons keep
            their pointer per the contacts service contract — there is no
            cascade.
          </p>
          <Button
            variant="outline"
            onClick={remove_}
            disabled={remove.isPending || account.status !== "active"}
          >
            {remove.isPending ? "Deleting…" : "Delete account"}
          </Button>
        </div>
      </section>
    </div>
  );
}

function tabLabel(id: string): string {
  return id.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function Field({
  label,
  value,
  onChange,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
}) {
  return (
    <div>
      <Label className="mb-1.5 block text-[12.5px] uppercase tracking-wider text-foreground-subtle">
        {label}
      </Label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} />
      {hint ? (
        <p className="mt-1 text-[12px] text-foreground-subtle">{hint}</p>
      ) : null}
    </div>
  );
}
