import { personsRepo } from '@flowpunk-indie/db';

import type { Actor, ContactsEnv } from '../../types.js';
import { getDb, jsonResponse, mapRepoError, notFound } from '../_shared.js';

export async function handleGetPerson(
  _request: Request,
  env: ContactsEnv,
  _actor: Actor,
  id: string,
): Promise<Response> {
  try {
    const db = getDb(env);
    const person = await personsRepo.findById(db, id);
    if (!person) return notFound();
    return jsonResponse(200, { person });
  } catch (err) {
    return mapRepoError(err);
  }
}
