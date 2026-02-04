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
# Email DNS Records (Google Workspace)
# ============================================

# MX records for Google Workspace
resource "cloudflare_dns_record" "mx1" {
  zone_id  = var.cloudflare_zone_id
  name     = var.domain_name
  type     = "MX"
  content  = "ASPMX.L.GOOGLE.COM"
  priority = 1
  proxied  = false
  ttl      = 3600
}

resource "cloudflare_dns_record" "mx2" {
  zone_id  = var.cloudflare_zone_id
  name     = var.domain_name
  type     = "MX"
  content  = "ALT1.ASPMX.L.GOOGLE.COM"
  priority = 5
  proxied  = false
  ttl      = 3600
}

resource "cloudflare_dns_record" "mx3" {
  zone_id  = var.cloudflare_zone_id
  name     = var.domain_name
  type     = "MX"
  content  = "ALT2.ASPMX.L.GOOGLE.COM"
  priority = 5
  proxied  = false
  ttl      = 3600
}

resource "cloudflare_dns_record" "mx4" {
  zone_id  = var.cloudflare_zone_id
  name     = var.domain_name
  type     = "MX"
  content  = "ALT3.ASPMX.L.GOOGLE.COM"
  priority = 10
  proxied  = false
  ttl      = 3600
}

resource "cloudflare_dns_record" "mx5" {
  zone_id  = var.cloudflare_zone_id
  name     = var.domain_name
  type     = "MX"
  content  = "ALT4.ASPMX.L.GOOGLE.COM"
  priority = 10
  proxied  = false
  ttl      = 3600
}

# SPF record for email validation
resource "cloudflare_dns_record" "spf" {
  zone_id = var.cloudflare_zone_id
  name    = var.domain_name
  type    = "TXT"
  content = "\"v=spf1 include:_spf.google.com ~all\""
  proxied = false
  ttl     = 3600
}

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
