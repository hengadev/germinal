# =============================================================================
# app-germinal IAM User
# Least-privilege, S3-only credential: access to germinal's own media and
# backup buckets in both environments.
# Distinct from terraform-germinal (the Terraform admin user) and from the
# per-environment app_user resources in s3.tf/backups.tf.
#
# One user for all environments, declared once. It is used for local
# development: its access key is written to germinal/dev/s3 in Infisical
# (infisical.tf).
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
  name = "app-germinal"
  path = "/applications/"

  tags = {
    Name      = "app-germinal"
    Project   = var.project_name
    ManagedBy = "Terraform"
  }
}

resource "aws_iam_user_policy_attachment" "app_germinal" {
  user       = aws_iam_user.app_germinal.name
  policy_arn = aws_iam_policy.app_germinal.arn
}

resource "aws_iam_access_key" "app_germinal" {
  user = aws_iam_user.app_germinal.name
}

