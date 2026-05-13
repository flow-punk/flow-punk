import { CfAdminError } from "@flowpunk/cf-admin";

/**
 * Retry an async operation with exponential backoff on retryable CF errors
 * (5xx + 429). Non-retryable errors propagate immediately.
 */
export async function withRetry<T>(
  op: () => Promise<T>,
  opts: { attempts?: number; baseMs?: number } = {},
): Promise<T> {
  const attempts = opts.attempts ?? 4;
  const baseMs = opts.baseMs ?? 500;
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await op();
    } catch (err) {
      lastErr = err;
      if (err instanceof CfAdminError && !err.isRetryable) throw err;
      if (i === attempts - 1) throw err;
      const delay = baseMs * 2 ** i;
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}
