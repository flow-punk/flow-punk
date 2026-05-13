function noStoreHeaders(): Headers {
  return new Headers({
    "Cache-Control": "no-store",
    Pragma: "no-cache",
  });
}

export function oauthJsonError(
  status: number,
  error: string,
  description?: string,
): Response {
  return Response.json(
    description ? { error, error_description: description } : { error },
    { status, headers: noStoreHeaders() },
  );
}

export function oauthTokenJson(payload: Record<string, unknown>): Response {
  return Response.json(payload, { headers: noStoreHeaders() });
}

export function oauthMethodNotAllowed(allow: string): Response {
  return new Response("Method Not Allowed", {
    status: 405,
    headers: { Allow: allow },
  });
}

export function oauthRedirectError(
  redirectUri: string,
  error: string,
  state?: string | null,
  description?: string,
): Response {
  const url = new URL(redirectUri);
  url.searchParams.set("error", error);
  if (state) url.searchParams.set("state", state);
  if (description) url.searchParams.set("error_description", description);
  return Response.redirect(url.toString(), 302);
}

export function isFormUrlEncodedRequest(request: Request): boolean {
  const contentType = request.headers.get("Content-Type");
  if (!contentType) return false;
  const mediaType = contentType.split(";", 1)[0]?.trim().toLowerCase();
  return mediaType === "application/x-www-form-urlencoded";
}
