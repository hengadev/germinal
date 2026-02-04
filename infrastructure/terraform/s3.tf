# S3 Resources for Germinal
# This file defines the S3 bucket and related resources for media storage

# Main S3 bucket for media assets (images, videos, etc.)
resource "aws_s3_bucket" "media" {
  bucket = "${var.environment}-${var.project_name}-media"

  tags = {
    Name        = "${var.project_name} Media Storage"
    Environment = var.environment
    ManagedBy   = "Terraform"
    Purpose     = "Media Assets"
  }
}

# Enable versioning for media bucket (recover from accidental deletions)
resource "aws_s3_bucket_versioning" "media_versioning" {
  bucket = aws_s3_bucket.media.id

  versioning_configuration {
    status = "Enabled"
  }
}

# Server-side encryption for media bucket
resource "aws_s3_bucket_server_side_encryption_configuration" "media_encryption" {
  bucket = aws_s3_bucket.media.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# Block public access - we'll use CloudFront or signed URLs for access
resource "aws_s3_bucket_public_access_block" "media_block" {
  bucket = aws_s3_bucket.media.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Lifecycle configuration - move old files to cheaper storage
resource "aws_s3_bucket_lifecycle_configuration" "media_lifecycle" {
  bucket = aws_s3_bucket.media.id

  rule {
    id     = "transition-to-ia"
    status = "Enabled"

    transition {
      days          = 30
      storage_class = "STANDARD_IA"
    }

    transition {
      days          = 90
      storage_class = "GLACIER"
    }

    noncurrent_version_transition {
      noncurrent_days = 30
      storage_class   = "GLACIER"
    }

    noncurrent_version_expiration {
      noncurrent_days = 90
    }

    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }
}

# CORS configuration for direct browser uploads
resource "aws_s3_bucket_cors_configuration" "media_cors" {
  bucket = aws_s3_bucket.media.id

  cors_rule {
    allowed_headers = ["*"]
    allowed_methods = ["GET", "PUT", "POST", "DELETE"]
    allowed_origins = var.allowed_origins
    expose_headers  = ["ETag"]
    max_age_seconds = 3600
  }
}

# IAM policy for the application to access S3
resource "aws_iam_policy" "s3_access" {
  name        = "${var.project_name}-s3-access"
  description = "Policy for ${var.project_name} to access media S3 bucket"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "S3MediaAccess"
        Effect = "Allow"
        Action = [
          "s3:PutObject",
          "s3:GetObject",
          "s3:DeleteObject",
          "s3:ListBucket",
          "s3:GetObjectAcl",
          "s3:PutObjectAcl"
        ]
        Resource = [
          aws_s3_bucket.media.arn,
          "${aws_s3_bucket.media.arn}/*"
        ]
      }
    ]
  })
}

# IAM user for programmatic access (optional - for VPS deployment)
resource "aws_iam_user" "app_user" {
  name = "${var.environment}-${var.project_name}-app"
  path = "/applications/"

  tags = {
    Name        = "${var.project_name} Application User"
    Environment = var.environment
    ManagedBy   = "Terraform"
  }
}

# Attach policy to the IAM user
resource "aws_iam_user_policy_attachment" "s3_access_attach" {
  user       = aws_iam_user.app_user.name
  policy_arn = aws_iam_policy.s3_access.arn
}

# Access key for the IAM user
resource "aws_iam_access_key" "app_user" {
  user = aws_iam_user.app_user.name
}

# ============================================
# S3 Bucket Policy for CloudFront OAC
# ============================================

resource "aws_s3_bucket_policy" "media_cloudfront" {
  bucket = aws_s3_bucket.media.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "AllowCloudFrontOAC"
      Effect    = "Allow"
      Principal = { Service = "cloudfront.amazonaws.com" }
      Action    = "s3:GetObject"
      Resource  = "${aws_s3_bucket.media.arn}/*"
      Condition = {
        StringEquals = {
          "AWS:SourceArn" = aws_cloudfront_distribution.media.arn
        }
      }
    }]
  })
}
