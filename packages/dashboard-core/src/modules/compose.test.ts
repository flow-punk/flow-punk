import test from "node:test";
import assert from "node:assert/strict";
import { composeModules, ComposeError } from "./compose.js";
import { baseModules } from "./base.js";
import { makeUsersModule } from "./users/index.js";
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

test("base modules include api-keys and settings", () => {
  const ids = baseModules.map((m) => m.id);
  assert.ok(ids.includes("api-keys"), "api-keys module not registered");
  assert.ok(ids.includes("settings"), "settings module not registered");
});

test("settings module defines the settings.sections slot", () => {
  const settings = baseModules.find((m) => m.id === "settings");
  assert.ok(settings, "settings module missing");
  const slotIds = settings!.slots?.map((s) => s.id) ?? [];
  assert.ok(
    slotIds.includes("settings.sections"),
    "settings.sections slot must be defined on the settings module",
  );
});

test("makeUsersModule produces a module with a list + detail route", () => {
  const users = makeUsersModule({ enforceSingleOwner: true });
  assert.equal(users.id, "users");
  const paths = (users.routes ?? []).map((r) => r.path);
  assert.deepEqual(paths.sort(), ["/users", "/users/$id"].sort());
});

test("indie compose registers all base modules + users cleanly", () => {
  const out = composeModules({
    base: baseModules,
    add: [makeUsersModule({ enforceSingleOwner: true })],
  });
  const ids = out.modules.map((m) => m.id).sort();
  assert.deepEqual(
    ids,
    ["accounts", "api-keys", "people", "pipelines", "settings", "users"],
  );
});

test("managed compose replaces the users module with a multi-seat variant", () => {
  const indieUsers = makeUsersModule({ enforceSingleOwner: true });
  const multiSeat = makeUsersModule({ enforceSingleOwner: false, showInvite: true });
  const out = composeModules({
    base: [...baseModules, indieUsers],
    replace: { users: multiSeat },
  });
  const users = out.modules.find((m) => m.id === "users");
  assert.ok(users);
  // The factory output for both variants shares the same route paths;
  // the difference is internal (props passed to the rendered view).
  assert.deepEqual(
    (users!.routes ?? []).map((r) => r.path).sort(),
    ["/users", "/users/$id"].sort(),
  );
});

test("settings.sections fillers compose in explicit order, not insertion order", () => {
  const stub = (() => null) as unknown as SlotFiller["component"];
  const out = composeModules({
    base: baseModules,
    slots: [
      { slot: "settings.sections", id: "billing", order: 30, component: stub },
      { slot: "settings.sections", id: "plan", order: 10, component: stub },
      { slot: "settings.sections", id: "seats", order: 20, component: stub },
    ],
  });
  const ids = out.fillers
    .filter((f) => f.slot === "settings.sections")
    .map((f) => f.id);
  assert.deepEqual(ids, ["plan", "seats", "billing"]);
});

test("SlotFiller accepts a requires gate without breaking compose", () => {
  const stub = (() => null) as unknown as SlotFiller["component"];
  const out = composeModules({
    base: baseModules,
    slots: [
      {
        slot: "settings.sections",
        id: "admin-only",
        order: 5,
        component: stub,
        requires: { role: "tenant-admin" },
      },
    ],
  });
  const filler = out.fillers.find((f) => f.id === "admin-only");
  assert.ok(filler, "filler with requires must compose");
  assert.deepEqual(filler!.requires, { role: "tenant-admin" });
});

test("duplicate {slot,id} pair in settings.sections is rejected", () => {
  const stub = (() => null) as unknown as SlotFiller["component"];
  assert.throws(
    () =>
      composeModules({
        base: baseModules,
        slots: [
          { slot: "settings.sections", id: "billing", component: stub },
          { slot: "settings.sections", id: "billing", component: stub },
        ],
      }),
    ComposeError,
  );
});

// ── Phase 3 — accounts.detail.tabs + accounts.list.columns slots ──

test("base modules include accounts and people", () => {
  const ids = baseModules.map((m) => m.id);
  assert.ok(ids.includes("accounts"), "accounts module not registered");
  assert.ok(ids.includes("people"), "people module not registered");
});

test("accounts module defines accounts.detail.tabs + accounts.list.columns slots", () => {
  const accounts = baseModules.find((m) => m.id === "accounts");
  assert.ok(accounts, "accounts module missing");
  const slotIds = accounts!.slots?.map((s) => s.id) ?? [];
  assert.ok(slotIds.includes("accounts.detail.tabs"));
  assert.ok(slotIds.includes("accounts.list.columns"));
});

test("accounts module ships a built-in Overview tab filler", () => {
  const accounts = baseModules.find((m) => m.id === "accounts");
  assert.ok(accounts);
  const overview = accounts!.slotFillers?.find(
    (f) => f.slot === "accounts.detail.tabs" && f.id === "overview",
  );
  assert.ok(overview, "overview tab filler must be registered by the module");
  assert.equal(overview!.order, 10);
});

