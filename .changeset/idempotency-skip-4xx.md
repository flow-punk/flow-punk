---
'flowpunk': patch
---

Stop caching 4xx responses in `withIdempotency`. A 4xx means the request was rejected before any side effect, so a corrected retry under the same key is safe and expected. Previously `withIdempotency` cached anything `< 500`, so a corrected payload retried under the same key was returning `422 IDEMPOTENCY_KEY_REUSED` against the cached 4xx. This wedged MCP tool-call slots whose JSON-RPC id (and thus synthesized idempotency key) is reused by the client across in-turn retries — a `persons:create` that failed validation could not be retried with corrected args without starting a new MCP session. 5xx behavior is unchanged (still no caching); 2xx behavior is unchanged (still cached, payload-mismatch still returns 422).
