---
"flowpunk": minor
---

Add `accounts.ownerUserId` and a `deal_contacts` many-to-many join. Accounts gain account-level ownership (mirrors the existing `deals.ownerUserId`). The new `deal_contacts` table moves the deals model from a single-slot `primaryPersonId` toward HubSpot-style many-to-many; `primaryPersonId` stays as the denormalized "primary contact" pointer and is kept consistent with `deal_contacts` automatically (deal create/PATCH auto-upserts the row, and removing the primary contact clears the pointer atomically). New REST routes: `GET/POST /api/v1/deals/:id/contacts` and `DELETE /api/v1/deals/:id/contacts/:personId`.
