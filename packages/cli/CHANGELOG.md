# flowpunk

## 0.1.0

### Minor Changes

- [`17dda6c`](https://github.com/flow-punk/flow-punk/commit/17dda6ced66a195f161c5077a456e684c4ccc6a9) Thanks [@mjzuppe](https://github.com/mjzuppe)! - Add `flowpunk connect` command + `/auth/login` browser surface for session bootstrapping. The CLI no longer prints a session cookie at init time; instead, operators run `flowpunk connect` to mint a one-shot 5-minute login token, then paste it into the gateway's `/auth/login` form to establish a browser session. `/oauth/authorize` now redirects unauthenticated browsers through this flow automatically. New D1 migration `0013_auth_login_tokens`. Curl-with-cookie testing is no longer documented; scripted REST testing uses the printed API key. See ADR-019 amendment dated 2026-05-06.

- [`0f4cc82`](https://github.com/flow-punk/flow-punk/commit/0f4cc82ad9c94e63b4ed87ae480424d882f3bbea) Thanks [@mjzuppe](https://github.com/mjzuppe)! - MCP model-action dispatch, stage cardinality guards, idempotency-key payload-hash defense

- [`141c035`](https://github.com/flow-punk/flow-punk/commit/141c0350650ff085ef60cf128bf1adab21c3bb19) Thanks [@mjzuppe](https://github.com/mjzuppe)! - Add OAuth 2.1 / MCP authorization with RFC 7591 DCR. Indie now ships a standalone OAuth server (register, authorize, approve, token, revoke + RFC 9728/8414 well-knowns) so Claude.ai web and ChatGPT custom connectors can connect via Dynamic Client Registration. New tenant-D1 migrations 0009–0012 add `mcp_oauth_*` tables. See [ADR-019](../../managed/docs/architecture/ADR-019-oauth-indie-and-managed.md).

  **Upgrade note for existing operators:** This release introduces a new `OAUTH_TOKEN_CACHE` KV namespace bound by both the gateway and users services. `flowpunk update` alone will NOT create the namespace on existing deployments — operators upgrading from a pre-OAuth `flowpunk` version must either (a) re-run `flowpunk init` so the new namespace is provisioned, or (b) manually create a KV namespace via Cloudflare and patch the deployment state file. Fresh `flowpunk init` runs are unaffected: the namespace is created automatically alongside the existing six.

- [`6e6bc03`](https://github.com/flow-punk/flow-punk/commit/6e6bc03fe586f35178cccb17c2a4efa5d30d89c5) Thanks [@mjzuppe](https://github.com/mjzuppe)! - Improve `flowpunk` init/teardown/connect operator UX.
  - **Login token TTL bumped from 5 minutes to 30 minutes.** The original 5-minute window was too tight when juggling browser profiles, Cloudflare access challenges, and incognito sessions. See ADR-019 amendment 2026-05-06-later for the updated phishing-posture rationale: the token is still one-shot and post-consume permanently dead; 30m is the operator-ergonomics floor that doesn't yet require its own engineering control (rate-limiting, IP-binding).
  - **`flowpunk init` success card splits MCP guidance into two sections.** Browser / hosted-agent connections (Claude.ai, ChatGPT) get a URL-only block — OAuth Dynamic Client Registration handles the rest. Desktop / IDE clients (Claude Desktop, Cursor, …) keep the JSON config block with a `Bearer` header. The hosted-agent section points back to the existing "First-time browser login" preamble so first-time setup still runs `flowpunk connect` once.
  - **`flowpunk teardown` confirmation softened for reversible resources.** The typed-prefix gate is replaced with a yes/no confirm followed by a red "are you sure?" final confirm. The D1 typed-name gate stays — D1 deletion is irrecoverable and deserves the friction.
  - **`flowpunk init` now detects a retained D1 and revokes credentials on reuse.** When local config is empty but a `<prefix>-indie` D1 already exists on Cloudflare (typical post-`teardown` state), init prompts Reuse / Cancel. Reuse keeps CRM data (contacts, deals, pipelines, …) but wipes `api_keys`, `mcp_sessions`, all `mcp_oauth_*` tables, and `auth_login_tokens` — preventing forgotten-old-key reactivation and the unique-active-`(user_id, label)` 409 the `flowpunk init` API-key mint would otherwise hit. The existing owner row is reused (inherited email + display-name), so no second `role='owner'` insert. Multi-owner anomalous state aborts with a `flowpunk admin reset` instruction. Cancel directs operators to `flowpunk teardown --prefix <prefix>` for a true clean slate.

- [`c62da21`](https://github.com/flow-punk/flow-punk/commit/c62da21ec7e47463030306964e3cfb64fc757d36) Thanks [@mjzuppe](https://github.com/mjzuppe)! - Negotiate MCP protocol 2025-06-18, accept JSON-RPC notifications, and standardize on Mcp-Session-Id header. Gateway now advertises and negotiates the newer MCP protocol version (2025-06-18) while still accepting clients that request 2025-03-26. JSON-RPC notifications and responses are acknowledged with 202 Accepted per the streamable-HTTP spec, and `tools/list` / `tools_search` results are returned in the spec-shaped tool-result content envelope. The session header was renamed from `X-MCP-Session-Id` to the spec-cased `Mcp-Session-Id`; the legacy header is still accepted on contacts and pipeline MCP execute routes for backwards compatibility.

- [`2dc2942`](https://github.com/flow-punk/flow-punk/commit/2dc294276f0dcd2deca23ac03b479a2570bfacd0) Thanks [@mjzuppe](https://github.com/mjzuppe)! - **ID prefix rename for legibility.** Cleans up several short / ambiguous ID prefixes returned by the bundled Worker artifacts (`flowpunk update` ships these). Only the prefix changes — the 21-char nanoid body is unchanged.

  | Entity           | Old     | New                  |
  | ---------------- | ------- | -------------------- |
  | Pipeline         | `pl_`   | `pipe_`              |
  | Stage            | `stg_`  | `stag_`              |
  | Deal             | `del_`  | `deal_`              |
  | API key (row id) | `apk_`  | `akey_`              |
  | CLI login token  | `logn_` | `logn_` (was `alt_`) |

  Unchanged: `acct_`, `per_`, `usr_`, `sess_`, `ten_`, and the user-facing api-key secret `fpk_`.

  **Operator action:** clients that pin on the old prefix in regexes, display logic, or audit-log queries must update. New `pipe_…` IDs reach REST responses (`/api/v1/pipelines/:id`, `pipelineId` query params, etc.) on first request after upgrade; same for stages, deals, api-key row ids, and login-token row ids. Old rows with old-prefix IDs are not migrated — backend validators reject them.

  This is safe to apply only on fresh deployments (no production rows for these entities). If existing rows must be preserved, hold off on `flowpunk update` and run a data migration first.

### Patch Changes

- [`a379a75`](https://github.com/flow-punk/flow-punk/commit/a379a7536f1d529ac3d7d8ac98fb412dad0fb777) Thanks [@mjzuppe](https://github.com/mjzuppe)! - Consolidate indie idempotency KV namespaces (3 → 1). The `flowpunk` CLI now provisions a single shared `IDEMPOTENCY_KV` namespace bound by all three indie mutating services (contacts, pipeline, users) instead of three separate per-service namespaces. Per-service listability is preserved by an unhashed `IDEMPOTENCY_KEY_PREFIX` plain-text var (`contacts:` / `pipeline:` / `users:`) read by the `-core` routers and forwarded into `withIdempotency` as `keyPrefix`. Total indie KV count drops from 6 to 4. Managed is unchanged: `keyPrefix` defaults to `''` and managed wranglers omit the var, so cache keys stay byte-identical. See ADR-017 amendment dated 2026-05-06.

- [`289bf3c`](https://github.com/flow-punk/flow-punk/commit/289bf3c3b5c2943ae471aded0caad38c70dbf2c7) Thanks [@mjzuppe](https://github.com/mjzuppe)! - Stop caching 4xx responses in `withIdempotency`. A 4xx means the request was rejected before any side effect, so a corrected retry under the same key is safe and expected. Previously `withIdempotency` cached anything `< 500`, so a corrected payload retried under the same key was returning `422 IDEMPOTENCY_KEY_REUSED` against the cached 4xx. This wedged MCP tool-call slots whose JSON-RPC id (and thus synthesized idempotency key) is reused by the client across in-turn retries — a `persons:create` that failed validation could not be retried with corrected args without starting a new MCP session. 5xx behavior is unchanged (still no caching); 2xx behavior is unchanged (still cached, payload-mismatch still returns 422).
