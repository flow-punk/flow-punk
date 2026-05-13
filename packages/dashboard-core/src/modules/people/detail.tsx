import { useEffect, useState } from "react";
import { useNavigate, useParams } from "@tanstack/react-router";
import {
  Badge,
  Button,
  Icon,
  Input,
  KvStrip,
  Label,
  PageHeader,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  toast,
} from "@flowpunk-indie/dashboard-ui";
import {
  useDeletePerson,
  usePerson,
  useUpdatePerson,
  type Person,
} from "./hooks.js";

const CONSENT_OPTIONS: Person["consentEmail"][] = [
  "subscribed",
  "unsubscribed",
  "no_consent",
];

function emptyForm(): EditableForm {
  return {
    displayName: "",
    firstName: "",
    lastName: "",
    emailPrimary: "",
    title: "",
    phone1: "",
    accountId: "",
    consentEmail: "no_consent",
    city: "",
    country: "",
  };
}

interface EditableForm {
  displayName: string;
  firstName: string;
  lastName: string;
  emailPrimary: string;
  title: string;
  phone1: string;
  accountId: string;
  consentEmail: Person["consentEmail"];
  city: string;
  country: string;
}

function formFrom(p: Person): EditableForm {
  return {
    displayName: p.displayName,
    firstName: p.firstName ?? "",
    lastName: p.lastName ?? "",
    emailPrimary: p.emailPrimary ?? "",
    title: p.title ?? "",
    phone1: p.phone1 ?? "",
    accountId: p.accountId ?? "",
    consentEmail: p.consentEmail,
    city: p.city ?? "",
    country: p.country ?? "",
  };
}

function buildPatch(p: Person, f: EditableForm) {
  const patch: Record<string, unknown> = {};
  const setIfChanged = <K extends keyof EditableForm>(
    key: K,
    current: string | Person["consentEmail"] | null,
    treatEmptyAsNull = true,
  ) => {
    const next =
      key === "consentEmail" ? f[key] : (f[key] as string).trim();
    if (next === "" && treatEmptyAsNull) {
      if (current !== null && current !== "") patch[key] = null;
      return;
    }
    if (next !== (current ?? "")) patch[key] = next;
  };
  setIfChanged("displayName", p.displayName, false);
  setIfChanged("firstName", p.firstName);
  setIfChanged("lastName", p.lastName);
  setIfChanged("emailPrimary", p.emailPrimary);
  setIfChanged("title", p.title);
  setIfChanged("phone1", p.phone1);
  setIfChanged("accountId", p.accountId);
  if (f.consentEmail !== p.consentEmail) patch.consentEmail = f.consentEmail;
  setIfChanged("city", p.city);
  setIfChanged("country", p.country);
  return patch;
}

