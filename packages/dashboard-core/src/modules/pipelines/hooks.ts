/**
 * Data hooks for the pipelines module. Wire to pipeline-core's
 * `/api/v1/pipelines/*`, `/api/v1/stages*`, and `/api/v1/deals*`
 * surfaces through the gateway.
 *
 * Field names mirror `indie/packages/db/src/schema/pipelines.ts`,
 * `stages.ts`, and `deals.ts`. The pipeline-core handlers return
 * `{ items, nextCursor }` for list endpoints and `{ pipeline }` /
 * `{ stage }` / `{ deal }` envelopes for single-row endpoints (see
 * `indie/packages/pipeline-core/src/handlers/*`).
 *
 * Stages are listed via `/api/v1/stages?pipelineId=…` (a required
 * query param); deals are listed via `/api/v1/deals?pipelineId=…`.
 * The move-stage primitive is `PATCH /api/v1/deals/:id` with
 * `{ stageId }`.
 */
import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";
import { useApiOrigin } from "../../auth/api-origin.js";
import { gatewayFetch } from "../../api/index.js";

// ─── Types ────────────────────────────────────────────────────────────

export type StageTerminalKind = "won" | "lost" | null;

export interface Pipeline {
  id: string;
  name: string;
  description: string | null;
  isDefault: number;
  status: "active" | "deleted";
  createdAt: string;
  updatedAt: string;
}

export interface Stage {
  id: string;
  pipelineId: string;
  name: string;
  position: number;
  terminalKind: StageTerminalKind;
  probability: number | null;
  status: "active" | "deleted";
  createdAt: string;
  updatedAt: string;
}

export interface Deal {
  id: string;
  name: string;
  pipelineId: string;
  stageId: string;
  stageEnteredAt: string;
  accountId: string | null;
  primaryPersonId: string | null;
  amount: number | null;
  currency: string | null;
  expectedCloseDate: string | null;
  probability: number | null;
  ownerUserId: string | null;
  lostReason: string | null;
  status: "active" | "deleted";
  createdAt: string;
  updatedAt: string;
}

export interface PipelinesListResponse {
  items: Pipeline[];
  nextCursor: string | null;
}
export interface StagesListResponse {
  items: Stage[];
  nextCursor: string | null;
}
export interface DealsListResponse {
  items: Deal[];
  nextCursor: string | null;
}

// ─── Query keys ───────────────────────────────────────────────────────

export const PIPELINES_QUERY_KEY = ["pipelines"] as const;
export const pipelineQueryKey = (id: string) => ["pipelines", id] as const;

export const STAGES_QUERY_KEY = ["stages"] as const;
export const stagesForPipelineQueryKey = (pipelineId: string) =>
  ["stages", pipelineId] as const;

export const DEALS_QUERY_KEY = ["deals"] as const;
export interface DealsFilter {
  /** Optional client-side text filter applied on top of the server list. */
  search?: string;
}
export interface DealsQueryParams {
  cursor?: string | null;
  limit?: number | null;
  filter?: DealsFilter;
}
/**
 * Cursor + limit are included so paginated variants don't collide in
 * the cache. Optimistic update + invalidation use the
 * `["deals", pipelineId]` prefix so every variant is reconciled in
 * one shot (see `applyOptimisticDealPatch`).
 */
export const dealsForPipelineQueryKey = (
  pipelineId: string,
  params?: DealsQueryParams,
) =>
  [
    "deals",
    pipelineId,
    {
      cursor: params?.cursor ?? null,
      limit: params?.limit ?? null,
      filter: params?.filter ?? {},
    },
  ] as const;
export const dealQueryKey = (id: string) => ["deals", "id", id] as const;

// ─── Pipelines ────────────────────────────────────────────────────────

export function usePipelines(): UseQueryResult<PipelinesListResponse> {
  const apiOrigin = useApiOrigin();
  return useQuery({
    queryKey: PIPELINES_QUERY_KEY,
    queryFn: async () => {
      const res = await gatewayFetch({
        apiOrigin,
        path: "/api/v1/pipelines",
      });
      if (!res.ok) {
        throw new PipelinesError(
          `pipelines list failed (${res.status})`,
          `HTTP_${res.status}`,
          res.status,
        );
      }
      return (await res.json()) as PipelinesListResponse;
    },
  });
}

