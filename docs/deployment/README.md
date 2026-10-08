# Deployment

How Germinal runs in staging and production, how a release gets there, and
what to do when something breaks. Related pages:

- [environment.md](environment.md): every configuration value, where it lives in Infisical and who reads it
- [setup.md](setup.md): from zero to a working server, from any operator computer

The decisions behind this design are [ADR 0003](../adr/0003-compose-not-swarm-on-single-vps.md)
(Compose, not Swarm, on one VPS) and [ADR 0004](../adr/0004-infisical-sole-source-of-config.md)
(Infisical is the only source of configuration). The earlier Swarm and
Ansible Vault setup is kept, for history only, at the git tag
`archive/swarm-infisical`.

## Architecture

```
                        Cloudflare DNS
                              │
             ┌────────────────▼──────────────────────────────────┐
             │ Hetzner VPS (Terraform; fixed primary IP)          │
             │                                                    │
             │  caddy ── TLS (Let's Encrypt, DNS-01 via Cloudflare)│
             │   │  retries an upstream for 30 s (lb_try_duration) │
             │   ├──► germinal_app          /opt/germinal          │  prod stack
             │   └──► germinal_staging_app  /opt/germinal-staging  │  staging stack
             │          │                                          │
             │          ├──► postgres  (db germinal / germinal_staging, one role each)
             │          └──► redis     (db 0 prod / db 1 staging)  │
             │                                                    │
             │  infisical-agent (systemd) ── renders env/*.env ───┤◄── Infisical `germinal`
             │  germinal-backup / -snapshot (systemd timers) ─────┼──► S3 backup bucket
             └────────────────────────────────────────────────────┘
```

- **One VPS, two Compose stacks.** Production (`/opt/germinal`) runs the app
  plus the services both stacks share: Postgres, Redis and Caddy. Staging
  (`/opt/germinal-staging`) runs only its app, with its own database and its
  own database role, which cannot connect to production's database. Both join
  the external `germinal_network`. Details: [infrastructure/compose/README.md](../../infrastructure/compose/README.md).
- **Configuration comes only from Infisical.** The Infisical Agent on the
  server renders one env file per consumer (`app.env`, `postgres.env`,
  `caddy.env`, `backup.env`, `admin.env`), root-only `0600`, and polls every
  60 s. When a rendered file changes, it recreates only the service that reads
  it: the app or Caddy. **Postgres is never restarted** by a value change,
  because its password applies only when the database is first created. No
  secret is in the repo, in Ansible, in GitHub or in a server-side `.env`.
  Details: [roles/infisical_agent](../../infrastructure/ansible/roles/infisical_agent/README.md).
- **Caddy's retry window.** Caddy holds a request for up to 30 s while the app
  container is being recreated, so a deploy shows as a short wait, not an error.
- **Images** are `henga/germinal:<commit sha>`, built by CI from `main` and
  pulled from Docker Hub. `/api/health` reports the SHA a stack is serving.
- **Provisioning:** Terraform ([infrastructure/terraform](../../infrastructure/terraform/README.md))
  creates the server, DNS, buckets and IAM. Ansible ([infrastructure/ansible](../../infrastructure/ansible/README.md))
  sets the server up. Neither releases the app.

## Releasing

