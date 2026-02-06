# Cloudflare DNS Resources for Germinal
# This file defines DNS records for the domain

# ============================================
# Application DNS Records
# ============================================

# Main A record - points to Hetzner VPS
resource "cloudflare_dns_record" "main_a" {
  zone_id = var.cloudflare_zone_id
  name    = var.domain_name
  type    = "A"
  content = hcloud_server.main.ipv4_address
  proxied = true
  ttl     = 1
}

# Main AAAA record - points to Hetzner VPS IPv6
resource "cloudflare_dns_record" "main_aaaa" {
  zone_id = var.cloudflare_zone_id
  name    = var.domain_name
  type    = "AAAA"
  content = hcloud_server.main.ipv6_address
  proxied = true
  ttl     = 1
}

# WWW subdomain - CNAME to main domain
resource "cloudflare_dns_record" "www" {
  zone_id = var.cloudflare_zone_id
  name    = "www"
  type    = "CNAME"
  content = var.domain_name
  proxied = true
  ttl     = 1
}

# ============================================
# Email DNS Records
# ============================================
# SETUP: Replace Google Workspace with registrar mailbox + Amazon SES
#
# SENDING: Amazon SES (via SMTP)
# RECEIVING: Your domain registrar's email service
#
# MANUAL STEPS:
# 1. Get MX records from your registrar (e.g., Namecheap, GoDaddy, etc.)
# 2. Replace the placeholder MX records below with your registrar's values
# 3. For Amazon SES, see infrastructure/terraform/ses.tf for setup instructions
#
# Common registrar MX records (examples - check with your registrar):
# - Namecheap: mx2.namecheap.com (priority 10), mx1.namecheap.com (priority 20)
# - GoDaddy: smtp.secureserver.net (priority 10), mailstore1.secureserver.net (priority 20)
# - Porkbun: mail.porkbun.com (priority 10)
# - Cloudflare Email Routing: mx1.cloudflare.net (priority 10), mx2.cloudflare.net (priority 20)
# ============================================

# MX records - REPLACE WITH YOUR REGISTRAR'S MX SERVERS
# Example for Namecheap (replace with your actual registrar's MX):
resource "cloudflare_dns_record" "mx1" {
  zone_id  = var.cloudflare_zone_id
  name     = var.domain_name
  type     = "MX"
  content  = var.email_mx_primary     # Add to terraform.tfvars, e.g., "mx2.namecheap.com"
  priority = var.email_mx_primary_priority
  proxied  = false
  ttl      = 3600
}

resource "cloudflare_dns_record" "mx2" {
  zone_id  = var.cloudflare_zone_id
  name     = var.domain_name
  type     = "MX"
  content  = var.email_mx_secondary   # Add to terraform.tfvars, e.g., "mx1.namecheap.com"
  priority = var.email_mx_secondary_priority
  proxied  = false
  ttl      = 3600
}

# SPF record - allows Amazon SES to send email on your behalf
resource "cloudflare_dns_record" "spf" {
  zone_id = var.cloudflare_zone_id
  name    = var.domain_name
  type    = "TXT"
  content = "\"v=spf1 include:amazonses.com ~all\""
  proxied = false
  ttl     = 3600
}

# ============================================
# Amazon SES DKIM Records (OPTIONAL)
# ============================================
# After setting up SES (see ses.tf), uncomment these records and add the DKIM tokens.
#
# MANUAL STEPS:
# 1. Complete SES setup in AWS Console (verify domain, get DKIM tokens)
# 2. Uncomment the 3 DKIM records below
# 3. Fill in the DKIM tokens from AWS SES Console
# 4. Or enable Terraform SES resources in ses.tf to auto-generate
# ============================================

# resource "cloudflare_dns_record" "ses_dkim1" {
#   zone_id = var.cloudflare_zone_id
#   name    = var.ses_dkim_token1  # e.g., "abcdefghijk123456789._domainkey"
#   type    = "CNAME"
#   content = "${var.ses_dkim_token1}.dkim.amazonses.com"
#   ttl     = 3600
# }
#
# resource "cloudflare_dns_record" "ses_dkim2" {
#   zone_id = var.cloudflare_zone_id
#   name    = var.ses_dkim_token2
#   type    = "CNAME"
#   content = "${var.ses_dkim_token2}.dkim.amazonses.com"
#   ttl     = 3600
# }
#
# resource "cloudflare_dns_record" "ses_dkim3" {
#   zone_id = var.cloudflare_zone_id
#   name    = var.ses_dkim_token3
#   type    = "CNAME"
#   content = "${var.ses_dkim_token3}.dkim.amazonses.com"
#   ttl     = 3600
# }

# DMARC record for email security
resource "cloudflare_dns_record" "dmarc" {
  zone_id = var.cloudflare_zone_id
  name    = "_dmarc"
  type    = "TXT"
  content = "\"v=DMARC1; p=none; rua=mailto:${var.contact_email}\""
  proxied = false
  ttl     = 3600
}

# Site verification record (optional - for Google Search Console, etc.)
# You can add additional verification records as needed
resource "cloudflare_dns_record" "google_site_verification" {
  zone_id = var.cloudflare_zone_id
  name    = var.domain_name
  type    = "TXT"
  content = "\"google-site-verification=${var.google_site_verification}\""
  proxied = false
  ttl     = 3600

  count = var.google_site_verification != "" ? 1 : 0
}

# ============================================
# Media CDN DNS Record (CloudFront)
# ============================================

resource "cloudflare_dns_record" "media" {
  zone_id = var.cloudflare_zone_id
  name    = "media"
  type    = "CNAME"
  content = aws_cloudfront_distribution.media.domain_name
  proxied = false # Cannot proxy CloudFront
  ttl     = 3600
}
