import { personsRepo } from '@flowpunk-indie/db';

import type { Actor, ContactsEnv } from '../../types.js';
import {
  emitContactsAudit,
  getDb,
  jsonResponse,
  mapRepoError,
} from '../_shared.js';

export async function handleSoftDeletePerson(
  _request: Request,
  env: ContactsEnv,
  actor: Actor,
  id: string,
): Promise<Response> {
  try {
    const db = getDb(env);
    const now = new Date().toISOString();
    const person = await personsRepo.softDelete(db, id, actor.userId, now);

    emitContactsAudit(actor, {
      action: 'persons.softDeleted',
      resourceType: 'person',
      resourceId: person.id,
      detail: {},
    });

    return jsonResponse(200, { person });
  } catch (err) {
    return mapRepoError(err);
  }
}
