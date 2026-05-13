import { htmlEscape } from "./_lib/html.js";

export interface ConsentPageOptions {
  clientName: string;
  requestId: string;
  resource: string;
  scope: string;
  /** Single-use CSRF nonce (plaintext); hash is persisted on the AR row. */
  csrfNonce: string;
  /** Used as `X-Request-ID` response header. */
  responseRequestId: string;
}

export function consentPage(options: ConsentPageOptions): Response {
  const escapedName = htmlEscape(options.clientName);
  const escapedResource = htmlEscape(options.resource);
  const escapedScope = htmlEscape(options.scope);
  const body = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Authorize ${escapedName}</title>
  </head>
  <body>
    <main>
      <h1>Authorize ${escapedName}</h1>
      <p>This client is requesting access to ${escapedResource}.</p>
      <p>Scope: ${escapedScope}</p>
      <form method="post" action="/oauth/approve">
        <input type="hidden" name="request_id" value="${htmlEscape(options.requestId)}" />
        <input type="hidden" name="csrf_nonce" value="${htmlEscape(options.csrfNonce)}" />
        <button type="submit" name="decision" value="approve">Approve</button>
        <button type="submit" name="decision" value="deny">Deny</button>
      </form>
    </main>
  </body>
</html>`;

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      // `same-origin` preserves the `Origin` header on the same-origin
      // form POST to /oauth/approve, while still stripping referrer for
      // any cross-origin navigation. The previous `no-referrer` value
      // caused Chrome to send `Origin: null` on the approve submission
      // (per WHATWG Fetch §4.4), which broke the Origin gate. The URL
      // here contains authorize-request fields, but the form action is
      // same-origin, so leaking the full URL as Referer to ourselves is
      // not a concern.
      "Referrer-Policy": "same-origin",
      "X-Frame-Options": "DENY",
      "Content-Security-Policy": "frame-ancestors 'none'",
      "X-Request-ID": options.responseRequestId,
    },
  });
}
