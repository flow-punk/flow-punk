import { useEffect, useState, type FormEvent } from "react";
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
  useCreateApiKey,
  useRotateApiKey,
  type ApiKey,
  type ApiKeyWithSecret,
  type CreateApiKeyInput,
  type RotateApiKeyInput,
} from "./hooks.js";

export interface CreateApiKeyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When set, the dialog is operating in rotate mode and pre-populates
   *  the form with the predecessor's label + scopes. Submitting revokes
   *  the predecessor and creates a fresh key referencing it via
   *  `rotatedFrom`. */
  rotateOf?: ApiKey;
}

/** Scope universe accepted by auth-core's `normalizeScopes`. */
const SCOPE_OPTIONS = ["read", "write"] as const;
type Scope = (typeof SCOPE_OPTIONS)[number];

interface RetryState {
  /** Predecessor id whose revocation already succeeded. */
  predecessorId: string;
  label: string;
  scopes: Scope[];
}

/**
 * Create-or-rotate dialog for an API key. The freshly-minted `fpk_*`
 * value is displayed exactly once (ADR-012 §"One-time display"). After
 * the user clicks Done the raw value is wiped from local state and the
 * dialog can never re-derive it.
 *
 * Hardening notes:
 *   - The secret is owned by this component's `useState` only — the
 *     imperative `useCreateApiKey().create` / `useRotateApiKey().rotate`
 *     helpers do NOT store it in React Query's cache (per ADR-012).
 *   - The secret is never logged, never piped through `toast`, never
 *     fed back into a query cache.
 *   - On rotate, a transient failure between revoke and create can
 *     leave the caller without an active key. The dialog surfaces a
 *     retry-create button that re-runs only the create step with the
 *     same `rotatedFrom` predecessor id (which is already revoked).
 *   - The list view never displays the raw value — it only ever has
 *     `prefix` (`fpk_xxxx`) as a partial identifier.
 */
