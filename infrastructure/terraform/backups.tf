# Database Backup Resources for Germinal
# This file defines S3 resources for PostgreSQL database backups

# ============================================
# S3 Bucket for Database Backups
# ============================================

resource "aws_s3_bucket" "backups" {
  for_each = local.environments
  bucket   = "${each.key}-${var.project_name}-backups"

  tags = {
    Name        = "${var.project_name} Database Backups"
    Environment = each.key
    ManagedBy   = "Terraform"
    Purpose     = "Database Backups"
  }
}

# Enable versioning for backup bucket (recover from accidental overwrites)
resource "aws_s3_bucket_versioning" "backups_versioning" {
  for_each = local.environments
  bucket   = aws_s3_bucket.backups[each.key].id

  versioning_configuration {
    status = "Enabled"
  }
}

# Server-side encryption for backup bucket
resource "aws_s3_bucket_server_side_encryption_configuration" "backups_encryption" {
  for_each = local.environments
  bucket   = aws_s3_bucket.backups[each.key].id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# Block all public access - backups should never be public
resource "aws_s3_bucket_public_access_block" "backups_block" {
  for_each = local.environments
  bucket   = aws_s3_bucket.backups[each.key].id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Lifecycle configuration for backup retention
resource "aws_s3_bucket_lifecycle_configuration" "backups_lifecycle" {
  for_each = local.environments
  bucket   = aws_s3_bucket.backups[each.key].id

  # Daily backups - standard retention
  rule {
    id     = "daily-backup-retention"
    status = "Enabled"

    filter {
      prefix = "daily/"
    }

    # Move to cheaper storage after 30 days (minimum for STANDARD_IA)
    transition {
      days          = 30
      storage_class = "STANDARD_IA"
    }

    # No Glacier tier: Glacier bills 90 days minimum, so a dump moved there
    # and deleted a day later would cost three months of storage.
    expiration {
      days = var.backup_retention_days
    }

    # Clean up old versions
    noncurrent_version_expiration {
      noncurrent_days = 7
    }
  }

  # Weekly backups - longer retention
  rule {
    id     = "weekly-backup-retention"
    status = "Enabled"

    filter {
      prefix = "weekly/"
    }

    # Move to STANDARD_IA after 30 days (minimum required by AWS)
    transition {
      days          = 30
      storage_class = "STANDARD_IA"
    }

    # Move to Glacier after 60 days
    transition {
      days          = 60
      storage_class = "GLACIER"
    }

    # Keep weekly backups longer
    expiration {
      days = var.backup_retention_days * 2
    }

    noncurrent_version_expiration {
      noncurrent_days = 14
    }
  }

  # Monthly backups - longest retention
  rule {
    id     = "monthly-backup-retention"
    status = "Enabled"

    filter {
      prefix = "monthly/"
    }

    # Move to STANDARD_IA after 30 days
    transition {
      days          = 30
      storage_class = "STANDARD_IA"
    }

    # Move to Glacier after 90 days
    transition {
      days          = 90
      storage_class = "GLACIER"
    }

    # Keep monthly backups for a year
    expiration {
      days = 365
    }

    noncurrent_version_expiration {
      noncurrent_days = 30
    }
  }

  # Abort incomplete multipart uploads
  rule {
    id     = "abort-incomplete-uploads"
    status = "Enabled"

    filter {}

    abort_incomplete_multipart_upload {
      days_after_initiation = 1
    }
  }
}

# ============================================
# Backup IAM user (production only; issue 013)
# ============================================
# The server's backup job (infrastructure/ansible/roles/backup) runs with
# this key, read from Infisical prod /backup. It can list, read and write
# the production backup bucket and nothing else: no delete, so a leaked key
# or a compromised server cannot erase the backups. Expiry is the lifecycle
# rules above; overwrites keep the previous version (versioning). Staging is
# not backed up. The app users have no access to the backup buckets; the
# operator-only app-germinal user (app-germinal.tf) does.

resource "aws_iam_user" "backup" {
  name = "production-${var.project_name}-backup"
  path = "/applications/"

  tags = {
    Name        = "${var.project_name} Backup Job"
    Environment = "production"
    ManagedBy   = "Terraform"
  }
}

resource "aws_iam_policy" "backup_write" {
  name        = "production-${var.project_name}-backup-write"
  description = "List, read and write (no delete) the production ${var.project_name} backup bucket"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "ListBackupBucket"
        Effect   = "Allow"
        Action   = "s3:ListBucket"
        Resource = aws_s3_bucket.backups["production"].arn
      },
      {
        Sid    = "ReadWriteBackupObjects"
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:PutObject",
          "s3:AbortMultipartUpload"
        ]
        Resource = "${aws_s3_bucket.backups["production"].arn}/*"
      }
    ]
  })
}

resource "aws_iam_user_policy_attachment" "backup_write" {
  user       = aws_iam_user.backup.name
  policy_arn = aws_iam_policy.backup_write.arn
}

# Written to germinal/prod/backup in Infisical (infisical.tf); never copied
# by hand.
resource "aws_iam_access_key" "backup" {
  user = aws_iam_user.backup.name
}
