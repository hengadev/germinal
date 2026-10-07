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

# Get VPS IP from Terraform output
VPS_IP=$(shell cd ../terraform && terraform output -raw server_ipv4_address 2>/dev/null || echo "")
DOMAIN=$(shell cd ../terraform && terraform output -raw domain_name 2>/dev/null || echo "")

# Get SSH public key
SSH_KEY=$(shell cat ~/.ssh/germinal.pub 2>/dev/null || cat ~/.ssh/id_rsa.pub 2>/dev/null || echo "")

# ============================================
# Setup Commands
# ============================================

# Complete VPS setup (run once on a fresh server)
setup:
	@echo "==========================================="
	@echo "Germinal VPS Setup"
	@echo "==========================================="
	@echo ""
	@if [ -z "$(VPS_IP)" ]; then \
		echo "Error: Could not get VPS IP from Terraform."; \
		echo "Run 'cd ../terraform && terraform output server_ipv4_address'"; \
		exit 1; \
	fi
	@echo "VPS IP: $(VPS_IP)"
	@echo "Domain: $(DOMAIN)"
	@echo "SSH Key: $(SSH_KEY)"
	@echo ""
	@read -p "Continue? [y/N] " confirm && [ "$$confirm" = "y" ] || exit 1
	@echo ""
	@echo "Running setup playbook..."
	ansible-playbook -i inventory/hosts.yml playbooks/site.yml \
		-e "ansible_host=$(VPS_IP)" \
		-e "deploy_ssh_public_key=$(SSH_KEY)" \
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
# Server Operations (read-only)
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
	@echo "Connect as root:"
	@echo "  ssh -i ~/.ssh/germinal root@$(VPS_IP)"
	@echo ""
	@echo "Connect as deploy user:"
	@echo "  ssh -i ~/.ssh/germinal germinal@$(VPS_IP)"
	@echo ""
	@echo "==========================================="

# Check production service status
status:
	@echo "Checking production service status..."
	@ssh -i ~/.ssh/germinal germinal@$(VPS_IP) "cd /opt/germinal && docker compose ps"

# Check staging service status
staging-status:
	@echo "Checking staging service status..."
	@ssh -i ~/.ssh/germinal germinal@$(VPS_IP) "cd /opt/germinal-staging && docker compose ps"

# View production logs
logs:
	@echo "Streaming production logs (Ctrl+C to exit)..."
	@ssh -i ~/.ssh/germinal germinal@$(VPS_IP) "cd /opt/germinal && docker compose logs -f"

# View staging logs
staging-logs:
	@echo "Streaming staging logs (Ctrl+C to exit)..."
	@ssh -i ~/.ssh/germinal germinal@$(VPS_IP) "cd /opt/germinal-staging && docker compose logs -f"

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
	@cd ../terraform && terraform output
