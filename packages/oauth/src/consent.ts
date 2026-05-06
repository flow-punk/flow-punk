function htmlEscape(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

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
      'Content-Type': 'text/html; charset=utf-8',
      'Referrer-Policy': 'no-referrer',
      'X-Frame-Options': 'DENY',
      'Content-Security-Policy': "frame-ancestors 'none'",
      'X-Request-ID': options.responseRequestId,
    },
  });
}
