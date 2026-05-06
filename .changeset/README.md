# Changesets

Changesets in this directory record version-bump intent for the `flowpunk` npm package. The contributor workflow (when to author a changeset, how the Version Packages PR ships) is documented in the parent superadmin runbook — not in this public repo.

## TL;DR

```sh
pnpm changeset
```

Pick `flowpunk`, choose `major` / `minor` / `patch`, write a one-line summary describing the user-visible change. Commit the resulting `.changeset/<name>.md` alongside your code change.

A bot will accumulate pending changesets into a long-lived "Version Packages" PR; merging that PR tags, publishes to npm, and creates the GitHub Release.

## When a changeset is required

Any change that ships in `dist/cli.js` or `dist/workers/*/index.js`, or that affects the operator upgrade path. In particular:

- Edits to `indie/services/*` source (worker bundle changes).
- Edits to `indie/packages/cli/src/flow/script-metadata.ts` or `wrangler.toml` files (operator bindings — see ADR-017).
- Edits to `indie/packages/db/migrations/*.sql` (operators must run `flowpunk update`).

Skip a changeset for: doc-only changes, internal refactors that don't change emitted bundles, test-only changes.
