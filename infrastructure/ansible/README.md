# Germinal Ansible Configuration

Automated VPS provisioning using Ansible. The setup needs only an SSH key
and `infisical login` on the control machine — no encrypted variable files,
no local secrets (ADR 0004). Releases never go through Ansible: CI deploys
(see "Releases" below).

## What This Does

### Security Hardening
- SSH key-only authentication (password auth disabled)
- Root login disabled (deploy user with restricted sudo only)
- Fail2ban for SSH brute-force protection (5 attempts = 1 hour ban)
- UFW firewall with only essential ports open
- Automatic security updates (unattended-upgrades)
- Kernel hardening (sysctl, secure shared memory)
- Modern cryptographic algorithms only (Curve25519, ChaCha20)
- **Restricted sudo** - deploy user can only run specific commands
- **Caddy reverse proxy (Docker)** - app reachable only on the Docker network, Caddy handles TLS
- **Docker metrics** - bound to localhost only (127.0.0.1:9323)

### System Setup
- Docker & Docker Compose installation
- Non-root deploy user with **restricted sudo**
- Caddy reverse proxy (Docker container) with automatic SSL/TLS and security headers
- Infisical Agent (systemd service) rendering one env file per consumer (see [the role README](roles/infisical_agent/README.md))
- The compose directory layout under `/opt/germinal` and `/opt/germinal-staging`
- Production's shared services (Postgres, Redis, Caddy) started from `infrastructure/compose/docker-compose.prod.yml`, and the `germinal_staging` database role and database (its `/db` values read through your `infisical login`)
- Logrotate configuration

### SSL/TLS Configuration
- Caddy reverse proxy with TLS termination
- Automatic certificates via Let's Encrypt DNS-01 challenge — the Cloudflare
  token reaches Caddy through its environment (`env/caddy.env`, rendered by
  the Infisical Agent), never through Ansible
- Security headers (HSTS, X-Frame-Options, etc.)
- OCSP stapling enabled

### Configuration Values
Every application and infrastructure value lives in Infisical (ADR 0004):
the Agent renders `app.env`, `postgres.env`, `caddy.env`, `backup.env` and
`admin.env` on the server. The one value Ansible still needs at setup time —
the notification email for fail2ban, unattended-upgrades and ACME — is read
from Infisical `/host` (`NOTIFY_EMAIL`, env `prod`) on the control node
through the operator's own `infisical login`; if the lookup fails, the setup
warns and falls back to `root@localhost`.

## Prerequisites

### Local Machine

```bash
# Install Ansible
sudo apt update
sudo apt install ansible -y

# Or with pip
pip install ansible

# Install required collections
ansible-galaxy collection install community.docker community.general

# Log in to the team's Infisical instance (for the /host lookup and the
# Agent credential prompts)
infisical login
```

### VPS Access

You need:
- Root SSH access to your VPS
- Your public SSH key(s)

### Terraform Outputs

First, run Terraform to get your VPS details:

```bash
cd infrastructure/terraform
terraform output server_ipv4_address
terraform output domain_name
```

## Quick Start

### 1. Initial VPS Setup

```bash
cd infrastructure/ansible

# Set your SSH public key
export DEPLOY_SSH_PUBLIC_KEY="$(cat ~/.ssh/germinal-workstation.pub)"

# Set your domain
export APP_DOMAIN="yourdomain.com"

# Get VPS IP from Terraform
export ANSIBLE_HOST=$(cd ../terraform && terraform output -raw server_ipv4_address)

# Run full setup
ansible-playbook -i inventory/hosts.yml playbooks/site.yml \
  -e "ansible_host=$ANSIBLE_HOST" \
  -e "deploy_ssh_public_key=$DEPLOY_SSH_PUBLIC_KEY" \
  -e "app_domain=$APP_DOMAIN"
```

With `INFISICAL_AGENT_CLIENT_ID` / `INFISICAL_AGENT_CLIENT_SECRET` exported
(or by answering the prompts of `playbooks/infisical-agent.yml`), the
Infisical Agent is installed in the same run and renders the env files.

### 2. Deploy the Application

Releases go through CI, never from your machine:

- A push to `main` builds the image and deploys it to **staging**
  automatically.
- The manual **Promote to production** workflow ships the exact SHA staging
  is serving (and rolls back the same way).

See `.github/workflows/` and `infrastructure/compose/README.md` for the
`deploy <stack> <sha>` entry point those workflows run over SSH.

## Playbooks

### `site.yml` - Complete Setup