export function usePipeline(id: string | null): UseQueryResult<Pipeline> {
  const apiOrigin = useApiOrigin();
  return useQuery({
    enabled: !!id,
    queryKey: id ? pipelineQueryKey(id) : ["pipelines", "_disabled"],
    queryFn: async () => {
      const res = await gatewayFetch({
        apiOrigin,
        path: `/api/v1/pipelines/${id}`,
      });
      if (!res.ok) {
        throw new PipelinesError(
          `pipeline fetch failed (${res.status})`,
          `HTTP_${res.status}`,
          res.status,
        );
      }
      const body = (await res.json()) as { pipeline: Pipeline };
      return body.pipeline;
    },
  });
}

// ─── Stages ───────────────────────────────────────────────────────────

export function useStagesForPipeline(
  pipelineId: string | null,
): UseQueryResult<StagesListResponse> {
  const apiOrigin = useApiOrigin();
  return useQuery({
    enabled: !!pipelineId,
    queryKey: pipelineId
      ? stagesForPipelineQueryKey(pipelineId)
      : ["stages", "_disabled"],
    queryFn: async () => {
      const search = new URLSearchParams({ pipelineId: pipelineId! });
      const res = await gatewayFetch({
        apiOrigin,
        path: `/api/v1/stages?${search.toString()}`,
      });
      if (!res.ok) {
        throw new PipelinesError(
          `stages list failed (${res.status})`,
          `HTTP_${res.status}`,
          res.status,
        );
      }
      return (await res.json()) as StagesListResponse;
    },
  });
}

// ─── Deals (list + CRUD) ──────────────────────────────────────────────

export interface UseDealsOptions {
  cursor?: string | null;
  limit?: number;
  filter?: DealsFilter;
}

export function useDealsForPipeline(
  pipelineId: string | null,
  options: UseDealsOptions = {},
): UseQueryResult<DealsListResponse> {
  const apiOrigin = useApiOrigin();
  return useQuery({
    enabled: !!pipelineId,
    queryKey: pipelineId
      ? dealsForPipelineQueryKey(pipelineId, {
          cursor: options.cursor ?? null,
          limit: options.limit ?? null,
          filter: options.filter,
        })
      : ["deals", "_disabled"],
    queryFn: async () => {
      const search = new URLSearchParams({ pipelineId: pipelineId! });
      if (options.cursor) search.set("cursor", options.cursor);
      if (options.limit) search.set("limit", String(options.limit));
      const res = await gatewayFetch({
        apiOrigin,
        path: `/api/v1/deals?${search.toString()}`,
      });
      if (!res.ok) {
        throw new PipelinesError(
          `deals list failed (${res.status})`,
          `HTTP_${res.status}`,
          res.status,
        );
      }
      return (await res.json()) as DealsListResponse;
    },
  });
}

/**
 * Create input. Mirrors `DealCreate` in the openapi dump — `name`,
 * `pipelineId`, `stageId`, and `stageEnteredAt` are required; the rest
 * are optional and may be null.
 */
export interface CreateDealInput {
  name: string;
  pipelineId: string;
  stageId: string;
  stageEnteredAt: string;
  accountId?: string | null;
  primaryPersonId?: string | null;
  amount?: number | null;
  currency?: string | null;
  expectedCloseDate?: string | null;
  probability?: number | null;
  ownerUserId?: string | null;
}

export function useCreateDeal(): UseMutationResult<
  Deal,
  Error,
  CreateDealInput
> {
  const apiOrigin = useApiOrigin();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input) => {
      const res = await gatewayFetch({
        apiOrigin,
        path: "/api/v1/deals",
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        throw await pipelinesErrorFromResponse(res, "create deal failed");
      }
      const body = (await res.json()) as { deal: Deal };
      return body.deal;
    },
    onSuccess: (deal) => {
      invalidateDealsForPipeline(qc, deal.pipelineId);
      qc.setQueryData(dealQueryKey(deal.id), deal);
    },
  });
}

/**
 * PATCH input. `stageId` covers the drag-and-drop move-stage subcase;
 * other fields are direct edits from the deal-dialog. Server rejects
 * anything outside `ALLOWED_PATCH_FIELDS` in `deals.ts` as 400.
 */
