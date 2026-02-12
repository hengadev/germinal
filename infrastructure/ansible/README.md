# Germinal Ansible Configuration

Automated VPS provisioning and application deployment using Ansible.

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
- **Nginx reverse proxy** - application bound to localhost, nginx handles TLS
- **Docker metrics** - bound to localhost only (127.0.0.1:9323)
- **Ansible Vault** - encrypted secrets management

### System Setup
- Docker & Docker Compose installation
- Non-root deploy user with **restricted sudo**
- Nginx reverse proxy with SSL/TLS and security headers
- Application directory structure
- Logrotate configuration

### SSL/TLS Configuration
- Nginx reverse proxy with TLS termination
- Security headers (HSTS, X-Frame-Options, CSP)
- Cloudflare Origin Certificate support
- OCSP stapling enabled

### Application Deployment
- Docker Compose configuration
- Environment file management
- Health check scripts
- Service management scripts

### Database Backups
- Automated PostgreSQL backups to S3
- Tiered retention (daily/weekly/monthly)
- S3 lifecycle integration
- AWS CLI configuration

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
```

### VPS Access

You need:
- Root SSH access to your VPS
- Your public SSH key (`~/.ssh/germinal.pub`)

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
export DEPLOY_SSH_PUBLIC_KEY="$(cat ~/.ssh/germinal.pub)"

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

### 2. Configure Environment Variables

After setup completes, SSH into the server and configure your `.env`:

```bash
# SSH as deploy user
ssh deploy@$(cd ../terraform && terraform output -raw server_ipv4_address)

# Edit environment file
cd /opt/germinal
nano .env
```

Required variables:
```bash
# Database
POSTGRES_USER=germinal
POSTGRES_PASSWORD=<secure_password>
POSTGRES_DB=germinal

# Session
SESSION_SECRET=<random_32_char_string>

# AWS S3 (from Terraform outputs)
S3_BUCKET=<from terraform>
S3_REGION=eu-central-1
AWS_ACCESS_KEY_ID=<from terraform>
AWS_SECRET_ACCESS_KEY=<from terraform>

# Email (Amazon SES)
SMTP_HOST=email.eu-central-1.amazonaws.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=<SES_SMTP_user>
SMTP_PASSWORD=<SES_SMTP_password>
SMTP_FROM_EMAIL=noreply@yourdomain.com
SMTP_FROM_NAME=Germinal

# Contact
CONTACT_EMAIL=you@yourdomain.com
```

### 3. Deploy Application

```bash
# Using Ansible
ansible-playbook playbooks/deploy.yml \
  -e "ansible_host=$ANSIBLE_HOST"

# Or manually on the server
ssh deploy@<server-ip>
cd /opt/germinal
./prod-start.sh
```

### 4. Setup Database Backups

```bash
# Get backup bucket from Terraform
BACKUP_BUCKET=$(cd ../terraform && terraform output -raw backup_bucket_name)

# Run backup setup
ansible-playbook playbooks/backup.yml \
  -e "ansible_host=$ANSIBLE_HOST" \
  -e "backup_s3_bucket=$BACKUP_BUCKET" \
  -e "backup_aws_access_key=<your_key>" \
  -e "backup_aws_secret_key=<your_secret>"
```

## Playbooks

### `site.yml` - Complete Setup

Run this on a fresh VPS to set up everything:

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
- `app` - Application deployment

### `deploy.yml` - Application Deployment

Deploy or update the application only:

```bash
ansible-playbook playbooks/deploy.yml \
  -e "ansible_host=<server-ip>" \
  -e "app_repo=git@github.com:yourusername/germinal.git" \
  -e "app_branch=main"
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
| `app_port` | Application port | `3000` |
| `ssh_port` | SSH port | `22` |

### Group Variables (`group_vars/all.yml`)

| Variable | Description | Default |
|----------|-------------|---------|
| `deploy_user` | Deploy user name | `deploy` |
| `deploy_ssh_public_key` | SSH public key | Required |
| `auto_security_updates` | Enable auto updates | `true` |
| `fail2ban_enabled` | Enable fail2ban | `true` |
| `backup_enabled` | Enable backups | `true` |

