# Terraform State Backend Configuration
# This file creates the S3 bucket and DynamoDB table needed for Terraform state
#
# IMPORTANT: These resources should be created ONCE before using the S3 backend
# After creating these resources, you can comment out this file and update main.tf
# to use the newly created backend resources.
#
# Initial setup:
# 1. Comment out the entire `backend "s3"` block in main.tf
# 2. Run: terraform init
# 3. Run: terraform apply
# 4. Uncomment the backend block in main.tf
# 5. Run: terraform init -reconfigure
# 6. (Optional) Comment out this file to prevent accidental recreation

# S3 Bucket for Terraform State
resource "aws_s3_bucket" "terraform_state" {
  bucket = "germinal-terraform-state"

  tags = {
    Name        = "Germinal Terraform State"
    Environment = var.environment
    ManagedBy   = "Terraform"
  }
}

# Enable versioning on state bucket
resource "aws_s3_bucket_versioning" "terraform_state_versioning" {
  bucket = aws_s3_bucket.terraform_state.id

  versioning_configuration {
    status = "Enabled"
  }
}

# Enable server-side encryption
resource "aws_s3_bucket_server_side_encryption_configuration" "terraform_state_encryption" {
  bucket = aws_s3_bucket.terraform_state.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# Block public access to state bucket
resource "aws_s3_bucket_public_access_block" "terraform_state_block" {
  bucket = aws_s3_bucket.terraform_state.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# DynamoDB table for state locking
resource "aws_dynamodb_table" "terraform_locks" {
  name         = "germinal-terraform-locks"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "LockID"

  attribute {
    name = "LockID"
    type = "S"
  }

  tags = {
    Name        = "Germinal Terraform Locks"
    Environment = var.environment
    ManagedBy   = "Terraform"
  }
}
