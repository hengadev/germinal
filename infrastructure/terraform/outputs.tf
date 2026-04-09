# Output Values for Germinal Infrastructure

# Backend Outputs
output "terraform_state_bucket_name" {
  value       = try(aws_s3_bucket.terraform_state.bucket, null)
  description = "Name of the Terraform state S3 bucket"
}

output "terraform_locks_table_name" {
  value       = try(aws_dynamodb_table.terraform_locks.name, null)
  description = "Name of the Terraform locks DynamoDB table"
}

# S3 Media Bucket Outputs
output "media_bucket_name" {
  value       = aws_s3_bucket.media.bucket
  description = "Name of the media storage S3 bucket"
}

output "media_bucket_arn" {
  value       = aws_s3_bucket.media.arn
  description = "ARN of the media storage S3 bucket"
}

output "media_bucket_region" {
  value       = aws_s3_bucket.media.region
  description = "AWS region of the media storage S3 bucket"
}

# IAM Outputs
output "iam_user_name" {
  value       = aws_iam_user.app_user.name
  description = "Name of the IAM user for application access"
}

output "iam_access_key_id" {
  value       = aws_iam_access_key.app_user.id
  description = "Access key ID for the IAM user"
  sensitive   = true
}

output "iam_access_key_secret" {
  value       = aws_iam_access_key.app_user.secret
  description = "Secret access key for the IAM user (save this securely!)"
  sensitive   = true
}

output "iam_policy_arn" {
  value       = aws_iam_policy.s3_access.arn
  description = "ARN of the S3 access policy"
}

# Environment Variable Output
# Copy this directly to your .env file
output "env_variables" {
  value = {
    S3_BUCKET                  = aws_s3_bucket.media.bucket
    S3_REGION                  = aws_s3_bucket.media.region
    S3_PUBLIC_URL              = "https://media.${var.domain_name}"
    CLOUDFRONT_DISTRIBUTION_ID = aws_cloudfront_distribution.media.id
    AWS_ACCESS_KEY_ID          = aws_iam_access_key.app_user.id
    AWS_SECRET_ACCESS_KEY      = aws_iam_access_key.app_user.secret
  }
  description = "Environment variables to add to .env file"
  sensitive   = true
}


# ============================================
# Hetzner Cloud Outputs
# ============================================

output "server_name" {
  value       = hcloud_server.main.name
  description = "Name of the Hetzner Cloud server"
}

output "server_ipv4_address" {
  value       = hcloud_server.main.ipv4_address
  description = "Public IPv4 address of the server"
}

output "server_ipv6_address" {
  value       = hcloud_server.main.ipv6_address
  description = "Public IPv6 address of the server"
}

output "server_status" {
  value       = hcloud_server.main.status
  description = "Current status of the server"
}

output "server_ssh_user" {
  value       = "root"
  description = "SSH user to connect to the server"
}

output "ssh_connection_string" {
  value       = "ssh root@${hcloud_server.main.ipv4_address}"
  description = "SSH connection string for the server"
}

output "server_deployment_guide" {
  value       = <<-EOT
    ========================================
    Germinal VPS Deployment Guide
    ========================================

    Server: ${hcloud_server.main.name}
    IPv4: ${hcloud_server.main.ipv4_address}
    IPv6: ${hcloud_server.main.ipv6_address}

    Connect to server:
      ssh root@${hcloud_server.main.ipv4_address}

    Deploy application:
      1. ssh root@${hcloud_server.main.ipv4_address}
      2. cd /opt/germinal
      3. git clone <your-repo-url> .
      4. cp .env.example .env
      5. nano .env  # Add your credentials
      6. make image-pull
      7. make prod-start

    Or use the project Makefile from your local machine:
      make deploy

    ========================================
    EOT
  description = "Deployment guide for the VPS"
}

# ============================================
# Cloudflare DNS Outputs
# ============================================

output "domain_name" {
  value       = var.domain_name
  description = "Primary domain name"
}

output "app_url" {
  value       = "https://${var.domain_name}"
  description = "Full URL to access the application"
}

output "www_url" {
  value       = "https://www.${var.domain_name}"
  description = "WWW URL for the application"
}

output "staging_url" {
  value       = var.create_staging_dns ? "https://staging.${var.domain_name}" : null
  description = "Staging environment URL"
}

output "staging_admin_url" {
  value       = var.create_staging_dns ? "https://admin-staging.${var.domain_name}" : null
  description = "Staging admin URL"
}

output "dns_records" {
  value = {
    main_a = {
      name    = cloudflare_dns_record.main_a.name
      type    = cloudflare_dns_record.main_a.type
      content = cloudflare_dns_record.main_a.content
      proxied = cloudflare_dns_record.main_a.proxied
    }
    www = var.create_www_dns ? {
      name    = cloudflare_dns_record.www[0].name
      type    = cloudflare_dns_record.www[0].type
      content = cloudflare_dns_record.www[0].content
      proxied = cloudflare_dns_record.www[0].proxied
    } : null
  }
  description = "Key DNS records for the application"
}

