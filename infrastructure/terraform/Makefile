# Germinal Terraform Makefile
# Usage: make <target>

.PHONY: help init plan apply apply-staging apply-production apply-twilio output credentials destroy destroy-backend \
        fmt validate refresh show graph clean \
        server-info server-ssh server-deploy server-rebuild server-backup \
        dns-info dns-email dns-verify

# Default target
help:
	@echo "Germinal Terraform Commands"
	@echo "============================"
	@echo ""
	@echo "Setup:"
	@echo "  make init          - Initialize Terraform"
	@echo "  make validate      - Validate configuration files"
	@echo ""
	@echo "Operations:"
	@echo "  make plan              - Show planned changes"
	@echo "  make apply             - Apply changes"
	@echo "  make apply-staging     - Apply staging Terraform and auto-update Ansible vault"
	@echo "  make apply-production  - Apply production Terraform and auto-update Ansible vault"
	@echo "  make apply-twilio      - Create Twilio API keys and auto-update Ansible vault files"
	@echo "  make refresh           - Refresh state file"
	@echo "  make show              - Show current state"
	@echo ""
	@echo "Outputs:"
	@echo "  make output        - Show all outputs"
	@echo "  make credentials   - Show AWS S3 credentials"
	@echo "  make server-info   - Show VPS connection details"
	@echo "  make dns-info      - Show DNS records"
	@echo "  make dns-email     - Show email configuration"
	@echo "  make env           - Export environment variables for shell"
	@echo ""
	@echo "Server:"
	@echo "  make server-ssh    - SSH into the VPS"
	@echo "  make server-deploy - Show deployment guide"
	@echo ""
	@echo "DNS:"
	@echo "  make dns-info      - Show application URL and DNS records"
	@echo "  make dns-email     - Show email (Registrar + SES) setup"
	@echo "  make dns-verify    - Show Cloudflare dashboard link"
	@echo ""
	@echo "Destruction:"
	@echo "  make destroy       - Destroy all resources"
	@echo "  make destroy-server - Destroy VPS only"
	@echo "  make destroy-backend - Destroy backend resources (careful!)"
	@echo ""
	@echo "Utilities:"
	@echo "  make fmt           - Format Terraform files"
	@echo "  make graph         - Generate dependency graph"

# Initialize Terraform
init:
	@echo "Initializing Terraform..."
	terraform init

# Show planned changes
plan:
	@echo "Showing planned changes..."
	terraform plan

# Apply changes
apply:
	@echo "Applying Terraform changes..."
	terraform apply

# Create Twilio API keys and auto-update Ansible vault files
apply-twilio:
	@bash ../scripts/update-twilio-vault.sh

# Apply staging Terraform and auto-update Ansible vault with IAM credentials
apply-staging:
	@bash ../scripts/update-staging-vault.sh

# Apply production Terraform and auto-update Ansible vault with IAM credentials
apply-production:
	@bash ../scripts/update-production-vault.sh

# Validate configuration
validate:
	@echo "Validating Terraform configuration..."
	terraform fmt -check
	terraform validate

# Format configuration files
fmt:
	@echo "Formatting Terraform files..."
	terraform fmt -recursive

# Refresh state file
refresh:
	@echo "Refreshing Terraform state..."
	terraform refresh

# Show current state
show:
	@echo "Showing Terraform state..."
	terraform show

# Show all outputs
output:
	@echo "Terraform Outputs:"
	@echo ""
	terraform output -json | jq -r 'to_entries | .[] | "\(.key): \(.value.value // .value)"' 2>/dev/null || terraform output

# Show all app credentials for the Ansible vault
credentials:
	@echo "==========================================="
	@echo "AWS credentials → group_vars/all.vault.yml"
	@echo "==========================================="
	@echo "vault_aws_access_key_id: \"$$(terraform output -raw iam_access_key_id)\""
	@echo "vault_aws_secret_access_key: \"$$(terraform output -raw iam_access_key_secret)\""
	@echo "vault_s3_bucket: \"$$(terraform output -raw media_bucket_name)\""
	@echo "vault_s3_region: \"$$(terraform output -raw media_bucket_region)\""
	@echo ""
	@echo "==========================================="
	@echo "Twilio (production) → group_vars/all.vault.yml"
	@echo "==========================================="
	@echo "vault_twilio_api_key_sid: \"$$(terraform output -raw twilio_production_api_key_sid)\""
	@echo "vault_twilio_api_key_secret: \"$$(terraform output -raw twilio_production_api_key_secret)\""
	@echo ""
	@echo "==========================================="
	@echo "Twilio (staging) → group_vars/germinal_staging.vault.yml"
	@echo "==========================================="
	@echo "vault_staging_twilio_api_key_sid: \"$$(terraform output -raw twilio_staging_api_key_sid)\""
	@echo "vault_staging_twilio_api_key_secret: \"$$(terraform output -raw twilio_staging_api_key_secret)\""
	@echo ""
	@echo "⚠️  Save these credentials securely!"

