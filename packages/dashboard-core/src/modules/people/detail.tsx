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
  type EmailConsent,
  type Person,
  type UpdatePersonInput,
} from "./hooks.js";

const CONSENT_OPTIONS: EmailConsent[] = [
  "subscribed",
  "unsubscribed",
  "no_consent",
];

/**
 * Editable shape mirrors the column names from
 * `indie/packages/db/src/schema/persons.ts` (and its
 * `ALLOWED_PATCH_FIELDS` whitelist). Address fields use `streetLine1/2`
 * — there is no `addressLine*` on the schema. Phone is split into
 * country code / number / extension per the canonical columns.
 *
 * `consentEmail` is NOT nullable; the form keeps it as a non-empty
 * value at all times. To "clear" consent the user picks `no_consent`
 * (the schema default).
 */
interface EditableForm {
  displayName: string;
  firstName: string;
  lastName: string;
  emailPrimary: string;
  title: string;
  phone1CountryCode: string;
  phone1Number: string;
  phone1Ext: string;
  accountId: string;
  consentEmail: EmailConsent;
  streetLine1: string;
  streetLine2: string;
  city: string;
  region: string;
  postalCode: string;
  country: string;
}

function emptyForm(): EditableForm {
  return {
    displayName: "",
    firstName: "",
    lastName: "",
    emailPrimary: "",
    title: "",
    phone1CountryCode: "",
    phone1Number: "",
    phone1Ext: "",
    accountId: "",
    consentEmail: "no_consent",
    streetLine1: "",
    streetLine2: "",
    city: "",
    region: "",
    postalCode: "",
    country: "",
  };
}

function formFrom(p: Person): EditableForm {
  return {
    displayName: p.displayName,
    firstName: p.firstName ?? "",
    lastName: p.lastName ?? "",
    emailPrimary: p.emailPrimary ?? "",
    title: p.title ?? "",
    phone1CountryCode: p.phone1CountryCode ?? "",
    phone1Number: p.phone1Number ?? "",
    phone1Ext: p.phone1Ext ?? "",
    accountId: p.accountId ?? "",
    consentEmail: p.consentEmail,
    streetLine1: p.streetLine1 ?? "",
    streetLine2: p.streetLine2 ?? "",
    city: p.city ?? "",
    region: p.region ?? "",
    postalCode: p.postalCode ?? "",
    country: p.country ?? "",
  };
}

/** PATCH columns that are nullable on the schema (empty = explicit null). */
const NULLABLE_PATCH_FIELDS = [
  "firstName",
  "lastName",
  "emailPrimary",
  "title",
  "phone1CountryCode",
  "phone1Number",
  "phone1Ext",
  "accountId",
  "streetLine1",
  "streetLine2",
  "city",
  "region",
  "postalCode",
  "country",
] as const satisfies ReadonlyArray<keyof EditableForm>;

function buildPatch(p: Person, f: EditableForm): UpdatePersonInput["patch"] {
  const patch: Record<string, unknown> = {};

  // displayName is non-nullable — only emit on change, ignore the empty
  // string (the validator would 400 anyway).
  if (f.displayName.trim() && f.displayName.trim() !== p.displayName) {
    patch.displayName = f.displayName.trim();
  }

  for (const key of NULLABLE_PATCH_FIELDS) {
    const next = f[key].trim();
    const current = (p[key] ?? "") as string;
    if (next === current) continue;
    patch[key] = next === "" ? null : next;
  }

  // consentEmail is non-nullable; emit any change, including switches
  // back to `no_consent`. PII per GDPR Art. 7 — never logged as a
  // value (contacts-core audit emits only the column name).
  if (f.consentEmail !== p.consentEmail) {
    patch.consentEmail = f.consentEmail;
  }

  return patch as UpdatePersonInput["patch"];
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
            <div className="grid grid-cols-[110px_1fr_90px] gap-2">
              <Field
                label="Country code"
                value={form.phone1CountryCode}
                onChange={(v) => setForm({ ...form, phone1CountryCode: v })}
                hint="e.g. +1"
              />
              <Field
                label="Phone"
                value={form.phone1Number}
                onChange={(v) => setForm({ ...form, phone1Number: v })}
              />
              <Field
                label="Ext"
                value={form.phone1Ext}
                onChange={(v) => setForm({ ...form, phone1Ext: v })}
              />
            </div>
            <Field
              label="Account ID"
              value={form.accountId}
              onChange={(v) => setForm({ ...form, accountId: v })}
              hint="Empty detaches this person from their account."
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
                  setForm({ ...form, consentEmail: v as EmailConsent })
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
              label="Street line 1"
              value={form.streetLine1}
              onChange={(v) => setForm({ ...form, streetLine1: v })}
            />
            <Field
              label="Street line 2"
              value={form.streetLine2}
              onChange={(v) => setForm({ ...form, streetLine2: v })}
            />
            <div className="grid grid-cols-2 gap-3">
              <Field
                label="City"
                value={form.city}
                onChange={(v) => setForm({ ...form, city: v })}
              />
              <Field
                label="Region"
                value={form.region}
                onChange={(v) => setForm({ ...form, region: v })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field
                label="Postal code"
                value={form.postalCode}
                onChange={(v) => setForm({ ...form, postalCode: v })}
              />
              <Field
                label="Country"
                value={form.country}
                onChange={(v) => setForm({ ...form, country: v })}
                hint="ISO 3166-1 alpha-2 (US, DE, JP)."
              />
            </div>
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
              <dt className="text-foreground-subtle">Latitude</dt>
              <dd>{person.latitude ?? "—"}</dd>
              <dt className="text-foreground-subtle">Longitude</dt>
              <dd>{person.longitude ?? "—"}</dd>
              <dt className="text-foreground-subtle">Phone type</dt>
              <dd>{person.phone1Type ?? "—"}</dd>
              <dt className="text-foreground-subtle">Avatar</dt>
              <dd className="truncate">{person.imageAvatar ?? "—"}</dd>
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
