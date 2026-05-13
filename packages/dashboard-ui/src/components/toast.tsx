import { Toaster as SonnerToaster, toast } from "sonner";

/** Toast surface (per Phase 0 plan, "Toast" comes from sonner). */
export function Toaster() {
  return (
    <SonnerToaster
      position="top-right"
      toastOptions={{
        classNames: {
          toast:
            "rounded-[var(--radius)] border border-border bg-background text-foreground shadow",
          description: "text-foreground-muted",
        },
      }}
    />
  );
}

export { toast };
