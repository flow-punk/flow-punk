import type { ReactNode } from "react";
import { Icon } from "../icons/Icon.js";
import { cn } from "../lib/cn.js";

export interface TopbarProps {
  search?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

export function Topbar({ search, actions, className }: TopbarProps) {
  return (
    <header
      className={cn(
        "flex flex-shrink-0 items-center gap-3 border-b border-border bg-background px-5",
        "h-[var(--spacing-topbar)]",
        className,
      )}
    >
      {search}
      <div className="ml-auto flex items-center gap-1">{actions}</div>
    </header>
  );
}

export function TopbarSearch({ placeholder = "Search…", kbd = "⌘K" }: { placeholder?: string; kbd?: string }) {
  return (
    <div className="relative flex max-w-[480px] flex-1 items-center">
      <Icon name="search" className="pointer-events-none absolute left-2.5 text-foreground-subtle" />
      <input
        type="search"
        placeholder={placeholder}
        className="w-full rounded-[var(--radius)] border border-border bg-background-muted px-2.5 py-1.5 pl-8 pr-12 text-[13px] outline-none transition-colors focus:border-accent focus:bg-background focus:ring-[3px] focus:ring-accent/15"
      />
      <kbd className="absolute right-2 rounded-sm border border-border bg-background px-1.5 py-0.5 font-mono text-[11px] text-foreground-subtle">
        {kbd}
      </kbd>
    </div>
  );
}

export interface TopbarIconButtonProps {
  icon: ReactNode;
  label: string;
  onClick?: () => void;
  hasBadge?: boolean;
}

export function TopbarIconButton({ icon, label, onClick, hasBadge }: TopbarIconButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="relative grid h-8 w-8 place-items-center rounded-[var(--radius)] text-foreground-muted hover:bg-background-hover hover:text-foreground"
    >
      {icon}
      {hasBadge ? (
        <span className="absolute right-1.5 top-1.5 h-[7px] w-[7px] rounded-full border-2 border-background bg-accent" />
      ) : null}
    </button>
  );
}
