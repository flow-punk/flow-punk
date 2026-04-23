/**
 * SHA-256 hex digest of a UTF-8 string.
 *
 * Shared by:
 *   - rate-limit middleware (hash raw credential for Workers Rate Limiting key)
 *   - managed auth middleware (hash mcp_ token before PARENT_DB lookup)
 *   - OAuth token store (hash before persisting; plaintext never written)
 */
export async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(input),
  );
  let out = '';
  for (const b of new Uint8Array(buf)) {
    out += b.toString(16).padStart(2, '0');
  }
  return out;
}
