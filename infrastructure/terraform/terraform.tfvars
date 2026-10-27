# Germinal Terraform inputs: NON-SECRET values only. This file is committed.
#
# Secrets never go here. They live in the Infisical project `germinal-infra`
# and reach Terraform as TF_VAR_* environment variables through
# `infisical run` (see the Makefile):
#   TF_VAR_hcloud_token, TF_VAR_cloudflare_token,
#   AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY (provider + state backend)

aws_region   = "eu-west-3"
project_name = "germinal"

# Allowed CORS origins for browser uploads to the media buckets
allowed_origins = [
  "http://localhost:5173",
  "http://localhost:4100",
  "https://germinalstudio.co",
]

# ============================================
# Hetzner Cloud
# ============================================

# cax* is ARM, cx*/cpx* x86. Switching between the two cannot be done in
# place: apply with -replace=hcloud_server.main.
server_type     = "cax11"
server_location = "nbg1"
server_image    = "ubuntu-24.04"
enable_backups  = false

# Root's keys on a new server, besides terraform-germinal (the original
# computer's key, already in Hetzner). Public keys only.
operator_ssh_public_keys = {
  "germinal-workstation" = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIGv63z7rGXAn+XBkq0RK2HOaG64sE/NQ7m8c/wBi/K1p germinal-henga-workstation"
}

# ============================================
# Cloudflare DNS
# ============================================

cloudflare_zone_id       = "13f346b7e13f180a0c9fabe2b46bcf7a"
domain_name              = "germinalstudio.co"
contact_email            = "contact@germinalstudio.co"
google_site_verification = "bGzvB9pq4r9yZdex4FpGPwx0ZAVKXVo9M21lRnOm3ls"
create_www_dns           = true
create_staging_dns       = true

# ============================================
# Email: Zoho Mail (receiving) + Amazon SES API (sending)
# ============================================

email_mx_records = {
  "mx.zoho.eu"  = 10
  "mx2.zoho.eu" = 20
  "mx3.zoho.eu" = 50
}

email_spf_includes = ["amazonses.com", "zohomail.eu"]
email_dmarc_policy = "quarantine"

# Zoho Mail DKIM (public key; Zoho Mail admin > Domains > Email configuration)
# and Brevo domain authentication (Brevo > Senders, Domains & Dedicated IPs >
# Domains). Brevo's suggested DMARC is left out: the domain keeps its own above.
email_dkim_records = {
  "zmail._domainkey" = {
    type    = "TXT"
    content = "v=DKIM1; k=rsa; p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQCTSn5dy1IVq8qTok/Yqa5P0UUbSeOUB8KF3X2OA0TCwDnk1CRSYAO1JzXaezTzX0oY1Ug+86rz0ZIrcMBn/sayC7N78v+7NrXKG/dDuzUmSyPsw41FdSKayaazy8IJwcRYHRE5KFyJ5tOnFkmZtXYxCUBVTY55vbpl7ayA49cyIwIDAQAB"
  }
  "germinalstudio.co" = {
    type    = "TXT"
    content = "brevo-code:ab539570b000c988e949280adccc4148"
  }
  "brevo1._domainkey" = {
    type    = "CNAME"
    content = "b1.germinalstudio-co.dkim.brevo.com"
  }
  "brevo2._domainkey" = {
    type    = "CNAME"
    content = "b2.germinalstudio-co.dkim.brevo.com"
  }
  # Brevo link branding: its click tracking (which can't be turned off on
  # transactional email) rewrites links to link.germinalstudio.co, not Brevo's domain.
  "link" = {
    type    = "CNAME"
    content = "link-germinalstudio-co.brand.brevosend.com"
  }
  "r.link" = {
    type    = "CNAME"
    content = "link-germinalstudio-co.r.brand.brevosend.com"
  }
  "img.link" = {
    type    = "CNAME"
    content = "link-germinalstudio-co.img.brand.brevosend.com"
  }
}

# ============================================
# Database backups
# ============================================

backup_retention_days = 90
