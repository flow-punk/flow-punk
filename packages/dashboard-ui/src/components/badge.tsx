import { cva, type VariantProps } from "class-variance-authority";
import type { HTMLAttributes } from "react";
import { cn } from "../lib/cn.js";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full px-2 py-px text-[11.5px] font-medium leading-[1.5] whitespace-nowrap",
  {
    variants: {
      tone: {
        neutral: "bg-neutral-background text-neutral-foreground",
        success: "bg-success-background text-success-foreground",
        warn: "bg-warn-background text-warn-foreground",
        danger: "bg-danger-background text-danger-foreground",
        info: "bg-info-background text-info-foreground",
      },
    },
    defaultVariants: {
      tone: "neutral",
    },
  },
);

export interface BadgeProps
  extends HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {
  withDot?: boolean;
}

export function Badge({ className, tone, withDot, children, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ tone }), className)} {...props}>
      {withDot ? <span className="h-1.5 w-1.5 rounded-full bg-current" /> : null}
      {children}
    </span>
  );
}
