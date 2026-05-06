import { htmlEscape } from './_lib/html.js';

const ERROR_BANNER =
  'Login token invalid or expired. Run <code>flowpunk connect</code> again ' +
  'in your terminal to mint a fresh one.';

export interface LoginFormOptions {
  /** Carried through the form so a successful POST redirects back. */
  returnTo: string | null;
  /** True when arriving from a failed POST (`?error=invalid_token`). */
  showError: boolean;
  /** Used as the `X-Request-ID` response header. */
  responseRequestId: string;
}

/**
 * Render the `/auth/login` paste-token form. Per ADR-019 amendment
 * 2026-05-06, this is the single in-browser path to an `fp_session`
 * cookie. Operators run `flowpunk connect` from their terminal to mint
 * a one-shot 30-minute login token, then paste it here. (TTL bumped
 * from the original 5m by the 2026-05-06-later amendment.)
 *
 * Security headers mirror `consent.ts` — the `Referrer-Policy: same-origin`
 * choice (vs `no-referrer`) is load-bearing: stricter policies cause
 * Chrome to send `Origin: null` on the same-origin form POST, which the
 * approve / login Origin gates must then specially handle.
 *
 * The form NEVER echoes the submitted token back into HTML on error —
 * the error banner is generic and `return_to` (operator-controlled query
 * param, but only writable to the operator's own gateway) is the only
 * value reflected, with full HTML escaping.
 */
export function loginPage(options: LoginFormOptions): Response {
  const escapedReturnTo = options.returnTo
    ? htmlEscape(options.returnTo)
    : '';
  const errorBlock = options.showError
    ? `<p class="error" role="alert">${ERROR_BANNER}</p>`
    : '';

  const body = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Sign in to flow-punk</title>
    <style>
      body { font-family: system-ui, sans-serif; max-width: 32rem; margin: 4rem auto; padding: 0 1rem; }
      h1 { margin-bottom: 0.5rem; }
      p { line-height: 1.5; }
      code { background: #f4f4f4; padding: 0.1rem 0.3rem; border-radius: 0.2rem; }
      input[type="password"] { width: 100%; padding: 0.5rem; font-family: ui-monospace, monospace; box-sizing: border-box; }
      button { margin-top: 1rem; padding: 0.5rem 1rem; }
      .error { background: #fdecea; border: 1px solid #f5c6cb; padding: 0.5rem 0.75rem; border-radius: 0.25rem; }
    </style>
  </head>
  <body>
    <main>
      <h1>Sign in</h1>
      <p>To log in, run <code>flowpunk connect</code> in your terminal. Paste the printed login token below. Tokens expire after 30 minutes and can only be used once.</p>
      ${errorBlock}
      <form method="post" action="/auth/login" autocomplete="off">
        <label for="token">Login token</label>
        <input type="password" id="token" name="token" autocomplete="off" required spellcheck="false" autocapitalize="off" />
        <input type="hidden" name="return_to" value="${escapedReturnTo}" />
        <button type="submit">Sign in</button>
      </form>
    </main>
  </body>
</html>`;

  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Referrer-Policy': 'same-origin',
      'X-Frame-Options': 'DENY',
      'Content-Security-Policy': "frame-ancestors 'none'",
      'Cache-Control': 'no-store',
      'X-Request-ID': options.responseRequestId,
    },
  });
}
