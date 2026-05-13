import type { DashboardModule, SlotFiller } from "./types.js";

export interface ComposeInput {
  /** Base module set, e.g., `baseModules` from this package. */
  base: ReadonlyArray<DashboardModule>;
  /** Replace a base module by `id`. Keyed by module id. */
  replace?: Record<string, DashboardModule>;
  /** Append modules not present in `base`. */
  add?: ReadonlyArray<DashboardModule>;
  /** Extra slot fillers contributed outside of any module. */
  slots?: ReadonlyArray<SlotFiller>;
}

/** Resolve a module graph from base + edition-specific overrides.
 *
 *  Collision detection:
 *   - Two modules with the same `id` are an error unless one is in `replace`.
 *   - Two slot fillers with the same `{slot,id}` pair are an error.
 *   - A route path appearing in more than one module is an error.
 */
export function composeModules(input: ComposeInput): {
  modules: DashboardModule[];
  fillers: SlotFiller[];
} {
  const byId = new Map<string, DashboardModule>();

  for (const mod of input.base) {
    if (byId.has(mod.id)) {
      throw new ComposeError(`duplicate base module id: ${mod.id}`);
    }
    byId.set(mod.id, mod);
  }

  for (const [id, mod] of Object.entries(input.replace ?? {})) {
    if (mod.id !== id) {
      throw new ComposeError(
        `replace key '${id}' does not match module.id '${mod.id}'`,
      );
    }
    if (!byId.has(id)) {
      throw new ComposeError(`cannot replace unknown module id: ${id}`);
    }
    byId.set(id, mod);
  }

  for (const mod of input.add ?? []) {
    if (byId.has(mod.id)) {
      throw new ComposeError(
        `add module collides with existing id: ${mod.id} (use replace instead)`,
      );
    }
    byId.set(mod.id, mod);
  }

  const modules = Array.from(byId.values());
  const fillers: SlotFiller[] = [];
  const fillerKey = (f: SlotFiller) => `${f.slot}::${f.id}`;
  const seenFiller = new Set<string>();
  const routePathSeen = new Map<string, string>();

  for (const mod of modules) {
    for (const route of mod.routes ?? []) {
      const prev = routePathSeen.get(route.path);
      if (prev) {
        throw new ComposeError(
          `route path collision '${route.path}' in modules '${prev}' and '${mod.id}'`,
        );
      }
      routePathSeen.set(route.path, mod.id);
    }
    for (const f of mod.slotFillers ?? []) {
      const k = fillerKey(f);
      if (seenFiller.has(k)) {
        throw new ComposeError(`duplicate slot filler: ${k}`);
      }
      seenFiller.add(k);
      fillers.push(f);
    }
  }

  for (const f of input.slots ?? []) {
    const k = fillerKey(f);
    if (seenFiller.has(k)) {
      throw new ComposeError(`duplicate slot filler from input.slots: ${k}`);
    }
    seenFiller.add(k);
    fillers.push(f);
  }

  fillers.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  return { modules, fillers };
}

export class ComposeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ComposeError";
  }
}
