import { useEffect, useState } from "react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Icon,
  Input,
  Label,
  toast,
} from "@flowpunk-indie/dashboard-ui";
import {
  useCreateDeal,
  useDeleteDeal,
  useUpdateDeal,
  type CreateDealInput,
  type Deal,
  type Stage,
  type UpdateDealInput,
} from "./hooks.js";

/**
 * Editable form shape. Mirrors the columns in `deals.ts` exposed
 * through `DealCreate` / `DealPatch` in the openapi dump. Only the
 * subset users edit through the dialog is here; the rest (status,
 * audit columns, stageEnteredAt for moves) is server-managed.
 */
interface DealForm {
  name: string;
  stageId: string;
  amount: string;
  currency: string;
  expectedCloseDate: string;
  probability: string;
  ownerUserId: string;
  accountId: string;
  primaryPersonId: string;
}

function emptyForm(initialStageId: string): DealForm {
  return {
    name: "",
    stageId: initialStageId,
    amount: "",
    currency: "",
    expectedCloseDate: "",
    probability: "",
    ownerUserId: "",
    accountId: "",
    primaryPersonId: "",
  };
}

function formFromDeal(d: Deal): DealForm {
  return {
    name: d.name,
    stageId: d.stageId,
    amount: d.amount == null ? "" : String(d.amount),
    currency: d.currency ?? "",
    expectedCloseDate: d.expectedCloseDate ?? "",
    probability: d.probability == null ? "" : String(d.probability),
    ownerUserId: d.ownerUserId ?? "",
    accountId: d.accountId ?? "",
    primaryPersonId: d.primaryPersonId ?? "",
  };
}

function nullableNumber(s: string): number | null {
  const trimmed = s.trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

function nullableString(s: string): string | null {
  const trimmed = s.trim();
  return trimmed === "" ? null : trimmed;
}

export type DealDialogMode =
  | { kind: "create"; pipelineId: string; stageId: string }
  | { kind: "edit"; deal: Deal };

export interface DealDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: DealDialogMode | null;
  stages: Stage[];
}

export function DealDialog({
  open,
  onOpenChange,
  mode,
  stages,
}: DealDialogProps) {
  const [form, setForm] = useState<DealForm>(() =>
    mode?.kind === "edit"
      ? formFromDeal(mode.deal)
      : emptyForm(mode?.kind === "create" ? mode.stageId : ""),
  );
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!mode) return;
    setForm(
      mode.kind === "edit"
        ? formFromDeal(mode.deal)
        : emptyForm(mode.stageId),
    );
    setConfirmDelete(false);
  }, [mode]);

  const createDeal = useCreateDeal();
  const updateDeal = useUpdateDeal();
  const deleteDeal = useDeleteDeal();

  const submitting =
    createDeal.isPending || updateDeal.isPending || deleteDeal.isPending;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mode) return;
    const name = form.name.trim();
    if (!name) {
      toast.error("Name is required");
      return;
    }
    if (!form.stageId) {
      toast.error("Pick a stage");
      return;
    }
    try {
      if (mode.kind === "create") {
        const input: CreateDealInput = {
          name,
          pipelineId: mode.pipelineId,
          stageId: form.stageId,
          stageEnteredAt: new Date().toISOString(),
          accountId: nullableString(form.accountId),
          primaryPersonId: nullableString(form.primaryPersonId),
          amount: nullableNumber(form.amount),
          currency: nullableString(form.currency),
          expectedCloseDate: nullableString(form.expectedCloseDate),
          probability: nullableNumber(form.probability),
          ownerUserId: nullableString(form.ownerUserId),
        };
        await createDeal.mutateAsync(input);
        toast.success("Deal created");
      } else {
        const patch: UpdateDealInput["patch"] = {
          name,
          stageId: form.stageId,
          accountId: nullableString(form.accountId),
          primaryPersonId: nullableString(form.primaryPersonId),
          amount: nullableNumber(form.amount),
          currency: nullableString(form.currency),
          expectedCloseDate: nullableString(form.expectedCloseDate),
          probability: nullableNumber(form.probability),
          ownerUserId: nullableString(form.ownerUserId),
        };
        await updateDeal.mutateAsync({
          id: mode.deal.id,
          pipelineId: mode.deal.pipelineId,
          patch,
        });
        toast.success("Deal updated");
      }
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    }
  };

  const onDelete = async () => {
    if (!mode || mode.kind !== "edit") return;
    try {
      await deleteDeal.mutateAsync({
        id: mode.deal.id,
        pipelineId: mode.deal.pipelineId,
      });
      toast.success("Deal deleted");
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    }
  };

  const title = mode?.kind === "edit" ? "Edit deal" : "New deal";
  const stagesForPicker = mode?.kind === "edit"
    ? stages.filter((s) => s.pipelineId === mode.deal.pipelineId)
    : stages;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {mode?.kind === "edit"
              ? "Update fields and save, or delete the deal."
              : "Create a new deal in the selected pipeline."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="grid gap-4">
          <Field label="Name" htmlFor="deal-name">
            <Input
              id="deal-name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              autoFocus
            />
          </Field>

          <Field label="Stage" htmlFor="deal-stage">
            <select
              id="deal-stage"
              value={form.stageId}
              onChange={(e) => setForm({ ...form, stageId: e.target.value })}
              className="h-9 rounded-[var(--radius)] border border-border bg-background px-2 text-sm"
            >
              {stagesForPicker.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Amount" htmlFor="deal-amount">
              <Input
                id="deal-amount"
                inputMode="decimal"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                placeholder="0"
              />
            </Field>
            <Field label="Currency" htmlFor="deal-currency">
              <Input
                id="deal-currency"
                value={form.currency}
                onChange={(e) =>
                  setForm({ ...form, currency: e.target.value })
                }
                placeholder="USD"
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Expected close" htmlFor="deal-close">
              <Input
                id="deal-close"
                type="date"
                value={form.expectedCloseDate}
                onChange={(e) =>
                  setForm({ ...form, expectedCloseDate: e.target.value })
                }
              />
            </Field>
            <Field label="Probability" htmlFor="deal-prob">
              <Input
                id="deal-prob"
                inputMode="decimal"
                value={form.probability}
                onChange={(e) =>
                  setForm({ ...form, probability: e.target.value })
                }
                placeholder="0–1"
              />
            </Field>
          </div>

          <Field label="Owner user ID" htmlFor="deal-owner">
            <Input
              id="deal-owner"
              value={form.ownerUserId}
              onChange={(e) =>
                setForm({ ...form, ownerUserId: e.target.value })
              }
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Account ID" htmlFor="deal-account">
              <Input
                id="deal-account"
                value={form.accountId}
                onChange={(e) =>
                  setForm({ ...form, accountId: e.target.value })
                }
              />
            </Field>
            <Field label="Primary person ID" htmlFor="deal-person">
              <Input
                id="deal-person"
                value={form.primaryPersonId}
                onChange={(e) =>
                  setForm({ ...form, primaryPersonId: e.target.value })
                }
              />
            </Field>
          </div>

          <DialogFooter className="mt-2">
            {mode?.kind === "edit" && (
              <div className="mr-auto">
                {confirmDelete ? (
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] text-foreground-muted">
                      Delete this deal?
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="border-destructive text-destructive hover:bg-destructive/10"
                      onClick={onDelete}
                      disabled={submitting}
                    >
                      Confirm
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setConfirmDelete(false)}
                    >
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setConfirmDelete(true)}
                  >
                    <Icon name="trash" /> Delete
                  </Button>
                )}
              </div>
            )}
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {mode?.kind === "edit" ? "Save" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}
