import type { ReactNode } from "react";
import { Icon } from "../icons/Icon.js";
import { cn } from "../lib/cn.js";

export interface SidebarProps {
  header?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}

export function Sidebar({ header, children, footer }: SidebarProps) {
  return (
    <aside className="flex flex-col overflow-hidden border-r border-border bg-background-muted">
      {header ? (
        <div className="border-b border-border p-2.5">{header}</div>
      ) : null}
      <nav className="flex flex-1 flex-col gap-px overflow-y-auto p-2 pb-4">
        {children}
      </nav>
      {footer ? <div className="border-t border-border p-2">{footer}</div> : null}
    </aside>
  );
}

export function SidebarSection({
  label,
  children,
}: {
  label?: string;
  children: ReactNode;
}) {
  return (
    <div className="mt-3 first:mt-0">
      {label ? (
        <div className="px-2.5 pb-1.5 pt-1 text-[11px] font-medium uppercase tracking-wider text-foreground-subtle">
          {label}
        </div>
      ) : null}
      <div className="flex flex-col gap-px">{children}</div>
    </div>
  );
}

export interface SidebarItemProps {
  icon?: ReactNode;
  label: ReactNode;
  active?: boolean;
  onClick?: () => void;
}

export function SidebarItem({ icon, label, active, onClick }: SidebarItemProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-[var(--radius)] px-2.5 py-1.5 text-left text-sm font-medium",
        active
          ? "bg-background-active text-accent"
          : "text-foreground hover:bg-background-hover",
      )}
    >
      {icon ? (
        <span
          className={cn(
            "flex h-4 w-4 items-center justify-center",
            active ? "text-accent" : "text-foreground-muted",
          )}
        >
          {icon}
        </span>
      ) : null}
      <span className="truncate">{label}</span>
    </button>
  );
}

export interface OrgSwitchProps {
  label: string;
  initials: string;
  onClick?: () => void;
}

export function OrgSwitch({ label, initials, onClick }: OrgSwitchProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2.5 rounded-[var(--radius)] px-2 py-1.5 text-left hover:bg-background-hover"
    >
      <span className="grid h-[26px] w-[26px] flex-shrink-0 place-items-center rounded-md bg-gradient-to-br from-[#4f46e5] to-[#7c3aed] text-xs font-semibold text-white">
        {initials}
      </span>
      <span className="flex-1 truncate text-[13.5px] font-semibold">{label}</span>
      <Icon name="chev-d" className="text-foreground-subtle" />
    </button>
  );
}
