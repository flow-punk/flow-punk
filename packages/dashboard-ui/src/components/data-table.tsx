import type { ReactNode } from "react";
import { cn } from "../lib/cn.js";

/** Presentational data-table primitives. Pagination, filter, and column-toggle
 *  behavior come from data hooks in dashboard-core / consumers; this layer
 *  only provides the styled shell. */

export function DataTable({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <table className={cn("w-full border-separate border-spacing-0 text-[13px]", className)}>
      {children}
    </table>
  );
}

export function DataTableHead({ children }: { children: ReactNode }) {
  return <thead>{children}</thead>;
}

export function DataTableHeadRow({ children }: { children: ReactNode }) {
  return <tr>{children}</tr>;
}

export function DataTableHeadCell({
  children,
  align,
  className,
}: {
  children?: ReactNode;
  align?: "left" | "right";
  className?: string;
}) {
  return (
    <th
      className={cn(
        "whitespace-nowrap border-b border-border px-3 py-2.5 text-[11.5px] font-medium uppercase tracking-wider text-foreground-muted",
        align === "right" ? "text-right" : "text-left",
        className,
      )}
    >
      {children}
    </th>
  );
}

export function DataTableBody({ children }: { children: ReactNode }) {
  return <tbody>{children}</tbody>;
}

export function DataTableRow({
  children,
  selected,
  onClick,
}: {
  children: ReactNode;
  selected?: boolean;
  onClick?: () => void;
}) {
  return (
    <tr
      onClick={onClick}
      className={cn(
        "cursor-pointer",
        selected ? "[&>td]:bg-background-active" : "hover:[&>td]:bg-background-muted",
      )}
    >
      {children}
    </tr>
  );
}

export function DataTableCell({
  children,
  align,
  className,
}: {
  children?: ReactNode;
  align?: "left" | "right";
  className?: string;
}) {
  return (
    <td
      className={cn(
        "border-b border-border px-3 py-2.5 align-middle",
        align === "right" ? "text-right" : "text-left",
        className,
      )}
    >
      {children}
    </td>
  );
}
