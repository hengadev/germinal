#!/usr/bin/env bash
# Refreshes staging AWS resources credentials in Ansible vault.
# Use this to update vault credentials if they've been lost or need refreshing.
#
# Note: This uses the existing staging workspace (default).
# Production resources are in the 'production' workspace.
#
# Usage: run directly or via `make apply-staging` in infrastructure/terraform/

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TERRAFORM_DIR="$SCRIPT_DIR/../terraform"
ANSIBLE_DIR="$SCRIPT_DIR/../ansible"
STAGING_VAULT="$ANSIBLE_DIR/group_vars/germinal_staging.vault.yml"
WORKSPACE="default"

# ── Prerequisites ────────────────────────────────────────────────────
for cmd in terraform python3 jq; do
    command -v "$cmd" >/dev/null 2>&1 || { echo "❌  $cmd is required but not found"; exit 1; }
done

[ -f "$STAGING_VAULT" ] || { echo "❌  Staging vault not found: $STAGING_VAULT"; exit 1; }

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

# ── Check if staging tfvars exists ─────────────────────────────────────
STAGING_TFVARS="terraform.tfvars.staging"
if [ ! -f "$STAGING_TFVARS" ]; then
    echo "❌  Staging tfvars not found: $STAGING_TFVARS"
    exit 1
fi

# ── Show what will happen ─────────────────────────────────────────────
echo ""
echo "=========================================="
echo "Staging Credentials Refresh"
echo "=========================================="
echo ""
echo "This will:"
echo "  1. Switch to workspace: $WORKSPACE (staging)"
echo "  2. Read existing Terraform outputs"
echo "  3. Update Ansible vault with credentials"
echo ""
echo "Note: This does NOT create new resources."
echo "      It only reads existing outputs and updates the vault."
echo ""
read -p "Continue? [y/N] " confirm && [ "$confirm" = "y" ] || exit 1
echo ""

# ── Switch to staging workspace ───────────────────────────────────────
echo "Switching to staging workspace..."
terraform workspace select "$WORKSPACE" 2>/dev/null || true

# ── Check for existing resources ───────────────────────────────────────
echo "Checking for existing IAM user..."
EXISTING_USER=$(terraform output -raw iam_user_name 2>/dev/null || echo "")
if [ -z "$EXISTING_USER" ]; then
    echo "❌  No existing IAM user found in $WORKSPACE workspace."
    echo ""
    echo "If this is the first time setting up staging, you need to:"
    echo "  1. Ensure you have run Terraform with staging config"
    echo "  2. Or run: terraform apply -var-file=terraform.tfvars.staging"
    exit 1
fi

echo "  ✓ Found: $EXISTING_USER"

# ── Extract outputs ─────────────────────────────────────────────────────
echo ""
echo "Extracting Terraform outputs..."
IAM_ACCESS_KEY_ID=$(terraform output -raw iam_access_key_id)
IAM_ACCESS_KEY_SECRET=$(terraform output -raw iam_access_key_secret)
S3_BUCKET=$(terraform output -raw media_bucket_name)
S3_REGION=$(terraform output -raw media_bucket_region)
MEDIA_URL=$(terraform output -raw media_url)

[ -n "$IAM_ACCESS_KEY_ID" ] || { echo "❌  Failed to get iam_access_key_id"; exit 1; }
[ -n "$IAM_ACCESS_KEY_SECRET" ] || { echo "❌  Failed to get iam_access_key_secret"; exit 1; }
[ -n "$S3_BUCKET" ] || { echo "❌  Failed to get media_bucket_name"; exit 1; }

# ── Display credentials ─────────────────────────────────────────────────
echo ""
echo "=========================================="
echo "Staging Credentials"
echo "=========================================="
echo ""
echo "Workspace: $WORKSPACE"
echo "IAM User: $EXISTING_USER"
echo "S3 Bucket: $S3_BUCKET"
echo "S3 Region: $S3_REGION"
echo "Media URL: $MEDIA_URL"
echo ""

# ── Update Ansible vault ───────────────────────────────────────────────
echo "Updating Ansible vault..."
set_yaml_keys "$STAGING_VAULT" \
    "vault_staging_aws_access_key_id=$IAM_ACCESS_KEY_ID" \
    "vault_staging_aws_secret_access_key=$IAM_ACCESS_KEY_SECRET" \
    "vault_staging_s3_bucket=$S3_BUCKET" \
    "vault_staging_s3_region=$S3_REGION" \
    "vault_staging_s3_public_url=$MEDIA_URL" \
    "vault_staging_media_url=$MEDIA_URL"

echo "  ✓ Staging vault updated"
echo ""

# ── Summary ────────────────────────────────────────────────────────────
echo "=========================================="
echo "✅  Staging Credentials Refreshed"
echo "=========================================="
echo ""
echo "Next steps:"
echo "  - Deploy: cd infrastructure/ansible && make deploy-staging"
echo ""
echo "Vault file updated: $STAGING_VAULT"
echo ""
