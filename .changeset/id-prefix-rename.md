---
'flowpunk': minor
---

**ID prefix rename for legibility.** Cleans up several short / ambiguous ID prefixes returned by the bundled Worker artifacts (`flowpunk update` ships these). Only the prefix changes — the 21-char nanoid body is unchanged.

| Entity | Old | New |
|---|---|---|
| Pipeline | `pl_` | `pipe_` |
| Stage | `stg_` | `stag_` |
| Deal | `del_` | `deal_` |
| API key (row id) | `apk_` | `akey_` |
| CLI login token | `logn_` | `logn_` (was `alt_`) |

Unchanged: `acct_`, `per_`, `usr_`, `sess_`, `ten_`, and the user-facing api-key secret `fpk_`.

**Operator action:** clients that pin on the old prefix in regexes, display logic, or audit-log queries must update. New `pipe_…` IDs reach REST responses (`/api/v1/pipelines/:id`, `pipelineId` query params, etc.) on first request after upgrade; same for stages, deals, api-key row ids, and login-token row ids. Old rows with old-prefix IDs are not migrated — backend validators reject them.

This is safe to apply only on fresh deployments (no production rows for these entities). If existing rows must be preserved, hold off on `flowpunk update` and run a data migration first.
