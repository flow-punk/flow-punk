import { base64UrlEncode } from './hashing.js';

export function randomBase64Url(byteLength = 32): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

export function randomOpaqueId(byteLength = 16): string {
  return randomBase64Url(byteLength);
}
