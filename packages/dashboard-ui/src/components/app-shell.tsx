import type { ReactNode } from "react";
import { cn } from "../lib/cn.js";

export interface AppShellProps {
  sidebar: ReactNode;
  topbar: ReactNode;
  children: ReactNode;
  className?: string;
}

export function AppShell({ sidebar, topbar, children, className }: AppShellProps) {
  return (
    <div
      className={cn(
        "grid h-screen w-screen overflow-hidden",
        "grid-cols-[var(--spacing-sidebar)_1fr]",
        className,
      )}
    >
      {sidebar}
      <div className="flex min-w-0 flex-col overflow-hidden">
        {topbar}
        <main className="flex-1 overflow-y-auto px-8 pb-20 pt-7">{children}</main>
      </div>
    </div>
  );
}
