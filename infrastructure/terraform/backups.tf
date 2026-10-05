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

    # Move to Glacier after 90 days (must be > STANDARD_IA)
    transition {
      days          = 90
      storage_class = "GLACIER"
    }

    # Delete daily backups after retention period (must be > last transition)
    expiration {
      days = var.backup_retention_days + 1
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
# IAM Policy for Backup Access
# ============================================

resource "aws_iam_policy" "backup_access" {
  for_each    = local.environments
  name        = "${each.key}-${var.project_name}-backup-access"
  description = "Policy for ${each.key} ${var.project_name} to manage database backups in S3"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "S3BackupAccess"
        Effect = "Allow"
        Action = [
          "s3:PutObject",
          "s3:GetObject",
          "s3:DeleteObject",
          "s3:ListBucket"
        ]
        Resource = [
          aws_s3_bucket.backups[each.key].arn,
          "${aws_s3_bucket.backups[each.key].arn}/*"
        ]
      }
    ]
  })
}

# Attach backup policy to the application IAM user
resource "aws_iam_user_policy_attachment" "backup_access_attach" {
  for_each   = local.environments
  user       = aws_iam_user.app_user[each.key].name
  policy_arn = aws_iam_policy.backup_access[each.key].arn
}
