import test from "node:test";
import assert from "node:assert/strict";
import { QueryClient } from "@tanstack/react-query";
import {
  applyOptimisticDealPatch,
  dealsForPipelineQueryKey,
  type Deal,
  type DealsListResponse,
} from "./hooks.js";

function makeDeal(id: string, stageId: string, name = id): Deal {
  return {
    id,
    name,
    pipelineId: "pipe_test",
    stageId,
    stageEnteredAt: "2026-05-01T00:00:00.000Z",
    accountId: null,
    primaryPersonId: null,
    amount: null,
    currency: null,
    expectedCloseDate: null,
    probability: null,
    ownerUserId: null,
    lostReason: null,
    status: "active",
    createdAt: "2026-05-01T00:00:00.000Z",
    updatedAt: "2026-05-01T00:00:00.000Z",
  };
}

function seed(qc: QueryClient, pipelineId: string, deals: Deal[]) {
  const response: DealsListResponse = { items: deals, nextCursor: null };
  qc.setQueryData(dealsForPipelineQueryKey(pipelineId), response);
}

test("applyOptimisticDealPatch moves a deal across stages in cache", () => {
  const qc = new QueryClient();
  const d1 = makeDeal("deal_a", "stag_1");
  const d2 = makeDeal("deal_b", "stag_2");
  seed(qc, "pipe_test", [d1, d2]);

  applyOptimisticDealPatch(qc, "pipe_test", "deal_a", {
    stageId: "stag_3",
  });

  const cached = qc.getQueryData<DealsListResponse>(
    dealsForPipelineQueryKey("pipe_test"),
  );
  assert.ok(cached);
  const moved = cached.items.find((d) => d.id === "deal_a");
  const untouched = cached.items.find((d) => d.id === "deal_b");
  assert.equal(moved?.stageId, "stag_3");
  assert.equal(untouched?.stageId, "stag_2");
});

test("snapshot restores cache when rollback runs", () => {
  const qc = new QueryClient();
  const d1 = makeDeal("deal_a", "stag_1");
  const d2 = makeDeal("deal_b", "stag_2");
  seed(qc, "pipe_test", [d1, d2]);

  const ctx = applyOptimisticDealPatch(qc, "pipe_test", "deal_a", {
    stageId: "stag_3",
  });
  // Simulate server error: rollback by restoring every snapshot.
  for (const [key, snapshot] of ctx.snapshots) {
    qc.setQueryData(key, snapshot);
  }

  const restored = qc.getQueryData<DealsListResponse>(
    dealsForPipelineQueryKey("pipe_test"),
  );
  assert.ok(restored);
  assert.equal(restored.items.find((d) => d.id === "deal_a")?.stageId, "stag_1");
  assert.equal(restored.items.find((d) => d.id === "deal_b")?.stageId, "stag_2");
});

test("patch touches every cached deals query for the pipeline", () => {
  const qc = new QueryClient();
  const d1 = makeDeal("deal_a", "stag_1");
  // Two distinct filter variants cached at different keys; both should
  // be reconciled by the optimistic patch so the user sees consistent
  // state across whatever view raised the mutation.
  qc.setQueryData(
    dealsForPipelineQueryKey("pipe_test", { filter: { search: "" } }),
    { items: [d1], nextCursor: null } satisfies DealsListResponse,
  );
  qc.setQueryData(
    dealsForPipelineQueryKey("pipe_test", { filter: { search: "deal" } }),
    { items: [d1], nextCursor: null } satisfies DealsListResponse,
  );
  // Variant with a different cursor must also reconcile so a paginated
  // list stays consistent with the optimistic move.
  qc.setQueryData(
    dealsForPipelineQueryKey("pipe_test", { cursor: "next" }),
    { items: [d1], nextCursor: null } satisfies DealsListResponse,
  );

  applyOptimisticDealPatch(qc, "pipe_test", "deal_a", { stageId: "stag_X" });

  const a = qc.getQueryData<DealsListResponse>(
    dealsForPipelineQueryKey("pipe_test", { filter: { search: "" } }),
  );
  const b = qc.getQueryData<DealsListResponse>(
    dealsForPipelineQueryKey("pipe_test", { filter: { search: "deal" } }),
  );
  const c = qc.getQueryData<DealsListResponse>(
    dealsForPipelineQueryKey("pipe_test", { cursor: "next" }),
  );
  assert.equal(a?.items[0]?.stageId, "stag_X");
  assert.equal(b?.items[0]?.stageId, "stag_X");
  assert.equal(c?.items[0]?.stageId, "stag_X");
});

test("patch ignores other pipelines' caches", () => {
  const qc = new QueryClient();
  const owned = makeDeal("deal_a", "stag_1");
  const other = makeDeal("deal_z", "stag_X");
  seed(qc, "pipe_test", [owned]);
  seed(qc, "pipe_other", [other]);

  applyOptimisticDealPatch(qc, "pipe_test", "deal_a", { stageId: "stag_2" });

  const otherCache = qc.getQueryData<DealsListResponse>(
    dealsForPipelineQueryKey("pipe_other"),
  );
  assert.equal(otherCache?.items[0]?.stageId, "stag_X");
});
