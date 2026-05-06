/**
 * RFC 6265 cookie helpers — vendored from `@flowpunk/gateway/auth/cookies`
 * to avoid a circular dep. Pure helpers with no edition-specific behavior.
 */

export interface BuildCookieOptions {
  maxAge?: number;
  httpOnly?: boolean;
  sameSite?: 'Lax' | 'Strict' | 'None';
  path?: string;
  secure?: boolean;
}

export function parseCookies(request: Request): Map<string, string> {
  const header = request.headers.get('Cookie');
  const cookies = new Map<string, string>();
  if (!header) return cookies;

  for (const part of header.split(';')) {
    const [rawName, ...rest] = part.trim().split('=');
    if (!rawName || rest.length === 0) continue;
    cookies.set(rawName, decodeURIComponent(rest.join('=')));
  }
  return cookies;
}

export function buildCookie(
  name: string,
  value: string,
  options: BuildCookieOptions = {},
): string {
  const segments = [`${name}=${encodeURIComponent(value)}`];
  segments.push(`Path=${options.path ?? '/'}`);
  if (typeof options.maxAge === 'number') segments.push(`Max-Age=${options.maxAge}`);
  if (options.httpOnly ?? true) segments.push('HttpOnly');
  if (options.secure ?? true) segments.push('Secure');
  segments.push(`SameSite=${options.sameSite ?? 'Lax'}`);
  return segments.join('; ');
}

export function clearCookie(name: string): string {
  return `${name}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict`;
}
