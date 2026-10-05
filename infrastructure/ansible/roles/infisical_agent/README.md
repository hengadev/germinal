# infisical_agent

Turns the server into an [Infisical Agent](https://infisical.com/docs) host (ADR 0004, issue 008): the Agent runs as a systemd service, renders one env file per consumer from the `germinal` Infisical project every 60 s, and recreates the affected container when a rendered file changes.

Implements PRD module M3 (`docs/prd/deployment-infisical-compose.md`).

## What it installs

| Path | Mode | Purpose |
| --- | --- | --- |
| `/usr/bin/infisical` (apt, pinned `0.43.138`) | — | the CLI; ships the Agent (`infisical agent`) |
| `/etc/systemd/system/infisical-agent.service` | 0644 | `Restart=always`, `UMask=0077`, post-start hook |
| `/etc/infisical-agent/config.yaml` | 0644 | Agent config (no secrets: paths only) |
| `/etc/infisical-agent/credentials/` | 0700 | root-only |
| `/etc/infisical-agent/credentials/client-id`, `client-secret` | 0400 | the `germinal-vps` machine identity |
| `/etc/infisical-agent/credentials/token-sink.json` | (0600 via umask) | the Agent's refreshable access token |
| `/etc/infisical-agent/templates/<env>-<name>.env.tmpl` | 0644 | per-stack copies of [issue 006's templates](../../../../infisical/templates/README.md), `__GERMINAL_ENV__` substituted |
| `/etc/infisical-agent/post-start.sh` | 0750 | covers the Agent's first-render gap (below) |
| `<stack root>/env/*.env` | 0600 (root) | the rendered files (`/opt/germinal/env`, `/opt/germinal-staging/env`) |

## Render matrix

From `infisical_agent_templates` in `defaults/main.yml` (`name` = template and rendered file, `service` = the compose service it feeds — they differ on staging, where services carry a `staging_` prefix so their names never collide with prod's DNS aliases on the shared network):

| Env | Template | Rendered to | Recreates (`up -d --no-deps …`) |
| --- | --- | --- | --- |
| prod | app | `/opt/germinal/env/app.env` | `app` in `/opt/germinal` |
| prod | postgres | `/opt/germinal/env/postgres.env` | nothing — `POSTGRES_PASSWORD` applies at first init only (ADR 0004) |
| prod | caddy | `/opt/germinal/env/caddy.env` | `caddy` in `/opt/germinal` |
| prod | backup | `/opt/germinal/env/backup.env` | nothing — the backup job reads it fresh each run |
| prod | admin | `/opt/germinal/env/admin.env` | nothing — the next deploy's bootstrap reads it |
| staging | app | `/opt/germinal-staging/env/app.env` | `staging_app` in `/opt/germinal-staging` |
| staging | admin | `/opt/germinal-staging/env/admin.env` | nothing |

Staging renders only `app` and `admin`: it shares prod's Postgres, Redis and Caddy (PRD M5). `--no-deps` guarantees a change can never bounce the shared services. The stack roots and service names **must match** the compose layout installed by issues 007/009 (`infrastructure/compose/`) — they are role variables (`infisical_agent_stack_roots`, the `service` field) so a layout change is one edit.

Because the rendered env files are root-only `0600`, deploys that run `docker compose` must do so with root rights (e.g. `sudo docker compose …`; the deploy user already has passwordless `docker` sudo). The `deploy` script from issue 007 (`infrastructure/compose/deploy`) documents its CI invocation accordingly.

## The credential

The `germinal-vps` client ID and secret are **read from the operator at run time only** — never from a file in the repo and never from the Ansible Vault (ADR 0004):

- `INFISICAL_AGENT_CLIENT_ID` / `INFISICAL_AGENT_CLIENT_SECRET` exported on the control machine (the role's defaults pick them up), or
- the prompts in [`playbooks/infisical-agent.yml`](../../playbooks/infisical-agent.yml) (the secret is not echoed).

Every task that touches the values runs with `no_log: true`, so they never appear in Ansible output at any verbosity. On the server they live only in the two `0400` root-owned files above.

**Rotation** (operator checklist, Phase 9): create the new client secret in Infisical, re-run the role with it (`INFISICAL_AGENT_CLIENT_SECRET=… ansible-playbook playbooks/infisical-agent.yml …`), check the Agent is healthy, then revoke the old secret in Infisical. The re-run restarts the Agent with the new secret and — because the rendered files are unchanged — **no app container is restarted** (see post-start below).

## Agent behaviours the role compensates for (issue 005 findings)

- **Go `{{ }}` braces**: the env templates are deployed with `copy` after `__GERMINAL_ENV__` is substituted on the control node — never the `template` module, which would choke on the same brace syntax.
- **60 s minimum polling interval**: shorter values make the Agent shut down; the role asserts the configured interval is at least 60 s and defaults to `60s`.
- **Config errors exit with status 0**: the unit uses `Restart=always`, not `on-failure`.
- **Rendered files are created 0644**: the unit sets `UMask=0077`, so everything the Agent writes (env files, token sink) lands as root-owned `0600`; the role additionally sweeps any pre-existing rendered files to `0600`.
- **The `execute` command never runs on the first render after a start**: `ExecStartPre` snapshots checksums of the rendered files before the Agent starts, and `ExecStartPost` (`post-start.sh apply`) waits for the first render, then recreates the compose services once — only when the content actually changed. This covers *every* Agent restart (role re-run, rotation, systemd auto-restart, reboot), and is a no-op when nothing changed: `docker compose up -d` does not touch containers whose configuration is unchanged.
- **One `listSecrets` call per template**: already true in the templates from issue 006; the role adds none.

## Usage

```sh
cd infrastructure/ansible

# standalone install / rotation (prompts for the credential)
ansible-playbook -i inventory/hosts.yml playbooks/infisical-agent.yml \
  -e "ansible_host=<server-ip>"

# or non-interactively
INFISICAL_AGENT_CLIENT_ID=… INFISICAL_AGENT_CLIENT_SECRET=… \
  ansible-playbook -i inventory/hosts.yml playbooks/infisical-agent.yml \
  -e "ansible_host=<server-ip>"
```

`playbooks/site.yml` also includes the role: it runs when the two environment variables are set on the control machine, and is skipped (with a note) otherwise.

The role never reads the Ansible Vault (or any `vault_*` variable).
