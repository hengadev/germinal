# Germinal Ansible Setup Guide

Quick guide to provision your VPS after Terraform deployment.

---

## Prerequisites

Install Ansible and required collections locally:

```bash
pip install ansible
ansible-galaxy collection install community.docker community.general
```

Ensure you have your SSH key at `~/.ssh/germinal.pub`.

---

## Quick Start (Complete Setup)

### 1. Get Terraform Outputs

```bash
cd infrastructure/terraform
terraform output server_ipv4_address
terraform output domain_name
terraform output iam_access_key_id
terraform output iam_access_key_secret
```

### 2. Configure Ansible Vault

```bash
cd infrastructure/ansible
cp group_vars/all.vault.example.yml group_vars/all.vault.yml
nano group_vars/all.vault.yml
```

Fill in the required values:
```yaml
# Generate strong passwords
vault_db_password: "your_secure_postgres_password"
vault_session_secret: "your_random_32_character_string"

# From Terraform outputs
vault_aws_access_key_id: "<from terraform>"
vault_aws_secret_access_key: "<from terraform>"
vault_aws_region: "eu-west-3"
vault_s3_bucket: "development-germinal-media"
vault_s3_region: "eu-west-3"

# Email
vault_smtp_from_email: "noreply@germinalstudio.co"
vault_smtp_from_name: "Germinal"
vault_contact_email: "you@germinalstudio.co"
```

Encrypt the vault:
```bash
ansible-vault encrypt group_vars/all.vault.yml
```

### 3. Run Initial Setup

```bash
make setup
```

This prompts for confirmation, then runs the complete site playbook.

### 4. Deploy Application

```bash
make deploy
```

### 5. Configure Backups (Optional)

```bash
make backup
```

---

## What `make setup` Does

| Task | Description |
|------|-------------|
| **System** | Base hardening, automatic updates, kernel parameters |
| **SSH** | Key-only auth, root login disabled, fail2ban |
| **Firewall** | UFW with ports 22, 80, 443 only |
| **User** | Creates `deploy` user with restricted sudo |
| **Docker** | Installs Docker & Docker Compose |
| **Nginx** | Reverse proxy with TLS, security headers |

---

## Manual Commands (Without Makefile)

### Initial Setup

```bash
ansible-playbook -i inventory/hosts.yml playbooks/site.yml \
  --ask-vault-pass \
  -e "ansible_host=46.225.25.238" \
  -e "deploy_ssh_public_key=$(cat ~/.ssh/germinal.pub)" \
  -e "app_domain=germinalstudio.co"
```

### Deploy Application

```bash
ansible-playbook -i inventory/hosts.yml playbooks/deploy.yml \
  --ask-vault-pass \
  -e "ansible_host=46.225.25.238"
```

### Configure Backups

```bash
ansible-playbook -i inventory/hosts.yml playbooks/backup.yml \
  --ask-vault-pass \
  -e "ansible_host=46.225.25.238" \
  -e "backup_s3_bucket=development-germinal-backups" \
  -e "backup_aws_access_key=<key>" \
  -e "backup_aws_secret_key=<secret>"
```

---

## Useful Makefile Commands

| Command | Description |
|---------|-------------|
| `make help` | Show all available commands |
| `make setup` | Complete VPS setup (first time) |
| `make deploy` | Deploy/update application |
| `make backup` | Configure database backups |
| `make ssh-info` | Display SSH connection details |
| `make status` | Check service status on server |
| `make logs` | Stream application logs |
| `make health-check` | Run health check |
| `make check-clean` | Check playbooks for syntax errors |
| `make install-deps` | Install Ansible dependencies |

---

## SSH Access

After setup, connect as the `deploy` user:

```bash
# View connection info
make ssh-info

# Connect
ssh deploy@46.225.25.238
```

Root login is **disabled** for security. Use `deploy` with sudo.

---

## Troubleshooting

### View Vault Contents

```bash
ansible-vault view group_vars/all.vault.yml
```

### Edit Vault

```bash
ansible-vault edit group_vars/all.vault.yml
```

### Run with Verbose Output

```bash
ansible-playbook playbooks/site.yml -vvv
```

### Check Service Status

```bash
ssh deploy@46.225.25.238
docker compose -f /opt/germinal/docker-compose.yml ps
```

### View Logs

```bash
ssh deploy@46.225.25.238
docker compose -f /opt/germinal/docker-compose.yml logs -f
```

---

## Security Checklist

After setup, verify:

- [ ] SSH password authentication disabled
- [ ] Root login disabled
- [ ] UFW firewall enabled
- [ ] Fail2ban running
- [ ] Deploy user has sudo access
- [ ] Environment files have correct permissions (0600)

---

## Terraform Outputs Reference

| Output | Example | Usage |
|--------|---------|-------|
| `server_ipv4_address` | `46.225.25.238` | Ansible `ansible_host` |
| `domain_name` | `germinalstudio.co` | Ansible `app_domain` |
| `iam_access_key_id` | `AKIA...` | Vault `vault_aws_access_key_id` |
| `iam_access_key_secret` | `...` | Vault `vault_aws_secret_access_key` |
| `backup_bucket_name` | `development-germinal-backups` | Backup playbook |

---

## File Structure

```
infrastructure/ansible/
├── Makefile                      # Quick commands
├── README.md                     # Detailed documentation
├── SETUP_GUIDE.md                # This file
├── VAULT.md                      # Vault usage guide
├── ansible.cfg                   # Ansible config
├── inventory/
│   └── hosts.yml                 # Server inventory
├── group_vars/
│   ├── all.yml                   # Non-sensitive variables
│   ├── all.vault.example.yml     # Vault template
│   └── all.vault.yml             # Your encrypted secrets
├── playbooks/
│   ├── site.yml                  # Complete setup
│   ├── deploy.yml                # Application deployment
│   └── backup.yml                # Backup configuration
└── roles/
    ├── system/                   # Base hardening
    ├── ssh/                      # SSH configuration
    ├── firewall/                 # UFW setup
    ├── docker/                   # Docker installation
    ├── user/                     # Deploy user
    ├── nginx/                    # Reverse proxy
    ├── fail2ban/                 # Brute-force protection
    └── app/                      # Application deployment
```
