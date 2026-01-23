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
    S3_BUCKET           = aws_s3_bucket.media.bucket
    S3_REGION           = aws_s3_bucket.media.region
    AWS_ACCESS_KEY_ID   = aws_iam_access_key.app_user.id
    AWS_SECRET_ACCESS_KEY = aws_iam_access_key.app_user.secret
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
  value = <<-EOT
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

output "dns_records" {
  value = {
    main_a = {
      name    = cloudflare_dns_record.main_a.name
      type    = cloudflare_dns_record.main_a.type
      content = cloudflare_dns_record.main_a.content
      proxied = cloudflare_dns_record.main_a.proxied
    }
    www = {
      name    = cloudflare_dns_record.www.name
      type    = cloudflare_dns_record.www.type
      content = cloudflare_dns_record.www.content
      proxied = cloudflare_dns_record.www.proxied
    }
  }
  description = "Key DNS records for the application"
}

output "email_setup_status" {
  value = <<-EOT
    ========================================
    Email DNS Configuration (Google Workspace)
    ========================================

    Domain: ${var.domain_name}

    MX Records (configured):
      1. ASPMX.L.GOOGLE.COM (priority 1)
      2. ALT1.ASPMX.L.GOOGLE.COM (priority 5)
      3. ALT2.ASPMX.L.GOOGLE.COM (priority 5)
      4. ALT3.ASPMX.L.GOOGLE.COM (priority 10)
      5. ALT4.ASPMX.L.GOOGLE.COM (priority 10)

    SPF Record: v=spf1 include:_spf.google.com ~all
    DMARC Record: v=DMARC1; p=none; rua=mailto:${var.contact_email}

    Next steps:
      1. Verify domain in Google Workspace Admin Console
      2. Add users in Google Workspace
      3. Test email delivery

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
