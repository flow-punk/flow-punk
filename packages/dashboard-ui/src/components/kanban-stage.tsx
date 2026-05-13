import type { ReactNode } from "react";

export interface KanbanStageProps {
  name: ReactNode;
  count: number;
  sum?: ReactNode;
  children: ReactNode;
}

export function KanbanStage({ name, count, sum, children }: KanbanStageProps) {
  return (
    <div className="flex min-h-[320px] flex-col gap-2 rounded-lg border border-border bg-background-muted p-3">
      <div className="flex items-center gap-2 border-b border-border/0 pb-1.5">
        <span className="text-[13px] font-semibold">{name}</span>
        <span className="rounded-full border border-border bg-background px-1.5 py-px text-[11.5px] text-foreground-muted">
          {count}
        </span>
        {sum ? (
          <span className="ml-auto text-[11.5px] text-foreground-muted">{sum}</span>
        ) : null}
      </div>
      <div className="flex flex-1 flex-col gap-2">{children}</div>
    </div>
  );
}

export interface KanbanDealProps {
  name: ReactNode;
  meta?: ReactNode;
  onClick?: () => void;
}

export function KanbanDeal({ name, meta, onClick }: KanbanDealProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="cursor-pointer rounded-md border border-border bg-background p-2.5 text-left transition-shadow hover:border-border-strong hover:shadow-sm"
    >
      <div className="text-[13px] font-medium">{name}</div>
      {meta ? (
        <div className="mt-1.5 flex items-center justify-between text-xs text-foreground-muted">
          {meta}
        </div>
      ) : null}
    </button>
  );
}
