# Output Values for Germinal Infrastructure
#
# Credentials are not outputs: Terraform writes them into Infisical
# (infisical.tf).

# Backend Outputs
output "terraform_state_bucket_name" {
  value       = aws_s3_bucket.terraform_state.bucket
  description = "Name of the Terraform state S3 bucket"
}

# ============================================
# Per-environment AWS Outputs (keyed by environment)
# ============================================

output "media_bucket_names" {
  value       = { for env, bucket in aws_s3_bucket.media : env => bucket.bucket }
  description = "Media storage S3 bucket per environment"
}

output "backup_bucket_names" {
  value       = { for env, bucket in aws_s3_bucket.backups : env => bucket.bucket }
  description = "Database backup S3 bucket per environment"
}

output "iam_user_names" {
  value       = { for env, user in aws_iam_user.app_user : env => user.name }
  description = "Application IAM user per environment"
}

output "aws_region" {
  value       = var.aws_region
  description = "AWS region of the buckets and SES"
}

# ============================================
# Hetzner Cloud Outputs
# ============================================

output "server_name" {
  value       = hcloud_server.main.name
  description = "Name of the Hetzner Cloud server"
}

output "server_ipv4_address" {
  value       = hcloud_primary_ip.main["ipv4"].ip_address
  description = "Public IPv4 address of the server (a primary IP: kept when the server is replaced)"
}

output "server_ipv6_address" {
  value       = cidrhost(hcloud_primary_ip.main["ipv6"].ip_network, 1)
  description = "Public IPv6 address of the server (in a primary IP network: kept when the server is replaced)"
}

output "server_status" {
  value       = hcloud_server.main.status
  description = "Current status of the server"
}

output "ssh_connection_string" {
  value       = "ssh root@${hcloud_primary_ip.main["ipv4"].ip_address}"
  description = "SSH connection string for the server"
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

output "staging_url" {
  value       = var.create_staging_dns ? "https://staging.${var.domain_name}" : null
  description = "Staging environment URL"
}

output "email_setup_status" {
  value       = <<-EOT
    ========================================
    Email Configuration
    (mailbox provider + Amazon SES API)
    ========================================

    Domain: ${var.domain_name}

    SENDING: Amazon SES API, with each environment's app IAM credentials
    (germinal/<env>/s3 in Infisical). SES region: ${var.aws_region}

    RECEIVING: mailbox provider
    MX: ${join(", ", [for host, priority in var.email_mx_records : "${host} (${priority})"])}
    Mailbox DKIM records: ${length(var.email_dkim_records)}

    SPF: v=spf1 ${join(" ", [for d in var.email_spf_includes : "include:${d}"])} ~all
    DMARC: v=DMARC1; p=${var.email_dmarc_policy}; rua=mailto:${var.contact_email}
    ========================================
    EOT
  description = "Email configuration summary"
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
  description = "Media CDN URL (serves the media bucket of local.cdn_env)"
}
