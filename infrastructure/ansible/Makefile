# Germinal Ansible Makefile
# Usage: make <target>
#
# This Makefile provisions the server; it never releases. Releases go
# through CI (.github/workflows): a push to main deploys staging, and the
# Promote-to-production workflow ships the SHA staging is serving.

.PHONY: help setup check-clean lint \
        ssh-info status staging-status logs staging-logs \
        install-deps vars-test terraform-outputs

# Default target
help:
	@echo "Germinal Ansible Commands"
	@echo "============================"
	@echo ""
	@echo "Setup (needs only an SSH key and 'infisical login' on this machine):"
	@echo "  make setup           - Complete VPS setup (first time only)"
	@echo ""
	@echo "Releases: NOT here. CI deploys (.github/workflows): a push to main"
	@echo "  deploys staging; 'Promote to production' ships the SHA staging serves."
	@echo ""
	@echo "Verification:"
	@echo "  make check-clean  - Check for syntax errors"
	@echo "  make lint         - Run ansible-lint"
	@echo "  make vars-test    - Display effective variables"
	@echo ""
	@echo "Server Operations (read-only):"
	@echo "  make ssh-info        - Display SSH connection details"
	@echo "  make status          - Check production service status"
	@echo "  make staging-status  - Check staging service status"
	@echo "  make logs            - View production logs"
	@echo "  make staging-logs    - View staging logs"
	@echo ""
	@echo "Dependencies:"
	@echo "  make install-deps - Install Ansible dependencies"

# VPS IP and domain from Terraform (through ../terraform/tf.sh: plain
# `terraform` has no credentials). Evaluated only by the targets using them.
VPS_IP=$(shell ../terraform/tf.sh output -raw server_ipv4_address 2>/dev/null || echo "")
DOMAIN=$(shell ../terraform/tf.sh output -raw domain_name 2>/dev/null || echo "")

# Operator keys (one per computer) and the CI key, kept outside the repo:
#   deploy_ssh_public_keys: [...]      deploy_ci_ssh_public_keys: [...]
KEYS_FILE ?= $(HOME)/germinal-deploy-keys.yml

# ============================================
# Setup Commands
# ============================================

# Complete VPS setup (fresh server, and every later setup change). Export
# INFISICAL_AGENT_CLIENT_ID / _SECRET first to install the Agent in the same run.
setup:
	@echo "==========================================="
	@echo "Germinal VPS Setup"
	@echo "==========================================="
	@echo ""
	@if [ -z "$(VPS_IP)" ]; then \
		echo "Error: Could not get VPS IP from Terraform."; \
		echo "Run 'infisical login', then 'cd ../terraform && ./tf.sh output server_ipv4_address'"; \
		exit 1; \
	fi
	@echo "VPS IP: $(VPS_IP)"
	@echo "Domain: $(DOMAIN)"
	@echo "Keys file: $(KEYS_FILE)"
	@test -f "$(KEYS_FILE)" || { echo "Error: $(KEYS_FILE) not found (see docs/deployment/setup.md)."; exit 1; }
	@echo ""
	@read -p "Continue? [y/N] " confirm && [ "$$confirm" = "y" ] || exit 1
	@echo ""
	@echo "Running setup playbook..."
	ansible-playbook -i inventory/hosts.yml playbooks/site.yml \
		-e "ansible_host=$(VPS_IP)" \
		-e @$(KEYS_FILE) \
		-e "app_domain=$(DOMAIN)"

# ============================================
# Verification Commands
# ============================================

# Check playbooks for syntax errors
check-clean:
	@echo "Checking playbooks for syntax errors..."
	@ansible-playbook playbooks/site.yml --syntax-check
	@ansible-playbook playbooks/infisical-agent.yml --syntax-check
	@echo "All playbooks are clean!"

# Run ansible-lint (requires installation)
lint:
	@echo "Running ansible-lint..."
	@which ansible-lint > /dev/null || (echo "Install with: pip install ansible-lint" && exit 1)
	@ansible-lint playbooks/

# Display effective variables
vars-test:
	@echo "Displaying effective variables..."
	@ansible-playbook -i inventory/hosts.yml playbooks/site.yml \
		-e "ansible_host=$(VPS_IP)" \
		--tags debug --skip-tags never \
		-e "ansible_debug=true" 2>/dev/null || true
	@echo "To see all variables, run:"
	@echo "  ansible-inventory -i inventory/hosts.yml --list"

# ============================================
# Server Operations (read-only, as root: the deploy user has no docker)
# ============================================

# Display SSH connection details
ssh-info:
	@echo "==========================================="
	@echo "SSH Connection Details"
	@echo "==========================================="
	@echo ""
	@echo "VPS IP: $(VPS_IP)"
	@echo "Domain: $(DOMAIN)"
	@echo ""
	@echo "Connect as root (this computer's own key, from deploy_ssh_public_keys):"
	@echo "  ssh root@$(VPS_IP)"
	@echo ""
	@echo "The deploy user can only run the deploy runner; use root for docker and logs."
	@echo ""
	@echo "==========================================="

# Check production service status
status:
	@echo "Checking production service status..."
	@ssh root@$(VPS_IP) "cd /opt/germinal && docker compose ps"

# Check staging service status
staging-status:
	@echo "Checking staging service status..."
	@ssh root@$(VPS_IP) "cd /opt/germinal-staging && docker compose ps"

# View production logs
logs:
	@echo "Streaming production logs (Ctrl+C to exit)..."
	@ssh root@$(VPS_IP) "cd /opt/germinal && docker compose logs -f"

# View staging logs
staging-logs:
	@echo "Streaming staging logs (Ctrl+C to exit)..."
	@ssh root@$(VPS_IP) "cd /opt/germinal-staging && docker compose logs -f"

# ============================================
# Dependencies
# ============================================

# Install Ansible and required collections
install-deps:
	@echo "Installing Ansible dependencies..."
	@pip install ansible
	@ansible-galaxy collection install community.docker community.general
	@echo "Done! Run 'make check-clean' to verify."

# ============================================
# Terraform Integration
# ============================================

# Show Terraform outputs
terraform-outputs:
	@echo "==========================================="
	@echo "Terraform Outputs"
	@echo "==========================================="
	@echo ""
	@../terraform/tf.sh output
