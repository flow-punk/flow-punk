import { useMemo, useState } from "react";
import {
  Button,
  Icon,
  KanbanDeal,
  KanbanStage,
  PageHeader,
  toast,
} from "@flowpunk-indie/dashboard-ui";
import {
  useDealsForPipeline,
  usePipelines,
  useStagesForPipeline,
  useUpdateDeal,
  type Deal,
  type Stage,
} from "./hooks.js";
import { PipelinePicker, useSelectedPipelineId } from "./picker.js";
import { DealDialog, type DealDialogMode } from "./deal-dialog.js";
import {
  DraggableDealCard,
  DroppableStageColumn,
  KanbanBoardDnd,
  type MoveDealArgs,
} from "./dnd.js";

function fmtCurrency(value: number, currency: string | null): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currency ?? "USD",
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `${currency ?? ""} ${value}`.trim();
  }
}

function stageSum(deals: Deal[]): number {
  return deals.reduce((acc, d) => acc + (d.amount ?? 0), 0);
}

/**
 * Pipelines kanban — port of `ui-temp/list-views.jsx` PipelinesView.
 * Visual structure:
 *
 *   [Header: "Pipelines" + "New deal"]
 *   [PipelinePicker chips]
 *   [Horizontal scroll of <KanbanStage> columns, each with cards]
 *
 * DnD scope: drag a deal between stages within the selected pipeline.
 * Cross-pipeline drag + stage reorder are out of scope (plan §Phase 4).
 */
export function PipelinesKanban() {
  const { data: pipelinesData, isLoading: pipelinesLoading } = usePipelines();
  const pipelines = pipelinesData?.items;
  const [selectedId, setSelectedId] = useSelectedPipelineId(pipelines);
  const { data: stagesData } = useStagesForPipeline(selectedId);
  const { data: dealsData } = useDealsForPipeline(selectedId, { limit: 200 });

  const stages = useMemo(
    () =>
      [...(stagesData?.items ?? [])].sort((a, b) => a.position - b.position),
    [stagesData?.items],
  );
  const deals = dealsData?.items ?? [];
  const dealsByStage = useMemo(() => {
    const map = new Map<string, Deal[]>();
    for (const s of stages) map.set(s.id, []);
    for (const d of deals) {
      const arr = map.get(d.stageId);
      if (arr) arr.push(d);
    }
    return map;
  }, [stages, deals]);

  const totalOpen = deals.length;
  const weightedTotal = deals.reduce(
    (acc, d) => acc + (d.amount ?? 0) * (d.probability ?? 1),
    0,
  );
  const subtitle = pipelinesLoading
    ? "Loading…"
    : `${totalOpen} open deals · ${fmtCurrency(weightedTotal, null)} weighted`;

  const [dialogMode, setDialogMode] = useState<DealDialogMode | null>(null);
  const updateDeal = useUpdateDeal();

  const openCreateForStage = (stage: Stage) => {
    if (!selectedId) return;
    setDialogMode({ kind: "create", pipelineId: selectedId, stageId: stage.id });
  };
  const openEditDeal = (deal: Deal) => {
    setDialogMode({ kind: "edit", deal });
  };
  const openCreateTop = () => {
    if (!selectedId) return;
    const firstStageId = stages[0]?.id;
    if (!firstStageId) {
      toast.error("Add a stage to this pipeline first");
      return;
    }
    setDialogMode({
      kind: "create",
      pipelineId: selectedId,
      stageId: firstStageId,
    });
  };

  const handleMoveDeal = (args: MoveDealArgs) => {
    if (!selectedId) return;
    updateDeal.mutate(
      {
        id: args.dealId,
        pipelineId: selectedId,
        patch: { stageId: args.toStageId },
      },
      {
        onError: () => {
          toast.error("Couldn't move deal. Try again.");
        },
      },
    );
  };

  const stageNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of stages) m.set(s.id, s.name);
    return m;
  }, [stages]);
  const dealNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const d of deals) m.set(d.id, d.name);
    return m;
  }, [deals]);

  return (
    <div className="flex flex-col gap-6 px-6 py-6">
      <PageHeader
        title="Pipelines"
        subtitle={subtitle}
        actions={
          <Button onClick={openCreateTop} disabled={!selectedId || stages.length === 0}>
            <Icon name="plus" /> New deal
          </Button>
        }
      />

      {pipelines && pipelines.length > 0 ? (
        <PipelinePicker
          pipelines={pipelines}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />
      ) : (
        <p className="text-[13px] text-foreground-muted">
          {pipelinesLoading ? "Loading pipelines…" : "No pipelines yet."}
        </p>
      )}

      <KanbanBoardDnd
        resolveStageName={(id) => stageNameById.get(id) ?? id}
        resolveDealName={(id) => dealNameById.get(id) ?? id}
        onMoveDeal={handleMoveDeal}
      >
        <div className="flex gap-3 overflow-x-auto pb-4">
          {stages.map((stage) => {
            const stageDeals = dealsByStage.get(stage.id) ?? [];
            return (
              <div key={stage.id} className="min-w-[280px] flex-1">
                <DroppableStageColumn stageId={stage.id}>
                  <KanbanStage
                    name={stage.name}
                    count={stageDeals.length}
                    sum={fmtCurrency(stageSum(stageDeals), null)}
                  >
                    {stageDeals.map((deal) => (
                      <DraggableDealCard
                        key={deal.id}
                        dealId={deal.id}
                        stageId={stage.id}
                      >
                        {() => (
                          <KanbanDeal
                            name={deal.name}
                            meta={
                              <>
                                <span>
                                  {deal.amount != null
                                    ? fmtCurrency(deal.amount, deal.currency)
                                    : "—"}
                                </span>
                                <span>{deal.expectedCloseDate ?? ""}</span>
                              </>
                            }
                            onClick={() => openEditDeal(deal)}
                          />
                        )}
                      </DraggableDealCard>
                    ))}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="justify-start"
                      onClick={() => openCreateForStage(stage)}
                    >
                      <Icon name="plus" /> Add deal
                    </Button>
                  </KanbanStage>
                </DroppableStageColumn>
              </div>
            );
          })}
          {stages.length === 0 && selectedId && (
            <p className="text-[13px] text-foreground-muted">
              No stages on this pipeline yet.
            </p>
          )}
        </div>
      </KanbanBoardDnd>

      <DealDialog
        open={dialogMode != null}
        onOpenChange={(open) => {
          if (!open) setDialogMode(null);
        }}
        mode={dialogMode}
        stages={stages}
      />
    </div>
  );
}
