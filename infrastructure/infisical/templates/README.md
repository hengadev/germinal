# Infisical Agent env templates

One Go template per consumer, rendered by the Infisical Agent on the server
(issue 008) and by `infisical export --template=<file>` through `make env`
locally. Because both use the same engine and the same files, local
development cannot differ from the server in how values are assembled.

| Template | Folders | Consumed by |
| --- | --- | --- |
| `app.env.tmpl` | `/app`, `/redis`, `/stripe`, `/s3`, `/smtp`, `/twilio`, `/sentry`, `/db` (→ `DATABASE_URL` only) | the app container (each stack) |
| `postgres.env.tmpl` | `/db` | the Postgres container (bootstrap) |
| `caddy.env.tmpl` | `/caddy` | the Caddy container |
| `backup.env.tmpl` | `/db` (two atoms), `/backup` | the backup job (issue 013) |
| `admin.env.tmpl` | `/admin` | the one-off admin bootstrap service (issue 016); never the running app |

## The one-`listSecrets` rule (issue 005)

Templates get Go built-ins plus `listSecrets` / `getSecretByName` /
`listSecretsByProjectSlug` / `dynamicSecret`, and nothing else — in
particular **no `env` function**. Two consequences:

1. **Each template makes exactly one `listSecrets` call.** Every secret
   call overwrites the ETag the Agent monitors, so with several calls only
   the last one is change-detected. Atoms (`DATABASE_URL` from `/db`, the
   two `pg_dump` values in `backup.env`) are picked out of that same
   `range`, never fetched separately.
2. **The environment slug cannot be computed.** Each `listSecrets` call
   carries the `__GERMINAL_ENV__` placeholder, and
   [`render-template.sh`](../render-template.sh) substitutes it to produce a
   concrete per-environment copy: `make env` renders `dev`; issue 008
   installs a substituted copy for `staging` and `prod` on the server.

Rendering a whole folder (rather than naming keys) is deliberate: a key
added in Infisical appears in the rendered file on the next poll with no
template change.

## Several folders in one template: one recursive call

`app.env.tmpl` and `backup.env.tmpl` need several folders. They make **one**
recursive call over the whole environment
(`` listSecrets "<project>" "<env>" "/" `{"recursive": true}` ``) and keep only
the folders they need by testing `.SecretPath`. One call means one ETag, so
a change in **any** of those folders (a Stripe key rotation, a new S3 bucket,
`MAINTENANCE_MODE`) reaches the consumer within one poll.

Consequences:

- The filter is the security boundary: `/admin`, `/caddy`, `/backup`, `/host`
  and the raw `/db` keys are never printed into `app.env`. The unit test
  `tests/unit/infrastructure/agent-templates.test.ts` pins that list.
- A change in a folder the consumer does not use still changes the ETag, so
  the Agent may recreate the app with identical values. That is harmless.
- `postgres.env.tmpl`, `caddy.env.tmpl` and `admin.env.tmpl` read a single
  folder directly.

Issue 008 should confirm on the server that the Agent's change detection
follows a recursive call (edit a `/stripe` value, check `app` is recreated).

## `DATABASE_URL`

Assembled in `app.env.tmpl` from the `/db` atoms with Go's `urlquery`, so
each atom exists exactly once in Infisical (PRD story 4). Caveat from issue
005: `urlquery` encodes a space as `+`, which is wrong inside userinfo —
**`POSTGRES_PASSWORD` must stay letters-and-digits only** (already the rule
in the operator checklist).

## Rendering by hand

```sh
# dev (what `make env` runs; contributors never need this directly)
infrastructure/infisical/render-template.sh infrastructure/infisical/templates/app.env.tmpl dev \
  | infisical export --template=/dev/stdin --projectId=78c404c2-a76c-4967-8ff0-e7544f1b6fff --env=dev
```

When checking `staging` or `prod`, redirect the output to a file under
`/tmp`, check the key names only, and delete it afterwards (operator
checklist, Phase 3). `make env` never renders anything but `dev`.

Notes verified against the live instance (issue 005, CLI/Agent 0.43.138):

- `infisical export` exits non-zero on auth or template errors; the Agent
  daemon, by contrast, exits **0** on config errors, which is why issue 008
  uses `Restart=always`.
- Rendered files are created `0644`; issue 008 tightens that to `0600`.
- Ansible's Jinja uses the same `{{ }}` braces — issue 008 deploys these
  files with `copy`, never `template`.
