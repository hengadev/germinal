# Monitoring Operations Guide

The monitoring stack runs four containers on an internal `monitoring` bridge network:
Prometheus (metrics store), Grafana (dashboards), cAdvisor (container metrics), and
node-exporter (host metrics). All endpoints are bound to `127.0.0.1` — use SSH tunnels
to access them from your local machine.

## SSH Tunnels

Open a tunnel to Grafana and Prometheus in one command:

```bash
ssh -L 3001:127.0.0.1:3001 -L 9090:127.0.0.1:9090 germinal@46.225.25.238 -N
```

Then open:
- Grafana:    http://localhost:3001
- Prometheus: http://localhost:9090

For cAdvisor or node-exporter (debugging only):

```bash
ssh -L 8081:127.0.0.1:8081 -L 9100:127.0.0.1:9100 germinal@46.225.25.238 -N
```

## First-Time Grafana Setup

1. Open http://localhost:3001 and log in with `admin` / `<vault_grafana_admin_password>`.
2. Add a Prometheus data source:
   - Settings → Data sources → Add data source → Prometheus
   - URL: `http://prometheus:9090`
   - Save & test
3. Import community dashboards:
   - Dashboards → Import
   - Import ID **1860** (Node Exporter Full) — choose the Prometheus data source
   - Import ID **14282** (Docker cAdvisor) — choose the Prometheus data source

## Key PromQL Queries

**Container memory usage (bytes):**
```promql
container_memory_usage_bytes{name=~"germinal_.*"}
```

**Container memory usage as % of limit:**
```promql
container_memory_usage_bytes{name=~"germinal_.*"}
  / container_spec_memory_limit_bytes{name=~"germinal_.*"} * 100
```

**Host memory available (bytes):**
```promql
node_memory_MemAvailable_bytes
```

**Swap in use:**
```promql
node_memory_SwapTotal_bytes - node_memory_SwapFree_bytes
```

**Disk usage % (root filesystem):**
```promql
(node_filesystem_size_bytes{mountpoint="/"} - node_filesystem_free_bytes{mountpoint="/"})
  / node_filesystem_size_bytes{mountpoint="/"} * 100
```

## Recommended Alert Thresholds

| Condition | Threshold | Severity |
|-----------|-----------|----------|
| Container memory > limit | > 90% | Warning |
| Host free memory | < 200 MB | Warning |
| Host free memory | < 100 MB | Critical |
| Disk usage (/) | > 85% | Warning |
| Disk usage (/) | > 95% | Critical |
| Swap in use | > 0 | Info (investigate) |

## Day-to-Day Operations

**Restart the full monitoring stack:**
```bash
ssh germinal@46.225.25.238 "sudo systemctl restart germinal-monitoring"
```

**Reload Prometheus config without restart** (after editing prometheus.yml):
```bash
ssh germinal@46.225.25.238 "docker exec germinal_prometheus \
  curl -s -X POST http://localhost:9090/-/reload"
```

**Check stack health:**
```bash
ssh germinal@46.225.25.238 "docker ps --filter name=germinal_prometheus --filter name=germinal_grafana --filter name=germinal_cadvisor --filter name=germinal_node_exporter"
```

**View logs for a container:**
```bash
ssh germinal@46.225.25.238 "docker logs --tail 50 germinal_prometheus"
ssh germinal@46.225.25.238 "docker logs --tail 50 germinal_grafana"
```

**Change Grafana admin password:**

1. Set `vault_grafana_admin_password` in `group_vars/all.vault.yml`:
   ```bash
   ansible-vault edit group_vars/all.vault.yml
   # add: vault_grafana_admin_password: "new-strong-password"
   ```
2. Redeploy the monitoring role:
   ```bash
   make deploy
   # or: ansible-playbook playbooks/site.yml --tags monitoring
   ```
   The new password takes effect on the next container restart.
