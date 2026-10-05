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

server_type     = "cpx22"
server_location = "nbg1"
server_image    = "ubuntu-24.04"
enable_backups  = true

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
email_dkim_records = {
  "zmail._domainkey" = {
    type    = "TXT"
    content = "v=DKIM1; k=rsa; p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQCTSn5dy1IVq8qTok/Yqa5P0UUbSeOUB8KF3X2OA0TCwDnk1CRSYAO1JzXaezTzX0oY1Ug+86rz0ZIrcMBn/sayC7N78v+7NrXKG/dDuzUmSyPsw41FdSKayaazy8IJwcRYHRE5KFyJ5tOnFkmZtXYxCUBVTY55vbpl7ayA49cyIwIDAQAB"
  }
}

# ============================================
# Database backups
# ============================================

backup_retention_days = 90
