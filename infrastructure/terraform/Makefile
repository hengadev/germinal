# Germinal Terraform Makefile
# Usage: make <target>
#
# Every Terraform command runs through ./tf.sh, which wraps it in
# `infisical run` (secrets from the `germinal-infra` project) and hands the
# Infisical provider your own login. Run `infisical login` first.

TF := ./tf.sh

.PHONY: help init plan apply validate fmt show state-list output \
        server-info server-ssh dns-email dns-verify graph clean

# Default target
help:
	@echo "Germinal Terraform Commands (needs: infisical login)"
	@echo "===================================================="
	@echo ""
	@echo "Setup:"
	@echo "  make init          - Initialize Terraform (S3 backend, providers)"
	@echo "  make validate      - Check formatting and validate the configuration"
	@echo ""
	@echo "Operations:"
	@echo "  make plan          - Show planned changes"
	@echo "  make apply         - Apply changes (writes created credentials to Infisical)"
	@echo "  make show          - Show current state"
	@echo "  make state-list    - List resources in the state"
	@echo ""
	@echo "Outputs:"
	@echo "  make output        - Show all outputs"
	@echo "  make server-info   - Show VPS connection details"
	@echo "  make dns-email     - Show email configuration"
	@echo "  make dns-verify    - Show Cloudflare dashboard link"
	@echo ""
	@echo "Server:"
	@echo "  make server-ssh    - SSH into the VPS"
	@echo ""
	@echo "Any other Terraform command: ./tf.sh <command> [args]"
	@echo "  e.g. ./tf.sh apply -replace=hcloud_server.main"

init:
	$(TF) init

plan:
	$(TF) plan

apply:
	$(TF) apply

# Offline checks: no secrets or backend access needed.
validate:
	terraform fmt -check
	terraform validate

fmt:
	terraform fmt -recursive

show:
	$(TF) show

state-list:
	$(TF) state list

output:
	$(TF) output

# ============================================
# Server Commands
# ============================================

server-info:
	@$(TF) output -json | jq -r '"Server: \(.server_name.value)\nIPv4:   \(.server_ipv4_address.value)\nIPv6:   \(.server_ipv6_address.value)\nStatus: \(.server_status.value)\n\nSSH:    \(.ssh_connection_string.value)"'

server-ssh:
	@ssh root@$$($(TF) output -raw server_ipv4_address)

# ============================================
# DNS Commands
# ============================================

dns-email:
	@$(TF) output -raw email_setup_status

dns-verify:
	@$(TF) output -json cloudflare_zone_info | jq -r '.url'

# ============================================
# Utilities
# ============================================

# Generate dependency graph (requires graphviz)
graph:
	terraform graph | dot -Tpng > terraform-graph.png
	@echo "Graph saved to terraform-graph.png"

clean:
	-rm -f terraform-graph.png
	-rm -rf .terraform/
	@echo "Clean complete. Run 'make init' to reinitialize."