### Application Environment Variables

**Use Ansible Vault for sensitive variables!** See [VAULT.md](VAULT.md) for details.

```bash
# Create and encrypt vault
cp group_vars/all.vault.example.yml group_vars/all.vault.yml
nano group_vars/all.vault.yml  # Add your actual values
ansible-vault encrypt group_vars/all.vault.yml

# Run playbooks with vault
ansible-playbook playbooks/site.yml --ask-vault-pass
```

For non-sensitive variables, pass as extra vars:

```bash
ansible-playbook playbooks/site.yml \
  -e "app_domain=yourdomain.com"
```

## Directory Structure

```
infrastructure/ansible/
├── ansible.cfg                 # Ansible configuration
├── inventory/
│   └── hosts.yml              # Inventory file
├── group_vars/
│   └── all.yml                # Global variables
├── playbooks/
│   ├── site.yml               # Complete setup
│   ├── deploy.yml             # Application deployment
│   ├── backup.yml             # Backup configuration
│   └── templates/             # Backup templates
└── roles/
    ├── system/                # Base system hardening
    ├── ssh/                   # SSH hardening
    ├── firewall/              # UFW configuration
    ├── docker/                # Docker installation
    ├── user/                  # Deploy user setup
    └── app/                   # Application deployment
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
  - `systemctl` (docker, nginx)
  - Application scripts in `/opt/germinal/scripts/`
- Optional password-based sudo for other commands
- See `/opt/germinal/scripts/test-sudo.sh` to verify

### Firewall (UFW)
- Default deny incoming
- Allow SSH (port 22), HTTP (80), HTTPS (443) only
- Rate limit SSH connections

### Nginx Reverse Proxy
- Application bound to localhost (127.0.0.1) only
- Nginx handles external connections with TLS
- Security headers: HSTS, X-Frame-Options, CSP
- Rate limiting per IP address
- Large file upload support (configurable)

### Docker Security
- Metrics endpoint bound to localhost only (127.0.0.1:9323)
- Users in docker group have root-equivalent access
- Only add trusted users to docker group

### System Updates
- Automatic security updates (unattended-upgrades)
- Daily package list updates
- Configurable reboot behavior

## Maintenance

### Update Application

```bash
# Pull latest image and restart
ansible-playbook playbooks/deploy.yml \
  -e "ansible_host=<server-ip>"
```

### Manual Backup

```bash
ssh deploy@<server-ip>
cd /opt/germinal
./scripts/backup-db.sh daily
```

### View Logs

```bash
ssh deploy@<server-ip>
docker compose -f /opt/germinal/docker-compose.yml logs -f
```

### Check Service Status

```bash
ssh deploy@<server-ip>
docker compose -f /opt/germinal/docker-compose.yml ps
```

## Troubleshooting

### Connection Refused

Make sure you can reach the server:
```bash
ping <server-ip>
ssh root@<server-ip>
```

### Permission Denied

Check your SSH key is configured:
```bash
cat ~/.ssh/germinal.pub
```

### Playbook Fails

Run with verbose output:
```bash
ansible-playbook playbooks/site.yml -vvv
```

### Service Not Starting

Check logs:
```bash
ssh deploy@<server-ip>
docker compose -f /opt/germinal/docker-compose.yml logs
```

## Security Checklist

After initial setup, verify:

- [ ] SSH password authentication disabled
- [ ] Root login disabled
- [ ] UFW firewall enabled
- [ ] Fail2ban running
- [ ] Deploy user has sudo access
- [ ] Docker containers running as non-root
- [ ] Environment files have correct permissions (0600)
- [ ] Backups configured

## Next Steps

1. Set up monitoring (optional)
2. Configure SSL certificates (Cloudflare handles this)
3. Set up CI/CD pipeline
4. Configure log aggregation
5. Set up staging environment
