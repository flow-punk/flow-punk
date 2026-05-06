---
'flowpunk': patch
---

Consolidate indie idempotency KV namespaces (3 → 1). The `flowpunk` CLI now provisions a single shared `IDEMPOTENCY_KV` namespace bound by all three indie mutating services (contacts, pipeline, users) instead of three separate per-service namespaces. Per-service listability is preserved by an unhashed `IDEMPOTENCY_KEY_PREFIX` plain-text var (`contacts:` / `pipeline:` / `users:`) read by the `-core` routers and forwarded into `withIdempotency` as `keyPrefix`. Total indie KV count drops from 6 to 4. Managed is unchanged: `keyPrefix` defaults to `''` and managed wranglers omit the var, so cache keys stay byte-identical. See ADR-017 amendment dated 2026-05-06.
