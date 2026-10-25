# observability role

Runs the monitoring agent ([Grafana Alloy](https://grafana.com/docs/alloy/))
in the production stack. It **pushes** everything to the homelab
(`ingest.henga.dev`), because the origin firewall lets in nothing but
Cloudflare, so nothing outside could scrape this server.

| Collected | From | Lands in |
| --- | --- | --- |
| App metrics, prod and staging (`http_requests_total`, latency, DB queries, bookings, Node process) | `germinal_app:3001/metrics`, `germinal_staging_app:3001/metrics` over `germinal_network` | VictoriaMetrics, label `env` |
| Host CPU, memory, disk, network | `/proc`, `/sys`, `/` mounted read-only | VictoriaMetrics, label `host="germinal-vps"` |
| Backup heartbeat (`germinal_backup_last_success_timestamp_seconds`) | `/var/lib/germinal-metrics/*.prom`, written by `germinal-backup` | VictoriaMetrics |
| Container logs (`germinal_*`) | Docker API through `socket_proxy` (GET on containers and networks only) | Loki, label `container` |
| Caddy access logs | `/opt/germinal/caddy/logs` | Loki, label `job="caddy"` |

Dashboards and alerts (Telegram) live at `grafana.henga.dev`; errors from the
app's Sentry SDK go to GlitchTip at `errors.henga.dev`. Both are set up in
the homelab repo (`docker/observability/`).

## What never leaves the server

Before shipping, `loki.process "scrub"` (in `files/config.alloy`) removes:

- bearer tokens in URLs (`/tickets/…`, `/reset-password/…`,
  `/api/reservations/…` become `[token]`), the same rule as the app's
  `redactUrl` for GlitchTip;
- query strings;
- visitor IPs (Caddy's `remote_ip`/`client_ip`, `Cf-Connecting-Ip`,
  `X-Forwarded-For`, `X-Real-Ip`, and any bare IPv4).

The files on the server keep everything (fail2ban reads them).

## Setup

1. Infisical `germinal` → `prod` → `/observability`: `INGEST_URL` =
   `https://ingest.henga.dev`, `INGEST_TOKEN` = the homelab's `INGEST_TOKEN`.
2. `playbooks/infisical-agent.yml`: the Agent learns the new template and
   renders `env/observability.env`.
3. Promote a release whose compose file has the `alloy` service, then run
   this role: `ansible-playbook … playbooks/site.yml --tags observability`.

From then on a change in `/observability` recreates Alloy within a minute
(the Agent), and a change in `files/config.alloy` is applied by re-running
the role.

## Checking it

```sh
docker logs germinal_alloy --since 10m   # push errors show up here
```

The "Germinal app metrics missing" alert fires when nothing arrives for
five minutes, so a dead agent doesn't go unnoticed.
