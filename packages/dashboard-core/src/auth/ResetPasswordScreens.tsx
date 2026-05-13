import { useState, type FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button, Input, Label } from "@flowpunk-indie/dashboard-ui";
import { useApiOrigin } from "./api-origin.js";
import { requestPasswordReset, resetPassword, SignInError } from "./api.js";

/**
 * "Forgot password" — collect an email and trigger better-auth's
 * password-reset flow. Better-auth handles the email send via its own
 * email-provider hook; we just kick it off and surface success.
 */
export function ForgotPasswordScreen({
  resetCallbackURL,
  onBack,
}: {
  /** The URL better-auth's email links back to. Defaults to the
   *  current dashboard origin + `/login/reset/confirm`. */
  resetCallbackURL?: string;
  onBack?: () => void;
}) {
  const apiOrigin = useApiOrigin();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      requestPasswordReset(
        apiOrigin,
        email,
        resetCallbackURL ??
          (typeof window !== "undefined"
            ? window.location.origin + "/login/reset/confirm"
            : "/login/reset/confirm"),
      ),
    onSuccess: () => setSent(true),
    onError: (err: unknown) =>
      setError(err instanceof SignInError ? err.message : "request failed"),
  });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email) return;
    mutation.mutate();
  };

  return (
    <div className="grid min-h-screen place-items-center bg-background-muted px-5 py-10">
      <div className="flex w-full max-w-[380px] flex-col gap-6">
        <h1 className="m-0 text-center text-[22px] font-semibold tracking-tight">
          Reset your password
        </h1>
        {sent ? (
          <p className="text-center text-[13.5px] text-foreground-muted">
            If <strong>{email}</strong> has an account, we sent it a link to
            reset the password. The link expires in 30 minutes.
          </p>
        ) : (
          <form className="flex flex-col gap-3.5" onSubmit={onSubmit}>
            <div>
              <Label htmlFor="reset-email" className="mb-1.5 block">
                Email
              </Label>
              <Input
                id="reset-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
              />
            </div>
            <Button
              type="submit"
              className="w-full"
              disabled={mutation.isPending || !email}
            >
              {mutation.isPending ? "Sending…" : "Send reset link"}
            </Button>
          </form>
        )}
        {error && (
          <p role="alert" className="text-center text-[13px] text-destructive">
            {error}
          </p>
        )}
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="text-center text-[13px] text-foreground-muted hover:text-foreground"
          >
            ← Back to sign-in
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * "Set new password" — better-auth's email link lands here with a
 * `?token=…` query param. The screen captures the new password and
 * exchanges the token for a session cookie via better-auth.
 */
export function ResetPasswordConfirmScreen({
  token,
  onDone,
}: {
  token: string;
  onDone?: () => void;
}) {
  const apiOrigin = useApiOrigin();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: () => resetPassword(apiOrigin, token, password),
    onSuccess: () => onDone?.(),
    onError: (err: unknown) =>
      setError(err instanceof SignInError ? err.message : "reset failed"),
  });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!password) return;
    mutation.mutate();
  };

  return (
    <div className="grid min-h-screen place-items-center bg-background-muted px-5 py-10">
      <div className="flex w-full max-w-[380px] flex-col gap-6">
        <h1 className="m-0 text-center text-[22px] font-semibold tracking-tight">
          Choose a new password
        </h1>
        <form className="flex flex-col gap-3.5" onSubmit={onSubmit}>
          <div>
            <Label htmlFor="new-password" className="mb-1.5 block">
              New password
            </Label>
            <Input
              id="new-password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoFocus
            />
          </div>
          <Button
            type="submit"
            className="w-full"
            disabled={mutation.isPending || !password}
          >
            {mutation.isPending ? "Saving…" : "Save password"}
          </Button>
        </form>
        {error && (
          <p role="alert" className="text-center text-[13px] text-destructive">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
