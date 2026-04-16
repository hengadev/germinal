#!/usr/bin/env bash
# Creates production AWS resources (IAM user, S3 bucket) and updates Ansible vault.
# This creates ONLY AWS-specific resources, skipping VPS/DNS/SES which are shared.
#
# Uses Terraform workspaces to keep staging and production state separate.
#
# Usage: run directly or via `make apply-production` in infrastructure/terraform/

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TERRAFORM_DIR="$SCRIPT_DIR/../terraform"
ANSIBLE_DIR="$SCRIPT_DIR/../ansible"
PROD_VAULT="$ANSIBLE_DIR/group_vars/all.vault.yml"
WORKSPACE="production"

# ── Prerequisites ────────────────────────────────────────────────────
for cmd in terraform python3 jq; do
    command -v "$cmd" >/dev/null 2>&1 || { echo "❌  $cmd is required but not found"; exit 1; }
done

[ -f "$PROD_VAULT" ] || { echo "❌  Production vault not found: $PROD_VAULT"; exit 1; }

# ── Helpers ───────────────────────────────────────────────────────────
set_yaml_keys() {
    # $1 = file path, remaining args = key=value pairs
    python3 - "$@" <<'PYEOF'
import yaml, sys

path = sys.argv[1]
data = yaml.safe_load(open(path)) or {}
for pair in sys.argv[2:]:
    key, val = pair.split('=', 1)
    data[key] = val
with open(path, 'w') as f:
    yaml.dump(data, f, default_flow_style=False, allow_unicode=True)
PYEOF
}

# ── Navigate to Terraform directory ────────────────────────────────────
cd "$TERRAFORM_DIR"

# ── Check if production tfvars exists ───────────────────────────────────
PROD_TFVARS="terraform.tfvars.production"
if [ ! -f "$PROD_TFVARS" ]; then
    echo "❌  Production tfvars not found: $PROD_TFVARS"
    exit 1
fi

# ── Show what will be created ───────────────────────────────────────────
echo ""
echo "=========================================="
echo "Production AWS Resources Setup"
echo "=========================================="
echo ""
echo "This will:"
echo "  1. Use Terraform workspace: $WORKSPACE"
echo "  2. Create ONLY AWS resources (skip VPS/DNS/SES):"
echo "     - IAM user: production-germinal-app"
echo "     - S3 bucket: production-germinal-media"
echo "     - IAM policies and access keys"
echo "  3. Update Ansible vault with credentials"
echo ""
echo "SKIPPED (already exist in staging/shared):"
echo "     - VPS server"
echo "     - DNS records"
echo "     - SES domain identity"
echo "     - CloudFront distribution"
echo ""
read -p "Continue? [y/N] " confirm && [ "$confirm" = "y" ] || exit 1
echo ""

# ── Manage Terraform workspace ─────────────────────────────────────────
echo "Managing Terraform workspace..."
if ! terraform workspace list 2>/dev/null | grep -qE "^[\* ]+ $WORKSPACE$"; then
    echo "  Creating new workspace: $WORKSPACE"
    terraform workspace new "$WORKSPACE"
else
    echo "  Switching to workspace: $WORKSPACE"
    terraform workspace select "$WORKSPACE"
fi

# ── Initialize Terraform (if needed) ───────────────────────────────────
if [ ! -d ".terraform" ]; then
    echo "Initializing Terraform..."
    terraform init
fi

# ── Apply ONLY AWS resources ───────────────────────────────────────────
echo ""
echo "Applying AWS resources with production config..."
echo "Note: This may show warnings about uncreated resources (VPS/DNS) - this is expected."
echo ""

terraform apply -var-file="$PROD_TFVARS" \
    -target=aws_iam_user.app_user \
    -target=aws_iam_access_key.app_user \
    -target=aws_s3_bucket.media \
    -target=aws_s3_bucket_versioning.media_versioning \
    -target=aws_s3_bucket_server_side_encryption_configuration.media_encryption \
    -target=aws_s3_bucket_public_access_block.media_block \
    -target=aws_s3_bucket_lifecycle_configuration.media_lifecycle \
    -target=aws_s3_bucket_cors_configuration.media_cors \
    -target=aws_iam_policy.s3_access \
    -target=aws_iam_user_policy_attachment.s3_access_attach \
    -target=aws_iam_policy.ses_send \
    -target=aws_iam_user_policy_attachment.ses_send_attach \
    -target=aws_iam_policy.backup_access \
    -target=aws_iam_user_policy_attachment.backup_access_attach

# ── Extract outputs ─────────────────────────────────────────────────────
echo ""
echo "Extracting Terraform outputs..."
IAM_ACCESS_KEY_ID=$(terraform output -raw iam_access_key_id)
IAM_ACCESS_KEY_SECRET=$(terraform output -raw iam_access_key_secret)
S3_BUCKET=$(terraform output -raw media_bucket_name)
S3_REGION=$(terraform output -raw media_bucket_region)

# Construct S3 public URL (CloudFront is skipped, so using S3 directly)
MEDIA_URL="https://${S3_BUCKET}.s3.${S3_REGION}.amazonaws.com"

[ -n "$IAM_ACCESS_KEY_ID" ] || { echo "❌  Failed to get iam_access_key_id"; exit 1; }
[ -n "$IAM_ACCESS_KEY_SECRET" ] || { echo "❌  Failed to get iam_access_key_secret"; exit 1; }
[ -n "$S3_BUCKET" ] || { echo "❌  Failed to get media_bucket_name"; exit 1; }

# ── Display credentials ─────────────────────────────────────────────────
echo ""
echo "=========================================="
echo "Production Credentials"
echo "=========================================="
echo ""
echo "Workspace: $WORKSPACE"
echo "IAM User: production-germinal-app"
echo "S3 Bucket: $S3_BUCKET"
echo "S3 Region: $S3_REGION"
echo "Media URL: $MEDIA_URL"
echo ""

# ── Update Ansible vault ───────────────────────────────────────────────
echo "Updating Ansible vault..."
set_yaml_keys "$PROD_VAULT" \
    "vault_aws_access_key_id=$IAM_ACCESS_KEY_ID" \
    "vault_aws_secret_access_key=$IAM_ACCESS_KEY_SECRET" \
    "vault_s3_bucket=$S3_BUCKET" \
    "vault_s3_region=$S3_REGION" \
    "vault_s3_public_url=$MEDIA_URL" \
    "vault_media_url=$MEDIA_URL"

echo "  ✓ Production vault updated"
echo ""

# ── Summary ────────────────────────────────────────────────────────────
echo "=========================================="
echo "✅  Production Setup Complete"
echo "=========================================="
echo ""
echo "Workspace used: $WORKSPACE"
echo "Staging workspace: default (unchanged)"
echo ""
echo "Created:"
echo "  ✓ IAM user: production-germinal-app"
echo "  ✓ S3 bucket: $S3_BUCKET"
echo "  ✓ Access credentials (saved to vault)"
echo ""
echo "Shared (not duplicated):"
echo "  - VPS server (managed in staging/default workspace)"
echo "  - DNS records"
echo "  - SES configuration"
echo ""
echo "Next steps:"
echo "  1. Review: cd infrastructure/terraform && terraform show"
echo "  2. Deploy: cd infrastructure/ansible && make deploy"
echo ""
echo "Vault file updated: $PROD_VAULT"
echo ""
