import { useMemo, type ReactNode } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";

/**
 * DnD wrapper for the pipelines kanban board. Provides:
 *
 * - `KanbanBoardDnd` — a DnD provider that emits a typed
 *   `onMoveDeal({ dealId, fromStageId, toStageId })` callback once a
 *   card is dropped on a different stage column. No-op for in-place
 *   drops.
 * - `DraggableDealCard` — wraps `KanbanDeal` (any child works); the
 *   card carries its `dealId` + `stageId` as drag data.
 * - `DroppableStageColumn` — wraps `KanbanStage`; the column carries
 *   its `stageId` + emits an a11y announcement when a card hovers.
 *
 * Library choice: `@dnd-kit` (per Phase 4 plan) for first-class a11y
 * (keyboard sensors, live-region announcements), React 19 support, and
 * no HTML5-DnD touch quirks.
 *
 * Scope: cross-stage drag within ONE pipeline only. Stage reorder and
 * cross-pipeline drag are explicitly out of scope (Phase 4 plan).
 */

interface DragData {
  dealId: string;
  stageId: string;
}

interface DropData {
  stageId: string;
}

export interface MoveDealArgs {
  dealId: string;
  fromStageId: string;
  toStageId: string;
}

export interface KanbanBoardDndProps {
  /**
   * Resolves an opaque stage id back to a display name; used by the
   * a11y announcement strings ("Acme Corp moved to Negotiation").
   */
  resolveStageName: (stageId: string) => string;
  /**
   * Resolves an opaque deal id back to a display name; also used by
   * announcements.
   */
  resolveDealName: (dealId: string) => string;
  onMoveDeal: (args: MoveDealArgs) => void;
  children: ReactNode;
}

export function KanbanBoardDnd({
  resolveStageName,
  resolveDealName,
  onMoveDeal,
  children,
}: KanbanBoardDndProps) {
  // KeyboardSensor uses its built-in coordinate-getter (25px arrow
  // steps + Space to pick up/drop). `sortableKeyboardCoordinates`
  // would require a SortableContext, which this board intentionally
  // does NOT use — deals are plain draggables, stages plain
  // droppables, since the scope is cross-stage move (not in-column
  // reorder).
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor),
  );

  const announcements = useMemo(
    () => ({
      onDragStart({ active }: { active: { id: string | number } }) {
        const dealName = resolveDealName(String(active.id));
        return `Picked up deal ${dealName}`;
      },
      onDragOver({
        active,
        over,
      }: {
        active: { id: string | number };
        over: { id: string | number } | null;
      }) {
        if (!over) return undefined;
        const dealName = resolveDealName(String(active.id));
        const stageName = resolveStageName(String(over.id));
        return `${dealName} over ${stageName}`;
      },
      onDragEnd({
        active,
        over,
      }: {
        active: { id: string | number };
        over: { id: string | number } | null;
      }) {
        if (!over) return `Dropped ${resolveDealName(String(active.id))}`;
        return `${resolveDealName(String(active.id))} moved to ${resolveStageName(String(over.id))}`;
      },
      onDragCancel({ active }: { active: { id: string | number } }) {
        return `Cancelled. ${resolveDealName(String(active.id))} returned.`;
      },
    }),
    [resolveDealName, resolveStageName],
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;
    const dragData = active.data.current as DragData | undefined;
    const dropData = over.data.current as DropData | undefined;
    if (!dragData || !dropData) return;
    if (dragData.stageId === dropData.stageId) return;
    onMoveDeal({
      dealId: dragData.dealId,
      fromStageId: dragData.stageId,
      toStageId: dropData.stageId,
    });
  };

  return (
    <DndContext
      sensors={sensors}
      onDragEnd={handleDragEnd}
      accessibility={{ announcements }}
    >
      {children}
    </DndContext>
  );
}

export interface DraggableDealCardProps {
  dealId: string;
  stageId: string;
  children: (api: { setNodeRef: (node: HTMLElement | null) => void; isDragging: boolean }) => ReactNode;
}

export function DraggableDealCard({
  dealId,
  stageId,
  children,
}: DraggableDealCardProps) {
  const data: DragData = { dealId, stageId };
  const { attributes, listeners, setNodeRef, isDragging, transform } =
    useDraggable({ id: dealId, data });

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      style={{
        transform: transform
          ? `translate3d(${transform.x}px, ${transform.y}px, 0)`
          : undefined,
        opacity: isDragging ? 0.5 : undefined,
      }}
    >
      {children({ setNodeRef, isDragging })}
    </div>
  );
}

export interface DroppableStageColumnProps {
  stageId: string;
  children: ReactNode;
}

export function DroppableStageColumn({
  stageId,
  children,
}: DroppableStageColumnProps) {
  const data: DropData = { stageId };
  const { setNodeRef, isOver } = useDroppable({ id: stageId, data });
  return (
    <div
      ref={setNodeRef}
      className={isOver ? "rounded-lg ring-2 ring-accent/40" : undefined}
    >
      {children}
    </div>
  );
}
