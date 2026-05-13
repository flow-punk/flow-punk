import type { ReactNode } from "react";

export interface KvProps {
  label: ReactNode;
  value: ReactNode;
}

export function KvStrip({ items }: { items: KvProps[] }) {
  return (
    <div className="flex gap-9 border-b border-t border-border py-4">
      {items.map((it, idx) => (
        <div className="flex flex-col gap-0.5" key={idx}>
          <span className="text-[11.5px] font-medium uppercase tracking-wider text-foreground-muted">
            {it.label}
          </span>
          <span className="text-[15px] font-medium tabular-nums">{it.value}</span>
        </div>
      ))}
    </div>
  );
}