# Export as environment variables
env:
	@export S3_BUCKET=$$(terraform output -raw media_bucket_name) && \
	export S3_REGION=$$(terraform output -raw media_bucket_region) && \
	export AWS_ACCESS_KEY_ID=$$(terraform output -raw iam_access_key_id) && \
	export AWS_SECRET_ACCESS_KEY=$$(terraform output -raw iam_access_key_secret) && \
	echo "Environment variables exported. Run 'make env' in a shell sub-process to actually set them."

# Generate dependency graph (requires graphviz)
graph:
	@echo "Generating dependency graph..."
	terraform graph | dot -Tpng > terraform-graph.png
	@echo "Graph saved to terraform-graph.png"

# Destroy all resources
destroy:
	@echo "Destroying all Terraform resources..."
	terraform destroy

# Destroy backend resources (use with caution!)
destroy-backend:
	@echo "⚠️  WARNING: This will destroy the Terraform state backend!"
	@echo "You will need to recreate it afterwards."
	@read -p "Are you sure? [y/N] " confirm && [ "$$confirm" = "y" ] || exit 1
	terraform destroy -target=aws_dynamodb_table.terraform_locks
	terraform destroy -target=aws_s3_bucket.terraform_state
	terraform destroy -target=aws_s3_bucket_versioning.terraform_state_versioning
	terraform destroy -target=aws_s3_bucket_server_side_encryption_configuration.terraform_state_encryption
	terraform destroy -target=aws_s3_bucket_public_access_block.terraform_state_block

# Clean temporary files
clean:
	@echo "Cleaning temporary files..."
	-rm -f terraform-graph.png
	-rm -rf .terraform/
	-rm -f .terraform.lock.hcl
	-rm -f terraform.tfstate.backup
	@echo "Clean complete. Run 'make init' to reinitialize."

# ============================================
# Server Commands
# ============================================

# Show server connection details
server-info:
	@echo "==========================================="
	@echo "VPS Connection Details"
	@echo "==========================================="
	@echo ""
	@echo "Server: $$(terraform output -raw server_name)"
	@echo "IPv4: $$(terraform output -raw server_ipv4_address)"
	@echo "IPv6: $$(terraform output -raw server_ipv6_address)"
	@echo "Status: $$(terraform output -raw server_status)"
	@echo ""
	@echo "SSH connection:"
	@echo "  $$(terraform output -raw ssh_connection_string)"
	@echo ""
	@echo "==========================================="

# SSH into the server
server-ssh:
	@ssh root@$$(terraform output -raw server_ipv4_address)

# Show deployment guide
server-deploy:
	@terraform output -raw server_deployment_guide

# Destroy only the server (keep other resources)
destroy-server:
	@echo "⚠️  WARNING: This will destroy the VPS server!"
	@read -p "Are you sure? [y/N] " confirm && [ "$$confirm" = "y" ] || exit 1
	terraform destroy -target=hcloud_ssh_key.default -target=hcloud_server.main

# Create server backup (manual snapshot)
server-backup:
	@echo "Creating manual backup of server..."
	@echo "Note: This requires the Hetzner CLI or manual action in console."
	@echo "Server: $$(terraform output -raw server_name)"
	@echo "Visit: https://console.hetzner.cloud/servers"

# ============================================
# DNS Commands
# ============================================

# Show application URL and DNS records
dns-info:
	@echo "==========================================="
	@echo "Application DNS Information"
	@echo "==========================================="
	@echo ""
	@echo "Application URL: $$(terraform output -raw app_url)"
	@echo "WWW URL: $$(terraform output -raw www_url)"
	@echo ""
	@echo "DNS Records configured:"
	@echo "  A (main):    $$(terraform output -raw domain_name) → $$(terraform output -raw server_ipv4_address)"
	@echo "  CNAME (www): www.$$(terraform output -raw domain_name) → $$(terraform output -raw domain_name)"
	@echo ""
	@echo "Note: DNS is proxied through Cloudflare (orange cloud)"
	@echo "==========================================="

# Show email configuration (Registrar + Amazon SES)
dns-email:
	@terraform output -raw email_setup_status

# Show Cloudflare dashboard link for verification
dns-verify:
	@echo "==========================================="
	@echo "Cloudflare Dashboard"
	@echo "==========================================="
	@echo ""
	@echo "Visit the Cloudflare dashboard to verify DNS:"
	@terraform output -raw cloudflare_zone_info | jq -r '.url'
	@echo ""
	@echo "==========================================="
