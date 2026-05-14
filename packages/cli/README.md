# flowpunk

> Self-host **flow-punk indie** on your Cloudflare account in one command.

```bash
npx flowpunk@alpha
```

Provisions a fresh indie deployment to your Cloudflare account end-to-end:
1 D1 database, 6 KV namespaces, 5 Workers (1 public gateway + 4 internal),
1 Durable Object. Applies migrations, seeds the first admin, prints a working
gateway URL + API key + session cookie.

## Prerequisites

- Node.js ≥ 20
- A Cloudflare account (free tier works)

## Quick start

```bash
npx flowpunk@alpha login    # OAuth via wrangler
npx flowpunk@alpha init     # interactive provision
```

After init, paste the printed config block into your MCP client (Claude Desktop, etc.).

## Commands

| Command             | What it does                                                  |
| ------------------- | ------------------------------------------------------------- |
| `flowpunk init`     | Interactive provision (first time)                            |
| `flowpunk login`    | Cloudflare OAuth via wrangler                                 |
| `flowpunk logout`   | Clear stored credentials                                      |
| `flowpunk doctor`   | Health-check the deployment                                   |
| `flowpunk teardown` | Delete the deployed Workers + KVs (D1 retained)               |
| `flowpunk update`   | _(0.1.0)_ Apply pending migrations + redeploy changed workers |
| `flowpunk admin`    | _(0.1.0)_ Mint a new admin session + API key                  |
| `flowpunk logs`     | _(0.1.0)_ Tail Worker logs                                    |

## How auth works

`flowpunk login` shells out to `wrangler login` (real Cloudflare OAuth, browser-based).
Subsequent commands read the OAuth access token from wrangler's config file on
demand — we never copy or persist tokens to our own config. Pass `--token <CF_API_TOKEN>`
in CI / sandboxes.

## Docs

Full docs live in the [flow-punk-managed repo](https://github.com/flow-punk/flow-punk-managed/tree/main/managed/docs/services/cli.md).

## License

AGPL-3.0-only.