export interface UpdateDealInput {
  id: string;
  /** Used by the optimistic-update path to locate the deal in cache. */
  pipelineId: string;
  patch: Partial<{
    name: string;
    stageId: string;
    accountId: string | null;
    primaryPersonId: string | null;
    amount: number | null;
    currency: string | null;
    expectedCloseDate: string | null;
    probability: number | null;
    ownerUserId: string | null;
    lostReason: string | null;
  }>;
}

interface OptimisticContext {
  /** Snapshot of every deals-list query for this pipeline at mutate time. */
  snapshots: Array<readonly [readonly unknown[], DealsListResponse | undefined]>;
  pipelineId: string;
}

export function useUpdateDeal(): UseMutationResult<
  Deal,
  Error,
  UpdateDealInput,
  OptimisticContext
> {
  const apiOrigin = useApiOrigin();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }) => {
      const res = await gatewayFetch({
        apiOrigin,
        path: `/api/v1/deals/${id}`,
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        throw await pipelinesErrorFromResponse(res, "update deal failed");
      }
      const body = (await res.json()) as { deal: Deal };
      return body.deal;
    },
    onMutate: async (input) =>
      applyOptimisticDealPatch(qc, input.pipelineId, input.id, input.patch),
    onError: (_err, _input, context) => {
      if (!context) return;
      for (const [key, snapshot] of context.snapshots) {
        qc.setQueryData(key, snapshot);
      }
    },
    onSettled: (_deal, _err, input) => {
      invalidateDealsForPipeline(qc, input.pipelineId);
      qc.invalidateQueries({ queryKey: dealQueryKey(input.id) });
    },
  });
}

export function useDeleteDeal(): UseMutationResult<
  void,
  Error,
  { id: string; pipelineId: string }
> {
  const apiOrigin = useApiOrigin();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }) => {
      const res = await gatewayFetch({
        apiOrigin,
        path: `/api/v1/deals/${id}`,
        method: "DELETE",
      });
      if (!res.ok) {
        throw await pipelinesErrorFromResponse(res, "delete deal failed");
      }
    },
    onSuccess: (_void, { pipelineId, id }) => {
      invalidateDealsForPipeline(qc, pipelineId);
      qc.removeQueries({ queryKey: dealQueryKey(id) });
    },
  });
}

// ─── Optimistic-update helpers (exported for tests) ───────────────────

/**
 * Snapshot every deals list cached under `["deals", pipelineId, …]`,
 * then apply `patch` to any cached deal whose `id` matches. Returns the
 * snapshots so the caller (or `onError`) can restore them on failure.
 *
 * Exported for the dnd unit test — see `dnd.test.ts`.
 */
export function applyOptimisticDealPatch(
  qc: QueryClient,
  pipelineId: string,
  dealId: string,
  patch: UpdateDealInput["patch"],
): OptimisticContext {
  const matches = qc.getQueriesData<DealsListResponse>({
    queryKey: ["deals", pipelineId],
  });
  const snapshots: OptimisticContext["snapshots"] = matches.map(
    ([key, value]) => [key, value] as const,
  );
  for (const [key, value] of matches) {
    if (!value) continue;
    const nextItems = value.items.map((d) =>
      d.id === dealId ? { ...d, ...patch } : d,
    );
    qc.setQueryData(key, { ...value, items: nextItems });
  }
  return { snapshots, pipelineId };
}

export function invalidateDealsForPipeline(
  qc: QueryClient,
  pipelineId: string,
): void {
  qc.invalidateQueries({ queryKey: ["deals", pipelineId] });
}

// ─── Errors ───────────────────────────────────────────────────────────

async function pipelinesErrorFromResponse(
  res: Response,
  fallback: string,
): Promise<PipelinesError> {
  const body = (await res.json().catch(() => ({}))) as {
    error?: { code?: string; message?: string };
  };
  return new PipelinesError(
    body.error?.message ?? body.error?.code ?? `${fallback} (${res.status})`,
    body.error?.code ?? `HTTP_${res.status}`,
    res.status,
  );
}

export class PipelinesError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "PipelinesError";
  }
}
