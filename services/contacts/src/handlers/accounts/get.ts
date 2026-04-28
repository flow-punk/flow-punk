import { accountsRepo } from '@flowpunk-indie/db';

import type { Actor, ContactsEnv } from '../../types.js';
import { getDb, jsonResponse, mapRepoError, notFound } from '../_shared.js';

export async function handleGetAccount(
  _request: Request,
  env: ContactsEnv,
  _actor: Actor,
  id: string,
): Promise<Response> {
  try {
    const db = getDb(env);
    const account = await accountsRepo.findById(db, id);
    if (!account) return notFound();
    return jsonResponse(200, { account });
  } catch (err) {
    return mapRepoError(err);
  }
}
