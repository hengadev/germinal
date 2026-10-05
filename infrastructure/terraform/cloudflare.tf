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
  content = hcloud_primary_ip.main["ipv4"].ip_address
  proxied = true
  ttl     = 1
}

# Main AAAA record - points to Hetzner VPS IPv6
resource "cloudflare_dns_record" "main_aaaa" {
  zone_id = var.cloudflare_zone_id
  name    = var.domain_name
  type    = "AAAA"
  content = cidrhost(hcloud_primary_ip.main["ipv6"].ip_network, 1) # the server answers on ::1
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

  # Skip if record already exists (set create_www_dns = false in terraform.tfvars)
  count = var.create_www_dns ? 1 : 0
}

# Admin subdomain - CNAME to main domain
resource "cloudflare_dns_record" "admin" {
  zone_id = var.cloudflare_zone_id
  name    = "admin"
  type    = "CNAME"
  content = var.domain_name
  proxied = true
  ttl     = 1
}

# Staff subdomain - CNAME to main domain
resource "cloudflare_dns_record" "staff" {
  zone_id = var.cloudflare_zone_id
  name    = "staff"
  type    = "CNAME"
  content = var.domain_name
  proxied = true
  ttl     = 1
}

# Staging subdomains - same VPS, routed by Caddy
resource "cloudflare_dns_record" "staging" {
  count   = var.create_staging_dns ? 1 : 0
  zone_id = var.cloudflare_zone_id
  name    = "staging"
  type    = "CNAME"
  content = var.domain_name
  proxied = true
  ttl     = 1
}

resource "cloudflare_dns_record" "admin_staging" {
  count   = var.create_staging_dns ? 1 : 0
  zone_id = var.cloudflare_zone_id
  name    = "admin-staging"
  type    = "CNAME"
  content = var.domain_name
  proxied = true
  ttl     = 1
}

resource "cloudflare_dns_record" "staff_staging" {
  count   = var.create_staging_dns ? 1 : 0
  zone_id = var.cloudflare_zone_id
  name    = "staff-staging"
  type    = "CNAME"
  content = var.domain_name
  proxied = true
  ttl     = 1
}

# ============================================
# Email DNS Records
# ============================================
# Mailbox provider (receiving, e.g. Zoho Mail) + Amazon SES API (sending)
#
# SENDING: Amazon SES via AWS SDK (uses existing IAM credentials)
# RECEIVING: mailbox provider (contact@ mailbox)
#
# MX records route inbound mail to the mailbox provider.
# SPF authorizes all providers in var.email_spf_includes.
# SES DKIM is automated; mailbox provider DKIM added via var.email_dkim_records.
# ============================================

# MX records - route inbound email to mailbox provider (host => priority)
resource "cloudflare_dns_record" "mx" {
  for_each = var.email_mx_records

  zone_id  = var.cloudflare_zone_id
  name     = var.domain_name
  type     = "MX"
  content  = each.key
  priority = each.value
  proxied  = false
  ttl      = var.email_dns_ttl
}

# SPF record - authorizes sending providers (built from var.email_spf_includes)
resource "cloudflare_dns_record" "email_spf" {
  zone_id = var.cloudflare_zone_id
  name    = var.domain_name
  type    = "TXT"
  content = "\"v=spf1 ${join(" ", [for d in var.email_spf_includes : "include:${d}"])} ~all\""
  proxied = false
  ttl     = 3600
}

# ============================================
# Amazon SES DNS Records (automated from ses.tf)
# ============================================

# SES domain verification TXT record
resource "cloudflare_dns_record" "ses_verification" {
  zone_id = var.cloudflare_zone_id
  name    = "_amazonses.${var.domain_name}"
  type    = "TXT"
  content = "\"${aws_ses_domain_identity.main.verification_token}\""
  proxied = false
  ttl     = 3600
}

# SES DKIM CNAME records (AWS always generates exactly 3 tokens)
resource "cloudflare_dns_record" "ses_dkim" {
  count = 3

  zone_id = var.cloudflare_zone_id
  name    = "${aws_ses_domain_dkim.main.dkim_tokens[count.index]}._domainkey"
  type    = "CNAME"
  content = "${aws_ses_domain_dkim.main.dkim_tokens[count.index]}.dkim.amazonses.com"
  proxied = false
  ttl     = 3600
}

# MAIL FROM MX record
resource "cloudflare_dns_record" "ses_mail_from_mx" {
  zone_id  = var.cloudflare_zone_id
  name     = "mail.${var.domain_name}"
  type     = "MX"
  content  = "feedback-smtp.${var.aws_region}.amazonses.com"
  priority = 10
  proxied  = false
  ttl      = 3600
}

# MAIL FROM SPF record
resource "cloudflare_dns_record" "ses_mail_from_spf" {
  zone_id = var.cloudflare_zone_id
  name    = "mail.${var.domain_name}"
  type    = "TXT"
  content = "\"v=spf1 include:amazonses.com ~all\""
  proxied = false
  ttl     = 3600
}

# DMARC record for email security
resource "cloudflare_dns_record" "dmarc" {
  zone_id = var.cloudflare_zone_id
  name    = "_dmarc"
  type    = "TXT"
  content = "\"v=DMARC1; p=${var.email_dmarc_policy}; rua=mailto:${var.contact_email}\""
  proxied = false
  ttl     = 3600
}

# Mailbox provider DKIM records (e.g., Zoho Mail's zmail._domainkey)
resource "cloudflare_dns_record" "mailbox_dkim" {
  for_each = var.email_dkim_records

  zone_id = var.cloudflare_zone_id
  name    = each.key
  type    = each.value.type
  content = each.value.type == "TXT" ? "\"${each.value.content}\"" : each.value.content
  proxied = false
  ttl     = var.email_dns_ttl
}

# Site verification record (optional - for Google Search Console, etc.)
# You can add additional verification records as needed
resource "cloudflare_dns_record" "google_site_verification" {
  zone_id = var.cloudflare_zone_id
  name    = var.domain_name
  type    = "TXT"
  content = "\"google-site-verification=${var.google_site_verification}\""
  proxied = false
  ttl     = 1

  count = var.google_site_verification != "" ? 1 : 0
}

# ============================================
# Media CDN DNS Records (CloudFront, one per environment)
# ============================================

resource "cloudflare_dns_record" "media" {
  for_each = local.environments

  zone_id = var.cloudflare_zone_id
  name    = local.media_domains[each.key]
  type    = "CNAME"
  content = aws_cloudfront_distribution.media[each.key].domain_name
  proxied = false # Cannot proxy CloudFront
  ttl     = 3600
}
