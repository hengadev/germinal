# =============================================================================
# app-germinal IAM User
# Least-privilege credential for germinal's running application — S3-only
# access to germinal's own media and backup buckets in both environments.
# Distinct from terraform-germinal (the Terraform admin user) and from the
# per-environment app_user resources in s3.tf/backups.tf.
#
# IAM users are account-global, but this config is applied across two
# Terraform workspaces (default=staging, production=production) that share
# these files. Gating on terraform.workspace ensures the user is created
# exactly once instead of colliding when applied in the second workspace.
# =============================================================================

locals {
  app_germinal_bucket_names = [
    "production-${var.project_name}-media",
    "production-${var.project_name}-backups",
    "staging-${var.project_name}-media",
    "staging-${var.project_name}-backups",
  ]
  app_germinal_bucket_arns = [for b in local.app_germinal_bucket_names : "arn:aws:s3:::${b}"]
  app_germinal_object_arns = [for b in local.app_germinal_bucket_names : "arn:aws:s3:::${b}/*"]
}

resource "aws_iam_policy" "app_germinal" {
  count       = terraform.workspace == "production" ? 1 : 0
  name        = "app-germinal-policy"
  description = "S3-only access to germinal's own buckets (production + staging media and backups)"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "ListGerminalBuckets"
        Effect   = "Allow"
        Action   = "s3:ListBucket"
        Resource = local.app_germinal_bucket_arns
      },
      {
        Sid    = "ReadWriteDeleteGerminalObjects"
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:PutObject",
          "s3:DeleteObject"
        ]
        Resource = local.app_germinal_object_arns
      }
    ]
  })
}

resource "aws_iam_user" "app_germinal" {
  count = terraform.workspace == "production" ? 1 : 0
  name  = "app-germinal"
  path  = "/applications/"

  tags = {
    Name      = "app-germinal"
    Project   = var.project_name
    ManagedBy = "Terraform"
  }
}

resource "aws_iam_user_policy_attachment" "app_germinal" {
  count      = terraform.workspace == "production" ? 1 : 0
  user       = aws_iam_user.app_germinal[0].name
  policy_arn = aws_iam_policy.app_germinal[0].arn
}

resource "aws_iam_access_key" "app_germinal" {
  count = terraform.workspace == "production" ? 1 : 0
  user  = aws_iam_user.app_germinal[0].name
}

output "app_germinal_access_key_id" {
  value       = try(aws_iam_access_key.app_germinal[0].id, null)
  description = "Access key ID for app-germinal (only set when applied in the production workspace)"
  sensitive   = true
}

output "app_germinal_access_key_secret" {
  value       = try(aws_iam_access_key.app_germinal[0].secret, null)
  description = "Secret access key for app-germinal (only set when applied in the production workspace)"
  sensitive   = true
}