test("accounts compose registers built-in Overview without collision", () => {
  const out = composeModules({ base: baseModules });
  const detailTabs = out.fillers.filter(
    (f) => f.slot === "accounts.detail.tabs",
  );
  assert.equal(detailTabs.length, 1);
  assert.equal(detailTabs[0]!.id, "overview");
});

test("accounts.detail.tabs fillers compose in explicit order", () => {
  const stub = (() => null) as unknown as SlotFiller["component"];
  const out = composeModules({
    base: baseModules,
    slots: [
      {
        slot: "accounts.detail.tabs",
        id: "billing",
        order: 20,
        component: stub,
      },
      { slot: "accounts.detail.tabs", id: "audit", order: 30, component: stub },
    ],
  });
  const ids = out.fillers
    .filter((f) => f.slot === "accounts.detail.tabs")
    .map((f) => f.id);
  assert.deepEqual(ids, ["overview", "billing", "audit"]);
});

test("duplicate {slot,id} pair in accounts.detail.tabs is rejected", () => {
  const stub = (() => null) as unknown as SlotFiller["component"];
  assert.throws(
    () =>
      composeModules({
        base: baseModules,
        slots: [
          {
            slot: "accounts.detail.tabs",
            id: "billing",
            component: stub,
          },
          {
            slot: "accounts.detail.tabs",
            id: "billing",
            component: stub,
          },
        ],
      }),
    ComposeError,
  );
});

test("accounts.detail.tabs filler accepts a requires gate", () => {
  const stub = (() => null) as unknown as SlotFiller["component"];
  const out = composeModules({
    base: baseModules,
    slots: [
      {
        slot: "accounts.detail.tabs",
        id: "billing",
        order: 20,
        component: stub,
        requires: { role: "tenant-admin" },
      },
    ],
  });
  const filler = out.fillers.find(
    (f) => f.slot === "accounts.detail.tabs" && f.id === "billing",
  );
  assert.ok(filler);
  assert.deepEqual(filler!.requires, { role: "tenant-admin" });
});

test("accounts.list.columns fillers compose without collision", () => {
  const stub = (() => null) as unknown as SlotFiller["component"];
  const out = composeModules({
    base: baseModules,
    slots: [
      { slot: "accounts.list.columns", id: "mrr:MRR", component: stub },
      {
        slot: "accounts.list.columns",
        id: "health",
        order: 20,
        component: stub,
      },
    ],
  });
  const ids = out.fillers
    .filter((f) => f.slot === "accounts.list.columns")
    .map((f) => f.id);
  assert.deepEqual(ids.sort(), ["health", "mrr:MRR"].sort());
});

test("duplicate {slot,id} pair in accounts.list.columns is rejected", () => {
  const stub = (() => null) as unknown as SlotFiller["component"];
  assert.throws(
    () =>
      composeModules({
        base: baseModules,
        slots: [
          { slot: "accounts.list.columns", id: "mrr", component: stub },
          { slot: "accounts.list.columns", id: "mrr", component: stub },
        ],
      }),
    ComposeError,
  );
});

test("accounts.list.columns filler accepts a requires gate (composition only)", () => {
  // Composition surface: `requires` survives compose so the runtime can
  // gate. NOTE: as of Phase 3, the runtime `useSlotFillers` only enforces
  // `requires.role` — `requires.features` is preserved on the filler but
  // not yet checked at render time. Modules that need feature-gating
  // today must do their own check in the host component. See Phase 2.5
  // follow-up to extend `requirementsSatisfied` in slots.tsx.
  const stub = (() => null) as unknown as SlotFiller["component"];
  const out = composeModules({
    base: baseModules,
    slots: [
      {
        slot: "accounts.list.columns",
        id: "billing-status",
        component: stub,
        requires: { role: "tenant-admin" },
      },
    ],
  });
  const filler = out.fillers.find(
    (f) => f.slot === "accounts.list.columns" && f.id === "billing-status",
  );
  assert.ok(filler);
  assert.deepEqual(filler!.requires, { role: "tenant-admin" });
});

test("people module exposes list + detail routes", () => {
  const people = baseModules.find((m) => m.id === "people");
  assert.ok(people);
  const paths = (people!.routes ?? []).map((r) => r.path).sort();
  assert.deepEqual(paths, ["/people", "/people/$id"].sort());
});

test("accounts module exposes list + detail routes", () => {
  const accounts = baseModules.find((m) => m.id === "accounts");
  assert.ok(accounts);
  const paths = (accounts!.routes ?? []).map((r) => r.path).sort();
  assert.deepEqual(paths, ["/accounts", "/accounts/$id"].sort());
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