export function CreateApiKeyDialog({
  open,
  onOpenChange,
  rotateOf,
}: CreateApiKeyDialogProps) {
  const { create } = useCreateApiKey();
  const { rotate, retryCreate } = useRotateApiKey();
  const isRotate = !!rotateOf;

  const [label, setLabel] = useState("");
  const [scopes, setScopes] = useState<Scope[]>(["read", "write"]);
  const [pending, setPending] = useState(false);
  const [created, setCreated] = useState<ApiKeyWithSecret | null>(null);
  const [retry, setRetry] = useState<RetryState | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) return;
    // Wipe everything the moment the dialog closes — covers Done, Esc,
    // click-outside, and unmount. The raw token never persists past
    // this point (ADR-012).
    setCreated(null);
    setRetry(null);
    setError(null);
    setLabel(rotateOf?.label ?? "");
    const seed = (rotateOf?.scopes ?? []).filter(
      (s): s is Scope => (SCOPE_OPTIONS as readonly string[]).includes(s),
    );
    setScopes(seed.length > 0 ? seed : ["read", "write"]);
  }, [open, rotateOf]);

  const toggleScope = (s: Scope) => {
    setScopes((current) =>
      current.includes(s) ? current.filter((x) => x !== s) : [...current, s],
    );
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const trimmedLabel = label.trim();
    if (!trimmedLabel || scopes.length === 0) return;

    setPending(true);
    try {
      const input: CreateApiKeyInput = { label: trimmedLabel, scopes };
      const result =
        isRotate && rotateOf
          ? await rotate({ ...input, id: rotateOf.id } as RotateApiKeyInput)
          : await create(input);
      setCreated(result);
      setRetry(null);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "request failed";
      if (isRotate && rotateOf) {
        // The revoke step may or may not have succeeded — auth-core's
        // `rotatedFrom` predicate makes the retry safe either way:
        //  - If revoke succeeded, retry-create with rotatedFrom passes.
        //  - If revoke failed, retry-create returns INVALID_ROTATED_FROM
        //    and the user can re-open rotate from the list.
        // The non-disruptive UX path is to offer the retry-create button
        // labelled with the predecessor's id.
        setRetry({
          predecessorId: rotateOf.id,
          label: trimmedLabel,
          scopes,
        });
      }
      setError(message);
    } finally {
      setPending(false);
    }
  };

  const retryCreateOnly = async () => {
    if (!retry) return;
    setError(null);
    setPending(true);
    try {
      const result = await retryCreate({
        id: retry.predecessorId,
        label: retry.label,
        scopes: retry.scopes,
      });
      setCreated(result);
      setRetry(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "request failed");
    } finally {
      setPending(false);
    }
  };

  const copyToken = async () => {
    if (!created || typeof navigator === "undefined" || !navigator.clipboard) {
      return;
    }
    try {
      await navigator.clipboard.writeText(created.token);
      toast.success("Key copied to clipboard");
    } catch {
      toast.error("Could not copy — select the value and copy manually");
    }
  };

  const done = () => {
    setCreated(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {!created ? (
          <form onSubmit={submit} className="flex flex-col gap-4">
            <DialogHeader>
              <DialogTitle>
                {isRotate ? "Rotate API key" : "Create API key"}
              </DialogTitle>
              <DialogDescription>
                {isRotate
                  ? "We'll revoke the existing key and issue a fresh value. The new value is shown once on the next screen."
                  : "Give the key a label and choose its access scopes. The full token is shown exactly once on the next screen."}
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-3">
              <div>
                <Label htmlFor="key-label" className="mb-1.5 block">
                  Label
                </Label>
                <Input
                  id="key-label"
                  type="text"
                  autoFocus
                  required
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="laptop, prod-ingest, ci-runner"
                />
              </div>
              <fieldset>
                <Label className="mb-1.5 block">Scopes</Label>
                <div className="flex flex-col gap-1.5">
                  {SCOPE_OPTIONS.map((s) => (
                    <label
                      key={s}
                      className="flex items-center gap-2 text-[13px]"
                    >
                      <input
                        type="checkbox"
                        checked={scopes.includes(s)}
                        onChange={() => toggleScope(s)}
                      />
                      <span className="font-mono">{s}</span>
                      <span className="text-foreground-subtle">
                        {s === "read"
                          ? "GET endpoints"
                          : "POST / PATCH / DELETE endpoints"}
                      </span>
                    </label>
                  ))}
                </div>
                {scopes.length === 0 && (
                  <p className="mt-1.5 text-[12px] text-destructive">
                    Pick at least one scope — the server rejects empty
                    scope lists.
                  </p>
                )}
              </fieldset>
            </div>
            {error && (
              <div className="rounded-[var(--radius)] border border-destructive/30 bg-destructive/5 p-3">
                <p role="alert" className="text-[13px] text-destructive">
                  {error}
                </p>
                {retry && (
                  <p className="mt-2 text-[12.5px] text-foreground-muted">
                    The previous key was revoked, but the replacement was not
                    created. Retry the create step now.
                  </p>
                )}
              </div>
            )}
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => onOpenChange(false)}
                disabled={pending}
              >
                Cancel
              </Button>
              {retry ? (
                <Button
                  type="button"
                  onClick={retryCreateOnly}
                  disabled={pending}
                >
                  {pending ? "Retrying…" : "Retry create"}
                </Button>
              ) : (
                <Button
                  type="submit"
                  disabled={pending || !label.trim() || scopes.length === 0}
                >
                  {pending
                    ? isRotate
                      ? "Rotating…"
                      : "Creating…"
                    : isRotate
                      ? "Rotate key"
                      : "Create key"}
                </Button>
              )}
            </DialogFooter>
          </form>
        ) : (
          <div className="flex flex-col gap-4">
            <DialogHeader>
              <DialogTitle>Save this key now</DialogTitle>
              <DialogDescription>
                This value is shown <strong>only once</strong>. Once you
                close this dialog we cannot show it again — store it in
                your password manager before continuing.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-2 rounded-[var(--radius)] border border-border bg-background-muted p-3">
              <div className="flex items-center justify-between gap-2">
                <code className="break-all text-[12.5px] font-mono">
                  {created.token}
                </code>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={copyToken}
                  aria-label="Copy key to clipboard"
                >
                  <Icon name="copy" />
                </Button>
              </div>
              <div className="text-[12px] text-foreground-subtle">
                Label: <span className="text-foreground">{created.label}</span>
                {" · "}
                Prefix:{" "}
                <span className="text-foreground font-mono">
                  {created.prefix}
                </span>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" onClick={done}>
                Done
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
