import test from "node:test";
import assert from "node:assert/strict";
import { composeModules, ComposeError } from "./compose.js";
import type { DashboardModule, SlotFiller } from "./types.js";

const stubComponent = (() => null) as unknown as DashboardModule["routes"] extends
  | undefined
  | ReadonlyArray<infer R>
  ? R extends { component: infer C }
    ? C
    : never
  : never;

const mod = (id: string, extra?: Partial<DashboardModule>): DashboardModule => ({
  id,
  ...extra,
});

test("composes base + add without collision", () => {
  const out = composeModules({
    base: [mod("users"), mod("api-keys")],
    add: [mod("settings")],
  });
  assert.deepEqual(
    out.modules.map((m) => m.id),
    ["users", "api-keys", "settings"],
  );
  assert.equal(out.fillers.length, 0);
});

test("rejects duplicate base ids", () => {
  assert.throws(
    () => composeModules({ base: [mod("users"), mod("users")] }),
    ComposeError,
  );
});

test("rejects add colliding with base", () => {
  assert.throws(
    () => composeModules({ base: [mod("users")], add: [mod("users")] }),
    ComposeError,
  );
});

test("replace swaps a base module by id", () => {
  const swapped = mod("users", { nav: [{ id: "u", items: [] }] });
  const out = composeModules({
    base: [mod("users"), mod("api-keys")],
    replace: { users: swapped },
  });
  assert.equal(out.modules.find((m) => m.id === "users")?.nav?.[0]?.id, "u");
});

test("replace key must match module.id", () => {
  assert.throws(
    () =>
      composeModules({
        base: [mod("users")],
        replace: { users: mod("not-users") },
      }),
    ComposeError,
  );
});

test("replace must target an existing module", () => {
  assert.throws(
    () => composeModules({ base: [mod("a")], replace: { b: mod("b") } }),
    ComposeError,
  );
});

test("rejects duplicate route paths across modules", () => {
  const a = mod("a", {
    routes: [{ path: "/x", component: stubComponent as never }],
  });
  const b = mod("b", {
    routes: [{ path: "/x", component: stubComponent as never }],
  });
  assert.throws(() => composeModules({ base: [a, b] }), ComposeError);
});

test("rejects duplicate slot fillers across modules and input.slots", () => {
  const filler: SlotFiller = {
    slot: "settings.sections",
    id: "billing",
    component: stubComponent as never,
  };
  const a = mod("a", { slotFillers: [filler] });
  assert.throws(
    () => composeModules({ base: [a], slots: [filler] }),
    ComposeError,
  );
});

test("fillers are sorted by order ascending", () => {
  const f = (id: string, order?: number): SlotFiller => ({
    slot: "s",
    id,
    order,
    component: stubComponent as never,
  });
  const out = composeModules({
    base: [],
    slots: [f("c", 10), f("a"), f("b", 5)],
  });
  assert.deepEqual(
    out.fillers.map((x) => x.id),
    ["a", "b", "c"],
  );
});
