/**
 * Slot host — runtime wiring for module-defined extension points.
 *
 * `composeModules` produces the flat, validated, order-sorted filler
 * list (see `compose.ts`). The dashboard-app factory wraps the router
 * in `<SlotsProvider fillers={...}>`; any module's render path can
 * mount `<SlotHost slot="settings.sections" />` to fan the matching
 * fillers out.
 *
 * Filler props per ADR-016 §"Slots": `{}` (no props — fillers are
 * self-contained and pull their own data via hooks). Slots that need
 * to thread context (e.g. `accounts.detail.tabs` needs the current
 * entity id) can extend this with a typed `SlotHost<Props>` overload
 * later — but defer that until the first slot needs it.
 */
import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { ModuleRequirements, SlotFiller } from "./types.js";
import type { SessionUser } from "../auth/types.js";
import { useSession } from "../auth/use-session.js";

interface SlotsContextValue {
  fillers: ReadonlyArray<SlotFiller>;
}

const SlotsContext = createContext<SlotsContextValue>({ fillers: [] });

export function SlotsProvider({
  fillers,
  children,
}: {
  fillers: ReadonlyArray<SlotFiller>;
  children: ReactNode;
}) {
  const value = useMemo(() => ({ fillers }), [fillers]);
  return (
    <SlotsContext.Provider value={value}>{children}</SlotsContext.Provider>
  );
}

function requirementsSatisfied(
  user: SessionUser | null,
  requires: ModuleRequirements | undefined,
): boolean {
  if (!requires) return true;
  if (requires.role && user?.role !== requires.role) return false;
  return true;
}

/**
 * Filter fillers contributed to `slotId` against the current session.
 * A filler with `requires` is omitted unless the session's role
 * satisfies — the same gating contract modules and nav items use.
 *
 * Server-side authorization is still authoritative; this gates the UI
 * so non-admin sessions don't render admin-only panels.
 */
export function useSlotFillers(
  slotId: string,
): ReadonlyArray<SlotFiller> {
  const { fillers } = useContext(SlotsContext);
  const { session } = useSession();
  return useMemo(
    () =>
      fillers.filter(
        (f) =>
          f.slot === slotId &&
          requirementsSatisfied(session?.user ?? null, f.requires),
      ),
    [fillers, slotId, session?.user],
  );
}

/**
 * Render every filler contributed to `slot`, in ascending `order`.
 * No-prop fillers per ADR-016. The host is intentionally minimal —
 * layout/spacing is the responsibility of the consuming surface so
 * fillers blend with the surrounding section.
 */
export function SlotHost({ slot }: { slot: string }) {
  const fillers = useSlotFillers(slot);
  return (
    <>
      {fillers.map((f) => {
        // Cast through unknown — fillers self-bind every prop they need;
        // the slot host only owns mounting + `key`.
        const Comp = f.component as React.ComponentType;
        return <Comp key={`${f.slot}::${f.id}`} />;
      })}
    </>
  );
}
