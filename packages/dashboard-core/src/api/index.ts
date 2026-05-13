/** Thin fetch wrapper. Surface for OpenAPI-generated clients lands when the
 *  codegen pipeline is wired (later Phase 0 step). */

export interface GatewayFetchOptions extends RequestInit {
  /** Absolute origin of the gateway, e.g. https://api.example.com */
  apiOrigin: string;
  /** Path including leading slash, e.g. /api/users */
  path: string;
}

export class SessionExpiredError extends Error {
  constructor() {
    super("session expired");
    this.name = "SessionExpiredError";
  }
}

export async function gatewayFetch(opts: GatewayFetchOptions): Promise<Response> {
  const { apiOrigin, path, ...init } = opts;
  const res = await fetch(`${apiOrigin}${path}`, {
    credentials: "include",
    ...init,
  });
  if (res.status === 401) {
    throw new SessionExpiredError();
  }
  return res;
}
