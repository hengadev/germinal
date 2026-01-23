# Germinal Terraform Makefile
# Usage: make <target>

.PHONY: help init plan apply output credentials destroy destroy-backend \
        fmt validate refresh show graph clean

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
	@echo "  make plan          - Show planned changes"
	@echo "  make apply         - Apply changes"
	@echo "  make refresh       - Refresh state file"
	@echo "  make show          - Show current state"
	@echo ""
	@echo "Outputs:"
	@echo "  make output        - Show all outputs"
	@echo "  make credentials   - Show IAM credentials"
	@echo "  make env           - Export environment variables for shell"
	@echo ""
	@echo "Destruction:"
	@echo "  make destroy       - Destroy all resources"
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

# Show IAM credentials for .env file
credentials:
	@echo "==========================================="
	@echo "AWS S3 Credentials for .env file"
	@echo "==========================================="
	@echo ""
	@echo "S3_BUCKET=$$(terraform output -raw media_bucket_name)"
	@echo "S3_REGION=$$(terraform output -raw media_bucket_region)"
	@echo "AWS_ACCESS_KEY_ID=$$(terraform output -raw iam_access_key_id)"
	@echo "AWS_SECRET_ACCESS_KEY=$$(terraform output -raw iam_access_key_secret)"
	@echo ""
	@echo "==========================================="
	@echo "⚠️  Save these credentials securely!"
	@echo "==========================================="

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
