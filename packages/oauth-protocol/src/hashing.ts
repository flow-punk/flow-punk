const ENCODER = new TextEncoder();

export async function sha256Bytes(input: string): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest("SHA-256", ENCODER.encode(input));
  return new Uint8Array(digest);
}

export async function sha256Hex(input: string): Promise<string> {
  const bytes = await sha256Bytes(input);
  let out = "";
  for (const b of bytes) out += b.toString(16).padStart(2, "0");
  return out;
}

export async function sha256Base64Url(input: string): Promise<string> {
  const bytes = await sha256Bytes(input);
  return base64UrlEncode(bytes);
}

export function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export const oauthTokenHash = sha256Hex;
