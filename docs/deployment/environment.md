# Environment variables

Every configuration value lives in **Infisical**, the team's self-hosted
instance at `https://secrets.henga.dev`
([ADR 0004](../adr/0004-infisical-sole-source-of-config.md)). Nothing is
copied by hand into a server file, a GitHub secret or a committed `.env`.
This page says *where* each value lives and *who* reads it. The values
themselves are only in Infisical.

## Two projects

| Project | Environments | Holds | Read by |
| --- | --- | --- | --- |
| `germinal` | `dev`, `staging`, `prod` | the app's and the server's values, by folder (below) | the Infisical Agent on the server (machine identity `germinal-vps`, read-only); `make env` (a contributor's own login); Terraform, which **writes** `/s3` and `prod/backup` |
| `germinal-infra` | `prod` | Terraform's inputs: `TF_VAR_hcloud_token`, `TF_VAR_cloudflare_token`, and `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY` of the `terraform-germinal` IAM user, which also give access to the state bucket | `./tf.sh` only, through the operator's login. `germinal-vps` has no access to it. |

## Folders in `germinal` and their consumers

The Agent renders one file per consumer from Go templates in
[infrastructure/infisical/templates/](../../infrastructure/infisical/templates/README.md).
Each file contains only the folders its consumer needs. That filter is the
security boundary: `ADMIN_PASSWORD` never reaches the running app, and the
Cloudflare token never reaches anything but Caddy.

| Folder | Keys | `prod` | `staging` | `dev` | Rendered into → read by |
| --- | --- | :-: | :-: | :-: | --- |
| `/app` | `PUBLIC_URL`, `PROTOCOL_HEADER`, `CONTACT_EMAIL`, `MAINTENANCE_MODE`, `USE_SCHEDULER`, `USE_MOCK_DATA`, `RESERVATION_EXPIRY_MINUTES`, `MAX_FILE_SIZE`, `BODY_SIZE_LIMIT`, `ALLOWED_IMAGE_TYPES`, `ALLOWED_VIDEO_TYPES` | ✓ | ✓ | ✓ | `app.env` → the app |
| `/db` | `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `POSTGRES_HOST`, `POSTGRES_PORT` | ✓ | ✓ | ✓ | `postgres.env` → Postgres (prod only); assembled into `DATABASE_URL` in `app.env`; `POSTGRES_USER`/`POSTGRES_DB` into `backup.env` |
| `/redis` | `REDIS_HOST`, `REDIS_PORT`, `REDIS_DB` (`0` prod, `1` staging) | ✓ | ✓ | ✓ | `app.env` |
| `/stripe` | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` (live in prod, **test mode** in staging and dev) | ✓ | ✓ | ✓ | `app.env` |
| `/s3` | `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, `S3_BUCKET_NAME`, `MEDIA_URL` (**written by Terraform** in prod and staging), `S3_PUBLIC_URL`; dev only: `S3_ENDPOINT`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` (local MinIO) | ✓ | ✓ | ✓ | `app.env`. The AWS key also sends email through SES. |
| `/smtp` | `SMTP_FROM_EMAIL`, `SMTP_FROM_NAME` | ✓ | ✓ | ✓ | `app.env` |
| `/twilio` | `TWILIO_ACCOUNT_SID`, `TWILIO_API_KEY_SID`, `TWILIO_API_KEY_SECRET`, `TWILIO_PHONE_NUMBER`, `TWILIO_REGION` + `TWILIO_EDGE` (`ie1` + `dublin`: EU processing; the API key must be created in that region; empty = US1) (API keys made by hand: [Terraform README](../../infrastructure/terraform/README.md#twilio-api-keys-manual)) | ✓ | ✓ | ✓ | `app.env` |
| `/sentry` | `SENTRY_DSN` (empty = error reporting off) | ✓ | ✓ | ✓ | `app.env` |
| `/admin` | `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_FIRST_NAME`, `ADMIN_LAST_NAME` | ✓ | ✓ | ✓ | `admin.env` → the one-off admin bootstrap that each deploy runs, **never** the running app; in dev, `make env` puts them in `.env` for `node scripts/create-admin.js` |
| `/caddy` | `CLOUDFLARE_API_TOKEN` (DNS-01 for TLS certificates) | ✓ | | | `caddy.env` → Caddy. Staging shares prod's Caddy. |
| `/backup` | `BACKUP_AWS_ACCESS_KEY_ID`, `BACKUP_AWS_SECRET_ACCESS_KEY`, `BACKUP_S3_BUCKET`, `BACKUP_S3_REGION` (**written by Terraform**: the no-delete `production-germinal-backup` user) | ✓ | | | `backup.env` → the root backup timers ([roles/backup](../../infrastructure/ansible/roles/backup/README.md)) |
| `/host` | `NOTIFY_EMAIL` | ✓ | | | not rendered: read by Ansible at setup time, through the operator's login, for fail2ban, unattended-upgrades and ACME |

A key added to a folder appears in the rendered file on the next poll,
within about a minute, with no template change. The Agent then recreates
the consumer: the app, or Caddy. Postgres, the backup job and the admin
bootstrap only get the rewritten file; they read it the next time they run.

## Rules that are easy to get wrong

- **`DATABASE_URL` is never stored.** The templates assemble it from the five
  `/db` values, both on the server and in `make env`. Use letters and digits
  only in `POSTGRES_PASSWORD`, so it never needs URL-encoding.
- **`POSTGRES_PASSWORD` applies only when the database is first created.**
  Changing it in Infisical changes `postgres.env`, but not the password
  Postgres actually uses. To rotate it, first run `ALTER USER … PASSWORD …` in
  the database, then update Infisical. The app picks up the new
  `DATABASE_URL` on its own.
- **Never set `ORIGIN` in staging or prod.** adapter-node would then ignore
  the host each request came on, which breaks the `admin.` and `staff.`
  subdomains and makes SvelteKit's CSRF check reject forms.
  `PROTOCOL_HEADER=x-forwarded-proto` is what tells the app it runs behind
  HTTPS (Caddy ends TLS). Dev, which has a single `localhost` origin, may
  set `ORIGIN`.
- **`MAINTENANCE_MODE=true` in `prod/app`** forces the maintenance page. It
  takes priority over the admin toggle in site settings.
- **Staging is not a copy of prod:** its own database and role
  (`germinal_staging`), Redis database `1`, Stripe test mode, its own bucket
  and AWS key.
- **`dev` must never hold anything that can spend money or reach real data.**
  On the free Infisical plan, the server's read-only identity can also read
  `dev`, and contributors get `dev` read-only. That's why `dev` keeps
  `AWS_*` empty (no SES, no real bucket), uses the local MinIO, and uses
  Stripe test keys.

## Local development

- **Try path:** `cp .env.example .env && make try`. `.env.example` is
  committed, contains no secret, and leaves every integration off.
- **Contributors:** `infisical login`, then `make env`. That renders `.env` from
  `dev` with the same templates the server uses
  ([infrastructure/infisical/make-env.sh](../../infrastructure/infisical/make-env.sh)).

[.env.example](../../.env.example) lists every variable the app reads, with
comments. The schema itself is in `src/lib/server/env.ts`.
