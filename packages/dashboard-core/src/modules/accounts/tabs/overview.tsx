/**
 * Built-in "Overview" tab for the accounts detail view. Registered as a
 * slot filler on `accounts.detail.tabs` by `accountsModule.slotFillers`
 * (stable id `overview`, order 10). The tab strip is fully slot-driven
 * so managed can contribute "Billing" without the core module knowing
 * about it.
 */
import { useAccount } from "../hooks.js";
import { useAccountTabContext } from "./context.js";
import { Badge, KvStrip } from "@flowpunk-indie/dashboard-ui";
import { usePeople } from "../../people/hooks.js";

export function AccountOverviewTab() {
  const { accountId } = useAccountTabContext();
  const { data: account } = useAccount(accountId);
  const { data: peopleResp } = usePeople({ accountId });

  if (!account) return null;

  const peopleAtAccount = peopleResp?.items ?? [];

  return (
    <div className="flex flex-col gap-6">
      <KvStrip
        items={[
          {
            label: "Domain",
            value: account.domain ?? "—",
          },
          {
            label: "Industry",
            value: account.industry ?? "—",
          },
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

      <section className="rounded-[var(--radius)] border border-border p-5">
        <div className="mb-3 flex items-baseline justify-between">
          <h3 className="text-[13px] font-semibold uppercase tracking-wider text-foreground-muted">
            People at this account
          </h3>
          <span className="text-[13px] text-foreground-muted">
            {peopleAtAccount.length}
          </span>
        </div>
        {peopleAtAccount.length === 0 ? (
          <p className="text-[13px] text-foreground-muted">
            No people are linked to this account yet.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {peopleAtAccount.map((p) => (
              <li key={p.id} className="flex items-center gap-3 py-2.5">
                <span className="grid h-7 w-7 place-items-center rounded-full bg-background-muted text-[10px] font-medium uppercase text-foreground-muted">
                  {(p.firstName?.[0] ?? p.displayName[0] ?? "?").toUpperCase()}
                </span>
                <div className="flex-1">
                  <p className="text-[13px] text-foreground">{p.displayName}</p>
                  <p className="text-[12.5px] text-foreground-subtle">
                    {p.title ?? p.emailPrimary ?? "—"}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-[var(--radius)] border border-border p-5">
        <h3 className="mb-3 text-[13px] font-semibold uppercase tracking-wider text-foreground-muted">
          Address
        </h3>
        <p className="whitespace-pre-line text-[13px] text-foreground">
          {[
            account.addressLine1,
            account.addressLine2,
            [account.city, account.region, account.postalCode]
              .filter(Boolean)
              .join(" "),
            account.country,
          ]
            .filter(Boolean)
            .join("\n") || (
            <span className="text-foreground-subtle">No address on file.</span>
          )}
        </p>
      </section>
    </div>
  );
}
