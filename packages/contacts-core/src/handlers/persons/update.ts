import { personsRepo, type UpdatePersonPatch } from '@flowpunk-indie/db';

import type { Actor, ContactsEnv } from '../../types.js';
import {
  emitContactsAudit,
  getDb,
  jsonResponse,
  mapRepoError,
  requireJsonBody,
} from '../_shared.js';

export async function handleUpdatePerson(
  request: Request,
  env: ContactsEnv,
  actor: Actor,
  id: string,
): Promise<Response> {
  const body = await requireJsonBody<UpdatePersonPatch>(request);
  if (body.kind === 'err') return body.response;

  try {
    const db = getDb(env);
    const now = new Date().toISOString();
    const result = await personsRepo.update(
      db,
      id,
      body.value,
      actor.userId,
      now,
    );

    if (result.fieldsChanged.length > 0) {
      emitContactsAudit(actor, {
        action: 'persons.updated',
        resourceType: 'person',
        resourceId: result.person.id,
        detail: { fieldsChanged: result.fieldsChanged },
      });
    }

    return jsonResponse(200, { person: result.person });
  } catch (err) {
    return mapRepoError(err);
  }
}
