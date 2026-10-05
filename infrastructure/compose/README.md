# Compose deployment (issues 007 / PRD M1 + M5)

This directory holds everything that deploys Germinal to the VPS, committed
as plain files in the repo — no Ansible templating, no `${VAR}` substitution
of secrets, no top-level `.env` on the server (ADR 0003, ADR 0004):

| File | Copied by CI (issues 009/010) to |
| --- | --- |
| `docker-compose.prod.yml` | `/opt/germinal/docker-compose.yml` |
| `docker-compose.staging.yml` | `/opt/germinal-staging/docker-compose.yml` |
| `deploy` | `/usr/local/bin/deploy` (root-owned, 0755) |
| `test/` | stays in the repo — the local harness (below) |

## Server layout

```
/opt/germinal/                        PROD (compose project name: germinal)
├── docker-compose.yml                docker-compose.prod.yml from the deployed commit
├── env/                              Agent-rendered, root 0600 (roles/infisical_agent)
│   ├── app.env                       app values + DATABASE_URL (assembled from /db)
│   ├── postgres.env                  POSTGRES_USER / POSTGRES_PASSWORD / POSTGRES_DB
│   ├── caddy.env                     CLOUDFLARE_API_TOKEN
│   ├── backup.env                    issue 013's backup job
│   └── admin.env                     ADMIN_* — the bootstrap one-off alone reads this
├── data/postgres/                    Postgres data dir        (survives `down`)
├── data/redis/                       Redis AOF                (survives `down`)
├── data/uploads/                     app uploads              (survives `down`)
└── caddy/{config,data,logs}/         Caddyfile / certs / logs (roles/caddy)

/opt/germinal-staging/                STAGING (compose project name: germinal_staging)
├── docker-compose.yml                docker-compose.staging.yml from the deployed commit
├── env/{app,admin}.env               Agent-rendered, root 0600
└── data/uploads/
```

Both stacks attach to the external `germinal_network` (created by Ansible's
docker role), which is how staging reaches prod's Postgres, Redis and Caddy.
Keeping it external means `docker compose down` in one stack can never drop
the network the other depends on.

### Service names and the DNS-alias rule

Compose registers every service name as a DNS alias on each network the
service joins. Prod's app service is `app`; a staging service also named
`app` would register a second `app` alias on `germinal_network` and
round-robin production traffic between the two containers. So:

| Stack | Services | Containers |
| --- | --- | --- |
| prod | `app`, `postgres`, `redis`, `caddy`, `admin` (profile) | `germinal_app`, `germinal_postgres`, `germinal_redis`, `germinal_caddy` |
| staging | `staging_app`, `staging_admin` (profile) | `germinal_staging_app` |

The container names are Caddy's upstreams (`roles/caddy`'s Caddyfile.j2
proxies to `germinal_app` / `germinal_staging_app`). The `infisical_agent`
role mirrors this mapping with an explicit `service` field in
`infisical_agent_templates` — keep the three in sync when renaming anything.

The `admin` / `staging_admin` services are the one-off admin bootstrap
(issue 016). They sit behind the `bootstrap` profile so no plain `up` —
including the Agent's recreate commands — ever starts them. They load
`env/app.env` (for `DATABASE_URL`) **and** `env/admin.env`; the long-running
app services load only `env/app.env`, so `ADMIN_PASSWORD` never reaches them.

### Image pins: `henga/germinal:prod` / `:staging`

The compose files name the image as `henga/germinal:prod` and
`henga/germinal:staging`. These tags are **local pins, never pushed**: on
every deploy, `deploy` pulls `henga/germinal:<sha>` from Docker Hub and
re-points the stack's pin at it *before* any container runs. This gives

- plain compose files with no variables,
- one-offs (migrate, bootstrap) and the Agent's recreates always resolving
  exactly the image the stack is meant to run,
- and no cross-stack leakage: a shared mutable tag (`:latest`) would make a
  later Agent recreate of prod's app pick up whatever staging deployed last.

