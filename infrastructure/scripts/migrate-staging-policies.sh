#!/usr/bin/env bash
# Migrates staging IAM policies to include environment prefix.
# This renames existing policies (e.g., germinal-s3-access -> staging-germinal-s3-access)
#
# Usage: Run this before setting up production

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TERRAFORM_DIR="$SCRIPT_DIR/../terraform"

cd "$TERRAFORM_DIR"

echo ""
echo "=========================================="
echo "Staging Policy Migration"
echo "=========================================="
echo ""
echo "This will:"
echo "  1. Switch to staging workspace (default)"
echo "  2. Rename IAM policies to include 'staging-' prefix"
echo "  3. Update policy attachments"
echo ""
read -p "Continue? [y/N] " confirm && [ "$confirm" = "y" ] || exit 1
echo ""

# Switch to staging workspace
echo "Switching to staging workspace..."
terraform workspace select default 2>/dev/null || true

echo ""
echo "Applying policy name changes..."
echo ""

# Apply only the IAM policy changes (renames)
terraform apply -var-file=terraform.tfvars.staging \
    -target=aws_iam_policy.s3_access \
    -target=aws_iam_policy.ses_send \
    -target=aws_iam_policy.backup_access \
    -target=aws_iam_user_policy_attachment.s3_access_attach \
    -target=aws_iam_user_policy_attachment.ses_send_attach \
    -target=aws_iam_user_policy_attachment.backup_access_attach

echo ""
echo "✅  Staging policies migrated!"
echo ""
echo "New policy names:"
echo "  - staging-germinal-s3-access"
echo "  - staging-germinal-ses-send"
echo "  - staging-germinal-backup-access"
echo ""
