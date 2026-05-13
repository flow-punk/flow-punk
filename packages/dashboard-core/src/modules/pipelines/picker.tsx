import { useEffect, useState } from "react";
import { Button, Icon } from "@flowpunk-indie/dashboard-ui";
import type { Pipeline } from "./hooks.js";

const STORAGE_KEY = "dashboard.pipelines.selected";

/**
 * Reads the last-selected pipeline id from localStorage and reconciles
 * it against the live `pipelines` list. Falls back to the default
 * pipeline (or first one) if the stored id is no longer present.
 *
 * Returns `[selectedId, setSelectedId]`. The setter mirrors writes back
 * to localStorage so a reload preserves the choice. SSR-safe — reads
 * are guarded by `typeof window`.
 */
export function useSelectedPipelineId(
  pipelines: Pipeline[] | undefined,
): [string | null, (id: string) => void] {
  const [selectedId, setSelectedIdState] = useState<string | null>(null);

  useEffect(() => {
    if (!pipelines || pipelines.length === 0) return;
    const ids = new Set(pipelines.map((p) => p.id));
    let next: string | null = null;
    if (typeof window !== "undefined") {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored && ids.has(stored)) next = stored;
    }
    if (!next) {
      const def = pipelines.find((p) => p.isDefault === 1);
      next = def ? def.id : (pipelines[0]?.id ?? null);
    }
    setSelectedIdState((cur) => (cur && ids.has(cur) ? cur : next));
  }, [pipelines]);

  const setSelectedId = (id: string) => {
    setSelectedIdState(id);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, id);
    }
  };

  return [selectedId, setSelectedId];
}

export interface PipelinePickerProps {
  pipelines: Pipeline[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onAddPipeline?: () => void;
}

/**
 * Multi-pipeline picker chips. Visually mirrors ui-temp's
 * `PipelinesView` toolbar — a horizontal strip of chip-buttons with the
 * active pipeline highlighted, followed by an "Add pipeline" ghost
 * button when the caller wires `onAddPipeline`.
 */
export function PipelinePicker({
  pipelines,
  selectedId,
  onSelect,
  onAddPipeline,
}: PipelinePickerProps) {
  return (
    <div
      className="flex items-center gap-2 border-b border-border pb-3"
      role="tablist"
      aria-label="Pipelines"
    >
      {pipelines.map((p) => {
        const active = p.id === selectedId;
        return (
          <button
            key={p.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onSelect(p.id)}
            className={
              "rounded-full border px-3 py-1 text-[13px] font-medium transition-colors " +
              (active
                ? "border-accent bg-accent/10 text-accent"
                : "border-border bg-background text-foreground-muted hover:text-foreground")
            }
          >
            {p.name}
          </button>
        );
      })}
      {onAddPipeline && (
        <Button variant="ghost" size="sm" onClick={onAddPipeline}>
          <Icon name="plus" /> Add pipeline
        </Button>
      )}
    </div>
  );
}