A rollback is `deploy prod <earlier-sha>` — the same path, pin moved back.
Running containers keep their image even if the pin moves, and Docker's
restart policy restarts the container's own image, not the tag.

## `deploy <stack> <sha>`

The single server-side entry point for staging deploys, promotions and
rollbacks. CI never deploys any other way (issues 009/010 copy the script
and compose files from the deployed commit, then SSH in and run it):

```sh
ssh deploy@<host> 'sudo /usr/local/bin/deploy staging <sha>'
```

It runs as root (or via sudo — the deploy user has passwordless docker
sudo) because the Agent-rendered env files are root-only 0600. Steps, each
gating the next:

1. pull `henga/germinal:<sha>`
2. pin the stack's local tag
3. prod only: `up -d --wait postgres redis` (no-op when running; needed for
   the first deploy on empty directories)
4. migrations — `docker compose run --rm --no-deps <app-service> node scripts/migrate.js`
   (`DATABASE_URL` comes from `env/app.env`; failure aborts **before** the
   app is recreated, so the running container keeps serving)
5. admin bootstrap — `docker compose --profile bootstrap run --rm --no-deps <admin-service>`
   (issue 016; idempotent, runs on every deploy)
6. recreate the app service (`--no-deps --force-recreate --wait`)
7. wait until the container is healthy **and** `/api/health` reports `<sha>`

Knobs (defaults are the server's real values; the harness and CI may
override): `GERMINAL_PROD_ROOT`, `GERMINAL_STAGING_ROOT`,
`GERMINAL_IMAGE_REPO`, `GERMINAL_SKIP_PULL=1` (local harness only — skips
the Docker Hub pull), `GERMINAL_HEALTH_TIMEOUT`.

## Local test harness

```sh
infrastructure/compose/test/run-harness.sh
```

One command, real Docker, no secrets, no network calls beyond public image
pulls. It builds the app image locally with fake `COMMIT_SHA`s, lays out
temp `/opt/germinal{,-staging}` clones with fixture env files (in
`test/fixtures/` — fake, obviously non-secret values standing in for the
Agent's renderings), and drives the real `deploy` script through the issue's
acceptance cases: first deploy (migrate + admin + SHA serving), second
deploy (data kept, admin untouched), failing migration (abort before
recreate, old container keeps serving), SHA mismatch (deploy fails), staging
alongside prod (no DNS/network/name collisions, staging role can't reach the
prod database), no `ADMIN_*` in running app containers, and data surviving
container recreation.

Harness hygiene — it must never collide with a developer's running
containers:

- distinct compose project names (`germinal-harness-prod/-staging` via
  `COMPOSE_PROJECT_NAME`, overriding the files' `name:`) and its own network
  (`germinal-harness-network`, via a generated override that re-points the
  external network's name),
- no fixed host ports: Caddy's 80/443 are re-published to **random loopback
  ports** with a compose `!override` (needs compose ≥ 2.24); everything else
  publishes nothing,
- bind mounts and the harness Caddyfile live under one `mktemp -d`,
- an EXIT trap tears down both projects, the network, the built images and
  the temp dir — on success and failure alike; a stale previous run is torn
  down first, so reruns are clean.

The harness runs the deploy with `GERMINAL_SKIP_PULL=1` and locally built,
locally tagged images (`henga/germinal:<fake-sha>` — never pushed); the
production pull path stays the untouched default.

## What belongs to other issues

- **009 (staging CI)** and **010 (promote/rollback)**: copy these files from
  the deployed commit, run `deploy` over SSH with sudo, and wire the
  sudoers/SSH plumbing implied above.
- **011 (Ansible cleanup)**: the old templated compose in `roles/app`, the
  Vault and `make deploy`/`make deploy-staging` go away; Ansible keeps
  creating the directories above, `germinal_network` and the
  `germinal_staging` Postgres role/database (PRD M4 — the harness creates
  them with the equivalent SQL).
- **013 (backup)**: the backup job reads `/opt/germinal/env/backup.env` and
  the data directories above.
