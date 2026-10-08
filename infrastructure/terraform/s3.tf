# S3 Resources for Germinal
# Media bucket and the application IAM user, one per environment
# (local.environments).

# Main S3 bucket for media assets (images, videos, etc.)
resource "aws_s3_bucket" "media" {
  for_each = local.environments
  bucket   = "${each.key}-${var.project_name}-media"

  tags = {
    Name        = "${var.project_name} Media Storage"
    Environment = each.key
    ManagedBy   = "Terraform"
    Purpose     = "Media Assets"
  }
}

# Enable versioning for media bucket (recover from accidental deletions)
resource "aws_s3_bucket_versioning" "media_versioning" {
  for_each = local.environments
  bucket   = aws_s3_bucket.media[each.key].id

  versioning_configuration {
    status = "Enabled"
  }
}

# Server-side encryption for media bucket
resource "aws_s3_bucket_server_side_encryption_configuration" "media_encryption" {
  for_each = local.environments
  bucket   = aws_s3_bucket.media[each.key].id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# Block public access - we'll use CloudFront or signed URLs for access
resource "aws_s3_bucket_public_access_block" "media_block" {
  for_each = local.environments
  bucket   = aws_s3_bucket.media[each.key].id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Lifecycle configuration - move old files to cheaper storage
resource "aws_s3_bucket_lifecycle_configuration" "media_lifecycle" {
  for_each = local.environments
  bucket   = aws_s3_bucket.media[each.key].id

  rule {
    id     = "transition-to-ia"
    status = "Enabled"

    filter {}

    # Current objects stay readable: the site serves them through CloudFront,
    # and an object in Glacier can't be read without a restore first.
    transition {
      days          = 30
      storage_class = "STANDARD_IA"
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
  for_each = local.environments
  bucket   = aws_s3_bucket.media[each.key].id

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
  for_each    = local.environments
  name        = "${each.key}-${var.project_name}-s3-access"
  description = "Policy for ${each.key} ${var.project_name} to access media S3 bucket"

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
          aws_s3_bucket.media[each.key].arn,
          "${aws_s3_bucket.media[each.key].arn}/*"
        ]
      }
    ]
  })
}

# IAM user the application runs with in each environment
resource "aws_iam_user" "app_user" {
  for_each = local.environments
  name     = "${each.key}-${var.project_name}-app"
  path     = "/applications/"

  tags = {
    Name        = "${var.project_name} Application User"
    Environment = each.key
    ManagedBy   = "Terraform"
  }
}

# Attach policy to the IAM user
resource "aws_iam_user_policy_attachment" "s3_access_attach" {
  for_each   = local.environments
  user       = aws_iam_user.app_user[each.key].name
  policy_arn = aws_iam_policy.s3_access[each.key].arn
}

# Access key for the IAM user. Written to germinal/<env>/s3 in Infisical
# (infisical.tf); never copied by hand.
resource "aws_iam_access_key" "app_user" {
  for_each = local.environments
  user     = aws_iam_user.app_user[each.key].name
}

# ============================================
# S3 Bucket Policy for CloudFront OAC
# ============================================

# Lets each environment's CloudFront distribution (cloudfront.tf) read its bucket.
resource "aws_s3_bucket_policy" "media_cloudfront" {
  for_each = local.environments
  bucket   = aws_s3_bucket.media[each.key].id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "AllowCloudFrontOAC"
      Effect    = "Allow"
      Principal = { Service = "cloudfront.amazonaws.com" }
      Action    = "s3:GetObject"
      Resource  = "${aws_s3_bucket.media[each.key].arn}/*"
      Condition = {
        StringEquals = {
          "AWS:SourceArn" = aws_cloudfront_distribution.media[each.key].arn
        }
      }
    }]
  })
}
