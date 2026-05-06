import { parseEnvelope, type CfClient } from '@flowpunk/cf-admin';

export interface AccountSummary {
  id: string;
  name: string;
}

/**
 * `GET /accounts` — returns the accounts the bound token can see. Used by
 * `resolveAndVerify` as both the account picker source AND the implicit
 * token-validity check (a 401 here means the token is bad).
 *
 * We deliberately do not call `/user/tokens/verify` — that endpoint only
 * accepts CF API Tokens (the manually-issued kind), not the OAuth access
 * tokens wrangler stores. A successful `/accounts` response is the
 * canonical evidence a token works for what we need.
 */
export async function listAccounts(client: CfClient): Promise<AccountSummary[]> {
  const response = await client.request('/accounts');
  type AccountWire = { id: string; name: string };
  const accounts = await parseEnvelope<AccountWire[]>(response);
  return accounts.map((a) => ({ id: a.id, name: a.name }));
}
