import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "../lib/cn.js";

export type InputProps = InputHTMLAttributes<HTMLInputElement>;

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, type, ...props },
  ref,
) {
  return (
    <input
      type={type}
      ref={ref}
      className={cn(
        "flex h-9 w-full rounded-[var(--radius)] border border-border bg-background px-3 py-1 text-sm shadow-sm transition-colors",
        "placeholder:text-foreground-subtle hover:border-border-strong",
        "focus-visible:outline-none focus-visible:border-accent focus-visible:ring-[3px] focus-visible:ring-accent/15",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
});
