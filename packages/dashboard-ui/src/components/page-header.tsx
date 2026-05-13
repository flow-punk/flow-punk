import type { ReactNode } from "react";

export interface PageHeaderProps {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
}

export function PageHeader({ title, subtitle, actions }: PageHeaderProps) {
  return (
    <header className="mb-6 flex items-start justify-between gap-4">
      <div>
        <h1 className="m-0 text-[22px] font-semibold tracking-tight">{title}</h1>
        {subtitle ? (
          <p className="mt-0.5 text-[13px] text-foreground-muted">{subtitle}</p>
        ) : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </header>
  );
}
