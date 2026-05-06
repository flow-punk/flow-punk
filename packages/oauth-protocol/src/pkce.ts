import { sha256Base64Url } from './hashing.js';

const VERIFIER_RE = /^[A-Za-z0-9._~-]{43,128}$/;

export function isValidPkceVerifier(verifier: string): boolean {
  return VERIFIER_RE.test(verifier);
}

export async function pkceChallengeForVerifier(verifier: string): Promise<string> {
  if (!isValidPkceVerifier(verifier)) {
    throw new Error('invalid_pkce_verifier');
  }
  return sha256Base64Url(verifier);
}

export function isSupportedPkceMethod(method: string | null | undefined): method is 'S256' {
  return method === 'S256';
}
