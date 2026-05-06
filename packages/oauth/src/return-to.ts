/**
 * Open-redirect guard for the `/auth/login?return_to=…` parameter.
 *
 * Per ADR-019 amendment 2026-05-06, after a successful login the gateway
 * 302s the user back to `return_to`. Without validation that path is a
 * trivial open-redirect primitive (`?return_to=https://attacker`).
 *
 * Rules:
 *   - empty / null / undefined  → reject
 *   - parse failure             → reject
 *   - cross-origin              → reject (covers `javascript:`, `data:`,
 *                                  protocol-relative `//host`, scheme
 *                                  downgrades like `http://` when issuer
 *                                  is `https://`, and any other host)
 *   - same-origin `/auth/login` → reject (no recursion onto self)
 *   - otherwise                 → accept; canonical form is whatever
 *                                 `URL.toString()` produces, which
 *                                 percent-encodes CRLF and other control
 *                                 characters.
 *
 * Relative paths are resolved against `issuerOrigin` so callers may pass
 * either fully-qualified URLs or `/some/path?...` shorthand.
 */
export function validateReturnTo(
  raw: string | null | undefined,
  issuerOrigin: string,
): { ok: true; url: string } | { ok: false } {
  if (!raw) return { ok: false };
  let parsed: URL;
  try {
    parsed = new URL(raw, issuerOrigin);
  } catch {
    return { ok: false };
  }
  if (parsed.origin !== issuerOrigin) return { ok: false };
  if (parsed.pathname === '/auth/login') return { ok: false };
  return { ok: true, url: parsed.toString() };
}