output "email_setup_status" {
  value       = <<-EOT
    ========================================
    Email Configuration
    (Hostinger Mailbox + Amazon SES API)
    ========================================

    Domain: ${var.domain_name}

    AUTOMATED (Terraform-managed):
    ----------------------------------------
    - SES domain identity & verification
    - SES DKIM authentication (3 CNAME records)
    - MAIL FROM domain (MX + SPF records)
    - SES verification TXT record
    - IAM sending policy (app_user)
    - Mailbox provider DKIM (${length(var.email_dkim_records)} records configured)

    SENDING: Amazon SES API
    ----------------------------------------
    Uses existing IAM credentials (no SMTP credentials needed).
    Application .env:
      AWS_ACCESS_KEY_ID=<from terraform output>
      AWS_SECRET_ACCESS_KEY=<from terraform output>
      SES_FROM_EMAIL=noreply@${var.domain_name}
      SES_FROM_NAME=Germinal
      SES_REGION=${var.aws_region}

    RECEIVING: Hostinger Business Email
    ----------------------------------------
    Mailbox: support@${var.domain_name}
    MX Records (configured):
      1. ${var.email_mx_primary} (priority ${var.email_mx_primary_priority})
      2. ${var.email_mx_secondary} (priority ${var.email_mx_secondary_priority})

    SPF Record: v=spf1 ${join(" ", [for d in var.email_spf_includes : "include:${d}"])} ~all
    DMARC Record: v=DMARC1; p=${var.email_dmarc_policy}; rua=mailto:${var.contact_email}

    REMAINING MANUAL STEPS:
      1. Request SES production access in AWS Console
      2. Configure Hostinger mailbox (support@${var.domain_name})
      3. Add Hostinger DKIM to terraform.tfvars (see terraform.tfvars.example)

    See: infrastructure/terraform/ses.tf for details
    ========================================
    EOT
  description = "Email configuration status and instructions"
}

output "cloudflare_zone_info" {
  value = {
    zone_id = var.cloudflare_zone_id
    domain  = var.domain_name
    url     = "https://dash.cloudflare.com/${var.cloudflare_zone_id}/${var.domain_name}/dns"
  }
  description = "Cloudflare zone information"
}

# ============================================
# CloudFront Outputs
# ============================================

output "cloudfront_distribution_id" {
  value       = aws_cloudfront_distribution.media.id
  description = "CloudFront distribution ID for cache invalidation"
}

output "cloudfront_domain_name" {
  value       = aws_cloudfront_distribution.media.domain_name
  description = "CloudFront distribution domain name"
}

output "media_url" {
  value       = "https://media.${var.domain_name}"
  description = "Media CDN URL for application configuration"
}

# ============================================
# Database Backup Outputs
# ============================================

output "backup_bucket_name" {
  value       = aws_s3_bucket.backups.bucket
  description = "Name of the database backup S3 bucket"
}

output "backup_bucket_arn" {
  value       = aws_s3_bucket.backups.arn
  description = "ARN of the database backup S3 bucket"
}

output "backup_bucket_region" {
  value       = aws_s3_bucket.backups.region
  description = "AWS region of the backup bucket"
}

output "backup_env_variables" {
  value = {
    BACKUP_S3_BUCKET = aws_s3_bucket.backups.bucket
    BACKUP_S3_REGION = aws_s3_bucket.backups.region
  }
  description = "Environment variables for backup script"
}

output "backup_script_example" {
  value       = <<-EOT
    ========================================
    Database Backup Script Example
    ========================================

    Add this to your VPS crontab (crontab -e):

    # Daily backup at 2 AM
    0 2 * * * /opt/germinal/scripts/backup-db.sh daily

    # Weekly backup on Sunday at 3 AM
    0 3 * * 0 /opt/germinal/scripts/backup-db.sh weekly

    # Monthly backup on 1st at 4 AM
    0 4 1 * * /opt/germinal/scripts/backup-db.sh monthly

    ----------------------------------------
    Example backup script (/opt/germinal/scripts/backup-db.sh):

    #!/bin/bash
    set -e

    TYPE=$${1:-daily}
    TIMESTAMP=$(date +%Y%m%d_%H%M%S)
    FILENAME="germinal_$${TYPE}_$${TIMESTAMP}.sql.gz"

    # Dump and compress
    docker exec postgres pg_dump -U germinal germinal | gzip > /tmp/$FILENAME

    # Upload to S3
    aws s3 cp /tmp/$FILENAME s3://${aws_s3_bucket.backups.bucket}/$TYPE/$FILENAME

    # Cleanup
    rm /tmp/$FILENAME

    echo "Backup uploaded: s3://${aws_s3_bucket.backups.bucket}/$TYPE/$FILENAME"

    ========================================
    EOT
  description = "Example backup script and crontab configuration"
}
