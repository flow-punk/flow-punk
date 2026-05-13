import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Button,
  Input,
  Label,
} from "@flowpunk-indie/dashboard-ui";
import { useApiOrigin } from "./api-origin.js";
import { useProviders } from "./use-providers.js";
import { SESSION_QUERY_KEY } from "./use-session.js";
import {
  signInWithEmail,
  signInWithSocial,
  SignInError,
} from "./api.js";

/**
 * Dashboard sign-in screen. Ports the layout from `ui-temp/auth.jsx`
 * (reference-only — never imported) onto shadcn primitives from
 * `@flowpunk-indie/dashboard-ui`.
 *
 * Provider buttons render dynamically from `GET /api/auth/providers`:
 * indie ships only the email/password form; managed surfaces Google +
 * Apple automatically when the env vars are set. The UI does not branch
 * on edition (ADR-021 §4).
 */
export interface SignInScreenProps {
  /** Called after a successful email/password sign-in. The router uses
   *  this to navigate to the post-login destination. Social sign-in
   *  triggers a full-page redirect and never invokes this callback. */
  onSignedIn?: () => void;
  /** Optional override for the post-social-callback URL. Defaults to
   *  the current dashboard origin's `/` so better-auth lands the user
   *  back where they started. */
  socialCallbackURL?: string;
  /** Optional route helper for the password-reset link. */
  onForgotPassword?: () => void;
  /** Optional route helper for sign-up — passed by `dashboard-app` when
   *  the host runs the managed self-serve flow (Phase 1.3). Indie omits
   *  it and the link is hidden. */
  onSignUp?: () => void;
}

export function SignInScreen({
  onSignedIn,
  socialCallbackURL,
  onForgotPassword,
  onSignUp,
}: SignInScreenProps) {
  const apiOrigin = useApiOrigin();
  const queryClient = useQueryClient();
  const { providers, isLoading: providersLoading } = useProviders();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const signInMutation = useMutation({
    mutationFn: () => signInWithEmail(apiOrigin, { email, password }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: SESSION_QUERY_KEY });
      onSignedIn?.();
    },
    onError: (err: unknown) => {
      setError(err instanceof SignInError ? err.message : "sign-in failed");
    },
  });

  const socialMutation = useMutation({
    mutationFn: (provider: string) =>
      signInWithSocial(
        apiOrigin,
        provider,
        socialCallbackURL ??
          (typeof window !== "undefined" ? window.location.origin + "/" : "/"),
      ),
    onSuccess: ({ url }) => {
      if (typeof window !== "undefined") {
        window.location.href = url;
      }
    },
    onError: (err: unknown) => {
      setError(err instanceof SignInError ? err.message : "sign-in failed");
    },
  });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email || !password) return;
    signInMutation.mutate();
  };

  const emailEnabled = providers.some((p) => p.id === "emailPassword");
  const socialProviders = providers.filter((p) => p.id !== "emailPassword");

  return (
    <div className="grid min-h-screen place-items-center bg-background-muted px-5 py-10">
      <div className="flex w-full max-w-[380px] flex-col gap-6">
        <div className="flex items-center justify-center gap-2.5">
          <span className="grid h-8 w-8 place-items-center rounded-md bg-gradient-to-br from-[#4f46e5] to-[#7c3aed] text-[13px] font-semibold text-white">
            FP
          </span>
          <span className="text-base font-semibold tracking-tight">flow-punk</span>
        </div>
        <h1 className="m-0 text-center text-[22px] font-semibold tracking-tight">
          Sign in to your workspace
        </h1>
        <p className="-mt-3 text-center text-[13.5px] text-foreground-muted">
          Welcome back. Enter your details below.
        </p>

        {emailEnabled && (
          <form className="flex flex-col gap-3.5" onSubmit={onSubmit}>
            <div>
              <Label htmlFor="email" className="mb-1.5 block">
                Email
              </Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                autoFocus
                required
              />
            </div>
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <Label htmlFor="password" className="m-0">
                  Password
                </Label>
                {onForgotPassword && (
                  <button
                    type="button"
                    onClick={onForgotPassword}
                    className="text-[12.5px] text-foreground-muted hover:text-foreground"
                  >
                    Forgot?
                  </button>
                )}
              </div>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
            </div>
            <Button
              type="submit"
              className="w-full"
              disabled={
                signInMutation.isPending ||
                socialMutation.isPending ||
                !email ||
                !password
              }
            >
              {signInMutation.isPending ? "Signing in…" : "Continue with email"}
            </Button>
          </form>
        )}

        {socialProviders.length > 0 && (
          <>
            {emailEnabled && (
              <div className="flex items-center gap-3 text-xs text-foreground-subtle">
                <span className="h-px flex-1 bg-border" />
                or
                <span className="h-px flex-1 bg-border" />
              </div>
            )}
            <div className="flex flex-col gap-2.5">
              {socialProviders.map((p) => (
                <Button
                  key={p.id}
                  type="button"
                  variant="outline"
                  className="w-full"
                  disabled={socialMutation.isPending || signInMutation.isPending}
                  onClick={() => socialMutation.mutate(p.id)}
                >
                  {p.label}
                </Button>
              ))}
            </div>
          </>
        )}

        {error && (
          <p
            role="alert"
            className="text-center text-[13px] text-destructive"
          >
            {error}
          </p>
        )}

        {providersLoading && providers.length === 0 && (
          <p className="text-center text-[12.5px] text-foreground-subtle">
            Loading providers…
          </p>
        )}

        {onSignUp && (
          <p className="text-center text-[13px] text-foreground-muted">
            Don't have an account?{" "}
            <button
              type="button"
              onClick={onSignUp}
              className="text-foreground underline-offset-2 hover:underline"
            >
              Sign up
            </button>
          </p>
        )}
      </div>
    </div>
  );
}
