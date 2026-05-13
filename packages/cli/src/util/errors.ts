import { CfAdminError } from "@flowpunk/cf-admin";

/**
 * User-facing error wrapper. CLI commands throw these for known failure
 * modes; `cli.ts` formats them and exits non-zero. Any non-`CliError` thrown
 * surfaces as a stack trace (developer bug).
 */
export class CliError extends Error {
  constructor(
    message: string,
    public readonly hint?: string,
    public readonly exitCode = 1,
  ) {
    super(message);
    this.name = "CliError";
  }
}

export function formatError(err: unknown): {
  message: string;
  hint?: string;
  code: number;
} {
  if (err instanceof CliError) {
    return { message: err.message, hint: err.hint, code: err.exitCode };
  }
  if (err instanceof CfAdminError) {
    const hint =
      err.code === "unauthenticated"
        ? "Your token may have expired. Run `flowpunk login` again."
        : err.code === "forbidden"
          ? "Your token lacks the required scope. Re-run `flowpunk login` and accept all scopes."
          : err.code === "rate_limited"
            ? "Cloudflare rate-limited the request. Wait a minute and retry."
            : undefined;
    return { message: `Cloudflare API: ${err.message}`, hint, code: 1 };
  }
  if (err instanceof Error) {
    return { message: err.message, code: 1 };
  }
  return { message: String(err), code: 1 };
}
