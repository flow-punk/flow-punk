export type CfAdminErrorCode =
  | "unauthenticated"
  | "forbidden"
  | "not_found"
  | "rate_limited"
  | "server_error"
  | "invalid_response"
  | "invalid_input"
  | "unknown";

export class CfAdminError extends Error {
  constructor(
    public readonly code: CfAdminErrorCode,
    message: string,
    public readonly status?: number,
    public readonly cfErrors?: ReadonlyArray<{ code: number; message: string }>,
  ) {
    super(message);
    this.name = "CfAdminError";
  }

  // 5xx, 429, and unknown 5xx-shaped errors are retryable; other 4xx are
  // terminal — retrying won't change the outcome.
  get isRetryable(): boolean {
    if (this.code === "server_error" || this.code === "rate_limited")
      return true;
    if (this.code === "unknown" && (this.status ?? 0) >= 500) return true;
    return false;
  }
}

export function classifyHttpStatus(status: number): CfAdminErrorCode {
  if (status === 401) return "unauthenticated";
  if (status === 403) return "forbidden";
  if (status === 404) return "not_found";
  if (status === 429) return "rate_limited";
  if (status >= 500) return "server_error";
  if (status >= 400) return "invalid_input";
  return "unknown";
}
