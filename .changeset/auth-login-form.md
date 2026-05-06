---
'flowpunk': minor
---

Add `flowpunk connect` command + `/auth/login` browser surface for session bootstrapping. The CLI no longer prints a session cookie at init time; instead, operators run `flowpunk connect` to mint a one-shot 5-minute login token, then paste it into the gateway's `/auth/login` form to establish a browser session. `/oauth/authorize` now redirects unauthenticated browsers through this flow automatically. New D1 migration `0013_auth_login_tokens`. Curl-with-cookie testing is no longer documented; scripted REST testing uses the printed API key. See ADR-019 amendment dated 2026-05-06.
