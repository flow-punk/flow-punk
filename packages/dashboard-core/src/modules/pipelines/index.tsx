import type { DashboardModule } from "../types.js";
import { Icon } from "@flowpunk-indie/dashboard-ui";
import { PipelinesKanban } from "./kanban.js";

/**
 * Pipelines module. Surfaces the pipeline service's pipelines / stages
 * / deals collections as a kanban board.
 *
 * Edition-agnostic per ADR-011 — no runtime edition branching. Phase 4
 * intentionally ships zero managed divergence; if managed later adds a
 * "Forecast" tab or similar, it lands as a slot filler from
 * `dashboard-extensions`, not an `if (managed)` branch.
 */
export const pipelinesModule: DashboardModule = {
  id: "pipelines",
  nav: [
    {
      id: "workspace.pipelines",
      label: "Workspace",
      items: [
        {
          id: "pipelines",
          label: "Pipelines",
          to: "/pipelines",
          icon: ({ className }) => (
            <Icon name="pipeline" className={className} />
          ),
        },
      ],
    },
  ],
  routes: [{ path: "/pipelines", component: PipelinesKanban }],
};

export { PipelinesKanban } from "./kanban.js";
export { PipelinePicker } from "./picker.js";
export { DealDialog } from "./deal-dialog.js";
export {
  usePipelines,
  usePipeline,
  useStagesForPipeline,
  useDealsForPipeline,
  useCreateDeal,
  useUpdateDeal,
  useDeleteDeal,
  applyOptimisticDealPatch,
  invalidateDealsForPipeline,
  PipelinesError,
  PIPELINES_QUERY_KEY,
  STAGES_QUERY_KEY,
  DEALS_QUERY_KEY,
  pipelineQueryKey,
  stagesForPipelineQueryKey,
  dealsForPipelineQueryKey,
  dealQueryKey,
  type Pipeline,
  type Stage,
  type Deal,
  type DealsFilter,
  type UseDealsOptions,
  type CreateDealInput,
  type UpdateDealInput,
  type PipelinesListResponse,
  type StagesListResponse,
  type DealsListResponse,
  type StageTerminalKind,
} from "./hooks.js";