export function PersonDetail() {
  const params = useParams({ strict: false }) as { id?: string };
  const id = params.id ?? null;
  const navigate = useNavigate();
  const { data: person, isLoading, error } = usePerson(id);
  const update = useUpdatePerson();
  const remove = useDeletePerson();
  const [form, setForm] = useState<EditableForm>(emptyForm());
  const [showMore, setShowMore] = useState(false);

  useEffect(() => {
    if (person) setForm(formFrom(person));
  }, [person]);

  if (isLoading) {
    return (
      <div className="px-6 py-6 text-[13px] text-foreground-muted">
        Loading…
      </div>
    );
  }
  if (error || !person) {
    return (
      <div className="px-6 py-6">
        <p role="alert" className="text-[13px] text-destructive">
          {error instanceof Error ? error.message : "Person not found"}
        </p>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate({ to: "/people" as "/" })}
        >
          ← Back to people
        </Button>
      </div>
    );
  }

  const dirty = Object.keys(buildPatch(person, form)).length > 0;

  const save = async () => {
    try {
      const patch = buildPatch(person, form);
      await update.mutateAsync({ id: person.id, patch });
      toast.success("Person updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update failed");
    }
  };

  const remove_ = async () => {
    try {
      await remove.mutateAsync(person.id);
      toast.success("Person deleted");
      navigate({ to: "/people" as "/" });
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
          onClick={() => navigate({ to: "/people" as "/" })}
        >
          People
        </button>
        <Icon name="chev-r" size={12} />
        <span>{person.displayName}</span>
      </div>

      <PageHeader
        title={person.displayName}
        subtitle={
          person.emailPrimary ? (
            <a
              href={`mailto:${person.emailPrimary}`}
              className="text-accent hover:underline"
            >
              {person.emailPrimary}
            </a>
          ) : undefined
        }
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate({ to: "/people" as "/" })}
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
          { label: "ID", value: <code className="font-mono text-[12.5px]">{person.id}</code> },
          {
            label: "Status",
            value: (
              <Badge tone={person.status === "active" ? "success" : "neutral"}>
                {person.status}
              </Badge>
            ),
          },
          {
            label: "Created",
            value: new Date(person.createdAt).toLocaleDateString(),
          },
        ]}
      />

      <section className="grid gap-6 md:grid-cols-2">
        <div className="rounded-[var(--radius)] border border-border p-5">
          <h2 className="mb-4 text-[13px] font-semibold uppercase tracking-wider text-foreground-muted">
            Identity
          </h2>
          <div className="grid gap-3">
            <Field
              label="Display name"
              value={form.displayName}
              onChange={(v) => setForm({ ...form, displayName: v })}
            />
            <div className="grid grid-cols-2 gap-3">
              <Field
                label="First name"
                value={form.firstName}
                onChange={(v) => setForm({ ...form, firstName: v })}
              />
              <Field
                label="Last name"
                value={form.lastName}
                onChange={(v) => setForm({ ...form, lastName: v })}
              />
            </div>
            <Field
              label="Title"
              value={form.title}
              onChange={(v) => setForm({ ...form, title: v })}
            />
            <Field
              label="Email"
              type="email"
              value={form.emailPrimary}
              onChange={(v) => setForm({ ...form, emailPrimary: v })}
            />
            <Field
              label="Phone"
              value={form.phone1}
              onChange={(v) => setForm({ ...form, phone1: v })}
            />
            <Field
              label="Account ID"
              value={form.accountId}
              onChange={(v) => setForm({ ...form, accountId: v })}
              hint="Send an empty value to detach this person from their account."
            />
          </div>
        </div>

        <div className="rounded-[var(--radius)] border border-border p-5">
          <h2 className="mb-4 text-[13px] font-semibold uppercase tracking-wider text-foreground-muted">
            Preferences &amp; address
          </h2>
          <div className="grid gap-3">
            <div>
              <Label className="mb-1.5 block text-[12.5px] uppercase tracking-wider text-foreground-subtle">
                Email consent
              </Label>
              <Select
                value={form.consentEmail}
                onValueChange={(v) =>
                  setForm({
                    ...form,
                    consentEmail: v as Person["consentEmail"],
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CONSENT_OPTIONS.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Field
              label="City"
              value={form.city}
              onChange={(v) => setForm({ ...form, city: v })}
            />
            <Field
              label="Country"
              value={form.country}
              onChange={(v) => setForm({ ...form, country: v })}
              hint="ISO 3166-1 alpha-2, e.g. US, DE, JP."
            />
          </div>

          <button
            type="button"
            className="mt-4 text-[13px] text-accent hover:underline"
            onClick={() => setShowMore((s) => !s)}
          >
            {showMore ? "Show less" : "Show more"}
          </button>
          {showMore && (
            <dl className="mt-4 grid grid-cols-[120px_1fr] gap-y-2 text-[13px]">
              <dt className="text-foreground-subtle">Address 1</dt>
              <dd>{person.addressLine1 ?? "—"}</dd>
              <dt className="text-foreground-subtle">Address 2</dt>
              <dd>{person.addressLine2 ?? "—"}</dd>
              <dt className="text-foreground-subtle">Postal code</dt>
              <dd>{person.postalCode ?? "—"}</dd>
              <dt className="text-foreground-subtle">Region</dt>
              <dd>{person.region ?? "—"}</dd>
              <dt className="text-foreground-subtle">Timezone</dt>
              <dd>{person.timezone ?? "—"}</dd>
              <dt className="text-foreground-subtle">Language</dt>
              <dd>{person.language ?? "—"}</dd>
            </dl>
          )}
        </div>
      </section>

      <section className="rounded-[var(--radius)] border border-border p-5">
        <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-wider text-foreground-muted">
          Danger zone
        </h2>
        <div className="flex items-center justify-between gap-4">
          <p className="text-[13px] text-foreground-muted">
            Deleting a person soft-deletes their record. The row stays in the
            database for audit but is hidden from list views.
          </p>
          <Button
            variant="outline"
            onClick={remove_}
            disabled={remove.isPending || person.status !== "active"}
          >
            {remove.isPending ? "Deleting…" : "Delete person"}
          </Button>
        </div>
      </section>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  hint?: string;
}) {
  return (
    <div>
      <Label className="mb-1.5 block text-[12.5px] uppercase tracking-wider text-foreground-subtle">
        {label}
      </Label>
      <Input
        type={type ?? "text"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {hint ? (
        <p className="mt-1 text-[12px] text-foreground-subtle">{hint}</p>
      ) : null}
    </div>
  );
}