| Step | What happens |
| --- | --- |
| Push to `main` | `.github/workflows/ci.yml`: unit tests; the `migrations` job (applies every migration to an empty database and fails on schema drift); the `try-path` job (the README's try path); build and push `henga/germinal:<sha>`; then **deploy staging**. |
| Check staging | `https://staging.germinalstudio.co`. `/api/health` reports the SHA. |
| **Promote to production** | Actions → *Promote to production* → Run workflow, **no input**: it ships the exact SHA staging reports. |

Both deploys go through the same server-side command, `deploy <stack> <sha>`:

1. pull the image;
2. run the migrations as a one-off. If they fail, the deploy stops and the running app keeps serving;
3. run the idempotent admin bootstrap;
4. recreate the app;
5. wait until `/api/health` reports the SHA.

CI reaches that command through a **deploy gate**. The CI key can run
`deploy <staging|prod> <sha>` for a commit on `main`, and nothing else. The
server reads `deploy` and the compose file from the repo at that SHA, so CI
uploads nothing (issue 017).

### Rollback

Run **Promote to production** with the earlier SHA as input. This rolls back
the image, the compose file and the deploy script together, because all three
come from that commit. It does **not** roll back the database schema. That's
why every migration must follow the migration rule below.

### The migration rule

Every migration must work with the **previous** version of the app:

- migrations run *before* the new container starts, so the old app runs
  against the new schema for a moment;
- a rollback runs the old app against the new schema indefinitely.

So:

- **Add first, remove later.** Add a column, table or enum value in one
  release. Stop using the old one in the next release, and drop it only in a
  later one.
- New columns must be nullable or have a default.
- No renames in one step: add the new column, copy the data, switch the
  code over, then drop the old column in a later release.

Migrations are generated with `npx drizzle-kit generate` and never written
by hand. CI's `migrations` job rejects any drift between the schema and the
committed migrations.

### Maintenance mode

`MAINTENANCE_MODE=true` in Infisical `prod/app` sends all public traffic to
`/maintenance`. `/api/health` and the admin and staff areas stay reachable.
Change the value and the Agent recreates the app within about a minute. To
open the site, set it to `false`. Admins can also switch maintenance on from
site settings, but the environment variable always wins when it is `true`.

## When Infisical is down

- **The running stacks keep working.** The Agent keeps the last files it
  rendered and doesn't blank them when it can't fetch. Issue 005 tested this
  with the API blocked. Deploys keep working too: they read the files that
  are already on the server.
- **A value change waits** until Infisical is back. The Agent retries on its own.
- **Operator work that needs Infisical stops:** `make env`, `./tf.sh`,
  `make setup`.
- **Lockout.** Universal Auth locks the identity out after repeated failed
  logins, and the Agent's retries renew the lockout. Stop the Agent, clear
  the lockout in the Infisical UI, then start the Agent again.
- **If Infisical is gone for good**, recreate the project from the weekly
  encrypted snapshot (below).

## Backups and recovery

These run as root systemd timers on the server
([roles/backup](../../infrastructure/ansible/roles/backup/README.md)):

| What | When | Where |
| --- | --- | --- |
| `pg_dump` of the production database, plus a config archive (no secrets) | daily, around 03:00 Paris time | `<tier>/db/`, `<tier>/config/` in `production-germinal-backups` |
| Infisical `prod`, encrypted with the operator's `age` public key | Sundays, around 04:00 | `weekly/infisical/` |

- **The backup key can't delete anything.** S3 lifecycle rules expire old
  backups.
- **The server can't read the snapshots.** The `age` private key exists only
  in the operator's password manager.
- **Restore test:** `germinal-restore-test`, run as root, restores the newest
  dump into a throwaway container.
- **The recovery procedures** cover three cases: the database, a lost
  server, and a lost Infisical. They're in the role README.

## Credentials and rotation

| Credential | Lives in | Rotate |
| --- | --- | --- |
| `germinal-vps` (the Agent's Infisical identity) | password manager; the server's root-only `/etc/infisical-agent/credentials/` | **every 3 months** (1 Dec, 1 Mar, 1 Jun, 1 Sep), and at once if it may have leaked; see below |
| App AWS keys (`/s3`) | Infisical, written by Terraform | `./tf.sh apply -replace='aws_iam_access_key.app_user["production"]'` (or `"staging"`) |
| Backup AWS key (`prod/backup`) | Infisical, written by Terraform | `./tf.sh apply -replace=aws_iam_access_key.backup` |
| Terraform's own inputs | Infisical `germinal-infra` | in each provider's console, then update `germinal-infra` |
| Twilio API keys (`/twilio`) | Infisical, created by hand | [infrastructure/terraform/README.md](../../infrastructure/terraform/README.md#twilio-api-keys-manual) |
| Stripe, Cloudflare (`/stripe`, `/caddy`) | Infisical | in the provider's console, then update Infisical; the Agent recreates the consumer |
| CI deploy key (`germinal-ci`) | private half only in GitHub `SSH_PRIVATE_KEY` | new key pair → `deploy_ci_ssh_public_keys` in the keys file → `make setup` → update the GitHub secret |
| Docker Hub token | password manager + GitHub `DOCKERHUB_TOKEN` | new token in Docker Hub, update GitHub, revoke the old one |
| Operator SSH keys | each computer's own `~/.ssh/germinal-<computer>` | new key → keys file → `make setup`; root and the deploy user follow the file |
| `age` recovery key, Infisical 2FA recovery codes | password manager only | — |

**Rotating `germinal-vps`.** The free Infisical plan can't restrict this
identity to the server's IP, so rotation is its main protection.

1. In Infisical: Access Control → Identities → `germinal-vps` → Universal
   Auth → create a new client secret. Save it in your password manager.
2. From `infrastructure/ansible`, re-run the Agent role with the new secret.
   It prompts for the client ID and secret:
   `ansible-playbook -i inventory/hosts.yml playbooks/infisical-agent.yml -e ansible_host=<ip>`.
3. Check the Agent works: `systemctl status infisical-agent` is active, and
   the files in `/opt/germinal*/env/` were rewritten. The re-run restarts no
   app container when no value changed.
4. **Revoke the old client secret** in Infisical.

## The repository is public

The GitHub repository is public, on purpose. The consequences:

- **Nothing secret is ever committed.** Values live in Infisical; the repo
  holds only templates, key *names* and public identifiers. Those include the
  Infisical project ID, the `age` *public* key and the Cloudflare zone ID,
  which grant nothing on their own.
- **Anyone can read the infrastructure code**: server layout, hardening,
  deploy gate. The security can't depend on any of it staying hidden.
- **Anyone can fork and open pull requests.** CI deploys only on a push to
  `main`, and the deploy gate refuses any SHA that is not on `main`. Commits
  from forks are not on `main`, even though GitHub serves them under this
  repo's URL. `main` is protected: no force-push, no deletion, and the rule
  also applies to admins. Whoever can push to `main` can ship to staging, and
  then to production through Promote.
- **Keep GitHub secret scanning and push protection on** (Settings → Code
  security). They catch a token pasted by mistake before it reaches the repo.
  If a secret is ever pushed, rotate it: deleting the commit doesn't help,
  since forks and caches keep it.
- **`docs/issues/`, `docs/prd/` and `md/` are gitignored:** working notes
  stay local.

## Where to look

| Topic | Doc |
| --- | --- |
| Compose files, `deploy`, the deploy gate, the local harness | [infrastructure/compose/README.md](../../infrastructure/compose/README.md) |
| Server setup, roles, hardening | [infrastructure/ansible/README.md](../../infrastructure/ansible/README.md) |
| The Infisical Agent and its render matrix | [roles/infisical_agent/README.md](../../infrastructure/ansible/roles/infisical_agent/README.md) |
| Backups, restore test, recovery | [roles/backup/README.md](../../infrastructure/ansible/roles/backup/README.md) |
| Terraform, `tf.sh`, `germinal-infra` | [infrastructure/terraform/README.md](../../infrastructure/terraform/README.md) |
| Env templates and `make env` | [infrastructure/infisical/templates/README.md](../../infrastructure/infisical/templates/README.md) |
