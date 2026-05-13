import type { ReactNode } from "react";
import { cn } from "../lib/cn.js";

export interface ToolbarProps {
  children: ReactNode;
  className?: string;
}

export function Toolbar({ children, className }: ToolbarProps) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 border-b border-border py-3",
        className,
      )}
    >
      {children}
    </div>
  );
}

export interface ChipButtonProps {
  icon?: ReactNode;
  label: ReactNode;
  hasValue?: boolean;
  onClick?: () => void;
}

export function ChipButton({ icon, label, hasValue, onClick }: ChipButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs",
        hasValue
          ? "border border-solid border-border bg-background-muted text-foreground"
          : "border border-dashed border-border-strong bg-background text-foreground-muted hover:border-foreground-muted hover:text-foreground",
      )}
    >
      {icon}
      {label}
    </button>
  );
}
