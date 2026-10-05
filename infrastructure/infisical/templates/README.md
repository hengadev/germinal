# Infisical Agent env templates

One Go template per consumer, rendered by the Infisical Agent on the server
(issue 008) and by `infisical export --template=<file>` through `make env`
locally. Because both use the same engine and the same files, local
development cannot differ from the server in how values are assembled.

| Template | Folders | Consumed by |
| --- | --- | --- |
| `app.env.tmpl` | `/redis`, `/stripe`, `/s3`, `/smtp`, `/twilio`, `/sentry`, `/db` (→ `DATABASE_URL`), `/app` | the app container (each stack) |
| `postgres.env.tmpl` | `/db` | the Postgres container (bootstrap) |
| `caddy.env.tmpl` | `/caddy` | the Caddy container |
| `backup.env.tmpl` | `/db` (two atoms), `/backup` | the backup job (issue 013) |
| `admin.env.tmpl` | `/admin` | the one-off admin bootstrap service (issue 016); never the running app |

## The one-`listSecrets` rule (issue 005)

Templates get Go built-ins plus `listSecrets` / `getSecretByName` /
`listSecretsByProjectSlug` / `dynamicSecret`, and nothing else — in
particular **no `env` function**. Two consequences:

1. **A folder's values must come from a single `listSecrets` call per
   template.** Every secret call overwrites the ETag the Agent monitors, so
   a folder read through two calls is invisible to change detection. Where
   atoms are needed (`DATABASE_URL` from `/db`, the two `pg_dump` values in
   `backup.env`), they are picked out of that folder's own `range`.
2. **The environment slug cannot be computed.** Each `listSecrets` call
   carries the `__GERMINAL_ENV__` placeholder, and
   [`render-template.sh`](../render-template.sh) substitutes it to produce a
   concrete per-environment copy: `make env` renders `dev`; issue 008
   installs a substituted copy for `staging` and `prod` on the server.

Rendering a whole folder (rather than naming keys) is deliberate: a key
added in Infisical appears in the rendered file on the next poll with no
template change.

## Several folders in one template: the consequence and the choice

The Agent's change detection tracks only the **last** secret call of a
template. `app.env.tmpl` and `backup.env.tmpl` need more than one folder
(`listSecrets` does not recurse, so one root call cannot cover them), so for
those two files only the last-listed folder triggers a re-render and the
template's command.

The choice made here:

- **`app.env.tmpl` ends with `/app`.** Everything in `/app`
  (`MAINTENANCE_MODE`, `RESERVATION_EXPIRY_MINUTES`, upload limits, mock and
  scheduler flags) is the volatile, operationally urgent set — PRD stories 6
  and 35 promise those reach the running app within about a minute. Changes
  in `/redis`, `/stripe`, `/s3`, `/smtp`, `/twilio`, `/sentry` or `/db` do
  **not** propagate on their own: they land on the next deploy (every deploy
  recreates the app with a fresh `env_file`), after an Agent restart (the
  file re-renders, the command does not run), or whenever an `/app` value
  changes next. Credential rotation is rare, deliberate and naturally paired
  with a deploy, so this is the accepted trade-off.
- **`backup.env.tmpl` ends with `/backup`.** The backup job reads the file
  fresh on each run and the template has no command (issue 008), so what
  matters is that rotations in `/backup` rewrite the file. The `/db` atoms
  it also carries (`POSTGRES_USER`, `POSTGRES_DB`) never change on a live
  server.
- `postgres.env.tmpl`, `caddy.env.tmpl` and `admin.env.tmpl` read a single
  folder and are unaffected.

If this trade-off ever needs to change, the alternatives are splitting a
consumer's file into per-folder templates (each with its own ETag and
command) or merging folders in Infisical — both ripple into issues 007 and
008, which currently expect exactly the five files above.

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