Run this on a fresh VPS to set up everything: hardening, Docker, the deploy
user, Caddy, the Infisical Agent (when its credential is provided) and the
compose directory layout, then starts Postgres, Redis and Caddy and creates
the `germinal_staging` database role (`roles/shared_services`, which needs the
Agent's env files). The `infisical_agent` role is included and runs
when `INFISICAL_AGENT_CLIENT_ID` / `INFISICAL_AGENT_CLIENT_SECRET` are
exported on the control machine (see [the role README](roles/infisical_agent/README.md));
without them it is skipped with a note.

```bash
ansible-playbook playbooks/site.yml \
  -e "ansible_host=<server-ip>" \
  -e "deploy_ssh_public_key=$(cat ~/.ssh/germinal.pub)" \
  -e "app_domain=yourdomain.com"
```

Tags:
- `system` - Base system configuration
- `ssh` - SSH hardening
- `firewall` - UFW firewall setup
- `docker` - Docker installation
- `user` - Deploy user setup
- `app` - Compose directory layout

### `infisical-agent.yml` - Install or rotate the Infisical Agent

Installs the Infisical Agent that renders the server's env files from
Infisical (ADR 0004). Prompts for the `germinal-vps` client ID and secret —
they are never read from a file in the repo. Re-running it with a new client
secret is the rotation procedure. See
[roles/infisical_agent/README.md](roles/infisical_agent/README.md).

```bash
INFISICAL_AGENT_CLIENT_ID=… INFISICAL_AGENT_CLIENT_SECRET=… \
  ansible-playbook playbooks/infisical-agent.yml -e "ansible_host=<server-ip>"
```

### `backup.yml` - Database Backups

Configure automated database backups:

```bash
ansible-playbook playbooks/backup.yml \
  -e "ansible_host=<server-ip>" \
  -e "backup_s3_bucket=my-backups" \
  -e "backup_s3_region=eu-central-1"
```

## Variables

### Inventory Variables (`inventory/hosts.yml`)

| Variable | Description | Default |
|----------|-------------|---------|
| `ansible_host` | VPS IP address | Required |
| `app_domain` | Your domain name | `your-domain.com` |

### Group Variables (`playbooks/group_vars/all.yml`)

| Variable | Description | Default |
|----------|-------------|---------|
| `deploy_user` | Deploy user name | `germinal` |
| `deploy_ssh_public_keys` | Deploy user SSH keys (list) | `[]` |
| `host_notify_email` | Notification email (overridden by the Infisical `/host` lookup) | `root@localhost` |
| `auto_security_updates` | Enable auto updates | `true` |
| `fail2ban_enabled` | Enable fail2ban | `true` |
| `backup_enabled` | Enable backups | `true` |

Sensitive values are **not** variables: they live in Infisical and reach the
server through the Agent-rendered env files (ADR 0004).

## Directory Structure

```
infrastructure/ansible/
├── ansible.cfg                 # Ansible configuration
├── inventory/
│   └── hosts.yml              # Inventory file
├── playbooks/
│   ├── group_vars/
│   │   └── all.yml           # Global variables (no secrets)
│   ├── site.yml               # Complete setup
│   ├── infisical-agent.yml    # Agent install / rotation
│   ├── backup.yml             # Backup configuration
│   └── templates/             # Backup templates
└── roles/
    ├── system/                # Base system hardening
    ├── ssh/                   # SSH hardening
    ├── firewall/              # UFW configuration
    ├── docker/                # Docker installation (+ germinal_network)
    ├── user/                  # Deploy user setup (authorized_keys as a list)
    ├── fail2ban/              # Brute-force protection
    ├── caddy/                 # Reverse proxy with retry window
    ├── infisical_agent/       # Infisical Agent (env files, 0600, rotation)
    ├── app/                   # Compose directory layout (nothing else)
    └── shared_services/       # Postgres/Redis/Caddy up, germinal_staging DB role
```

## Security Features

### SSH Hardening
- Password authentication disabled (key-only)
- Root login disabled (use deploy user with sudo)
- SSH banner with security notice
- Modern cryptographic algorithms (Curve25519, ChaCha20-Poly1305)
- Diffie-Hellman key exchange
- Secure ciphers and MACs (encrypt-then-MAC)
- Disabled X11 forwarding, agent forwarding, TCP forwarding
- Client alive interval (5 min) to timeout idle connections
- Fail2ban: 5 failed attempts = 1 hour ban

### Restricted Sudo
- Deploy user can only run specific commands without password:
  - `docker`, `docker-compose`
  - `systemctl` (docker)
- Optional password-based sudo for other commands
- See `/opt/germinal/scripts/test-sudo.sh` to verify

### Firewall (UFW)
- Default deny incoming
- Allow SSH (port 22), HTTP (80), HTTPS (443) only
- Rate limit SSH connections

### Caddy Reverse Proxy
- Caddy runs as a Docker container on the app network
- Application containers are not exposed to the host (Docker network only)
- Automatic TLS via Let's Encrypt DNS-01 challenge (Cloudflare token from the environment)
- Security headers: HSTS, X-Content-Type-Options, X-Frame-Options, Referrer-Policy
- Large file upload support (configurable via `request_body`)

### Docker Security
- Metrics endpoint bound to localhost only (127.0.0.1:9323)
- Users in docker group have root-equivalent access
- Only add trusted users to the docker group

### System Updates
- Automatic security updates (unattended-upgrades)
- Daily package list updates
- Configurable reboot behavior

## Maintenance

### Check Service Status

```bash
ssh germinal@<server-ip>
docker compose -f /opt/germinal/docker-compose.yml ps
```

### View Logs

```bash
ssh germinal@<server-ip>
docker compose -f /opt/germinal/docker-compose.yml logs -f
```

## Troubleshooting

### Connection Refused

Make sure you can reach the server:
```bash
ping <server-ip>
ssh root@<server-ip>
```

### Playbook Fails

Run with verbose output:
```bash
ansible-playbook playbooks/site.yml -vvv
```

### Service Not Starting

Check logs:
```bash
ssh germinal@<server-ip>
docker compose -f /opt/germinal/docker-compose.yml logs
```

## Security Checklist

After initial setup, verify:

- [ ] SSH password authentication disabled
- [ ] Root login disabled
- [ ] UFW firewall enabled
- [ ] Fail2ban running
- [ ] Deploy user has sudo access
- [ ] Agent-rendered env files have correct permissions (0600, root-owned)
- [ ] Backups configured
