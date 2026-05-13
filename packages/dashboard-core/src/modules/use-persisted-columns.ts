/**
 * Persist a list view's column visibility set in `localStorage`, scoped
 * per module id. Mirrors the convention named in the Phase 3 spec:
 * `dashboard.<moduleId>.columns`.
 *
 * The hook is intentionally generic — both accounts and people consume
 * it; future modules with toggleable columns can do the same.
 *
 * `columnIds` is the canonical key set; persisted state is filtered
 * against it so renaming/removing a column doesn't leave a stale entry
 * driving the UI. Defaults default to "visible" for any column not in
 * the persisted map (so a newly added column shows up automatically).
 */
import { useCallback, useEffect, useMemo, useState } from "react";

const KEY_PREFIX = "dashboard.";
const KEY_SUFFIX = ".columns";

function storageKey(moduleId: string): string {
  return `${KEY_PREFIX}${moduleId}${KEY_SUFFIX}`;
}

function readPersisted(moduleId: string): Record<string, boolean> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(storageKey(moduleId));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object") {
      const out: Record<string, boolean> = {};
      for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
        if (typeof v === "boolean") out[k] = v;
      }
      return out;
    }
  } catch {
    /* ignore — corrupted entry shouldn't crash the list view */
  }
  return {};
}

export interface UsePersistedColumnsResult {
  /** Map of `columnId -> isVisible`. Stable identity across renders. */
  visibility: Record<string, boolean>;
  /** Toggle a single column's visibility (and persist). */
  toggle: (columnId: string) => void;
  /** Reset to all-visible (and clear the persisted entry). */
  reset: () => void;
  /** Convenience: is the column currently visible? */
  isVisible: (columnId: string) => boolean;
}

export function usePersistedColumns(
  moduleId: string,
  columnIds: ReadonlyArray<string>,
  defaults: { hiddenByDefault?: ReadonlyArray<string> } = {},
): UsePersistedColumnsResult {
  const hiddenByDefault = useMemo(
    () => new Set(defaults.hiddenByDefault ?? []),
    [defaults.hiddenByDefault],
  );

  const [persisted, setPersisted] = useState<Record<string, boolean>>(() =>
    readPersisted(moduleId),
  );

  useEffect(() => {
    setPersisted(readPersisted(moduleId));
  }, [moduleId]);

  const visibility = useMemo(() => {
    const out: Record<string, boolean> = {};
    for (const id of columnIds) {
      if (Object.prototype.hasOwnProperty.call(persisted, id)) {
        out[id] = persisted[id]!;
      } else {
        out[id] = !hiddenByDefault.has(id);
      }
    }
    return out;
  }, [columnIds, persisted, hiddenByDefault]);

  const persist = useCallback(
    (next: Record<string, boolean>) => {
      setPersisted(next);
      if (typeof window === "undefined") return;
      try {
        window.localStorage.setItem(storageKey(moduleId), JSON.stringify(next));
      } catch {
        /* quota / disabled storage — visibility still works for this session */
      }
    },
    [moduleId],
  );

  const toggle = useCallback(
    (columnId: string) => {
      const current = Object.prototype.hasOwnProperty.call(persisted, columnId)
        ? persisted[columnId]!
        : !hiddenByDefault.has(columnId);
      persist({ ...persisted, [columnId]: !current });
    },
    [persisted, persist, hiddenByDefault],
  );

  const reset = useCallback(() => {
    setPersisted({});
    if (typeof window === "undefined") return;
    try {
      window.localStorage.removeItem(storageKey(moduleId));
    } catch {
      /* ignore */
    }
  }, [moduleId]);

  const isVisible = useCallback(
    (columnId: string) => visibility[columnId] ?? true,
    [visibility],
  );

  return { visibility, toggle, reset, isVisible };
}
