# Input Variables for Germinal Infrastructure

variable "aws_region" {
  description = "AWS region for resources"
  type        = string
  default     = "eu-west-3"
}

variable "project_name" {
  description = "Project name used for resource naming"
  type        = string
  default     = "germinal"
}

variable "allowed_origins" {
  description = "Allowed CORS origins for S3 bucket (e.g., your application domains)"
  type        = list(string)
  default = [
    "http://localhost:5173",
    "http://localhost:4100",
  ]
}

# ============================================
# Hetzner Cloud Variables
# ============================================

variable "hcloud_token" {
  description = "Hetzner Cloud API token (secret: TF_VAR_hcloud_token from Infisical germinal-infra)"
  type        = string
  sensitive   = true
}

variable "server_type" {
  description = "Hetzner Cloud server type (cax11, cx23, cpx22, etc.). cax* is ARM: the app image is built for linux/arm64"
  type        = string
  default     = "cax11"

  validation {
    condition     = can(regex("^(cax|cx|cpx)[0-9]{2}$", var.server_type))
    error_message = "Server type must be a shared-vCPU Hetzner plan (e.g., cax11, cx23, cpx22)."
  }
}

variable "server_location" {
  description = "Hetzner Cloud datacenter location"
  type        = string
  default     = "nbg1"

  validation {
    condition     = contains(["nbg1", "fsn1", "hel1", "hil", "ash", "sin"], var.server_location)
    error_message = "Location must be a valid Hetzner datacenter code."
  }
}

variable "operator_ssh_public_keys" {
  description = "Public SSH keys of operator computers, by name, installed for root when the server is created (terraform-germinal is always included)"
  type        = map(string)
  default     = {}
}

variable "server_image" {
  description = "Server OS image"
  type        = string
  default     = "ubuntu-24.04"
}


variable "enable_backups" {
  description = "Enable automatic backups for the server (additional cost)"
  type        = bool
  default     = true
}

# ============================================
# Cloudflare DNS Variables
# ============================================

# Cloudflare's published edge ranges (https://www.cloudflare.com/ips-v4 and
# /ips-v6), the only sources allowed to reach 80/443 (firewall.tf). Keep in
# sync with the Ansible caddy role's caddy_trusted_proxies.
variable "cloudflare_ipv4_ranges" {
  description = "Cloudflare edge IPv4 ranges allowed to reach the origin's HTTP(S) ports"
  type        = list(string)
  default = [
    "173.245.48.0/20",
    "103.21.244.0/22",
    "103.22.200.0/22",
    "103.31.4.0/22",
    "141.101.64.0/18",
    "108.162.192.0/18",
    "190.93.240.0/20",
    "188.114.96.0/20",
    "197.234.240.0/22",
    "198.41.128.0/17",
    "162.158.0.0/15",
    "104.16.0.0/13",
    "104.24.0.0/14",
    "172.64.0.0/13",
    "131.0.72.0/22",
  ]
}

variable "cloudflare_ipv6_ranges" {
  description = "Cloudflare edge IPv6 ranges allowed to reach the origin's HTTP(S) ports"
  type        = list(string)
  default = [
    "2400:cb00::/32",
    "2606:4700::/32",
    "2803:f800::/32",
    "2405:b500::/32",
    "2405:8100::/32",
    "2a06:98c0::/29",
    "2c0f:f248::/32",
  ]
}

# No default on purpose: a permissive fallback would silently reopen SSH to
# the internet. See the README ("Origin firewall") before choosing a value.
variable "ssh_allowed_ips" {
  description = "Source CIDRs allowed to reach SSH (admin IPs, as /32 or /128)"
  type        = list(string)

  validation {
    condition     = length(var.ssh_allowed_ips) > 0
    error_message = "ssh_allowed_ips must list at least one CIDR."
  }
}

variable "ssh_port" {
  description = "SSH port on the server (Ansible inventory ssh_port)"
  type        = number
  default     = 22
}


variable "cloudflare_token" {
  description = "Cloudflare API token with Zone:Edit permissions (secret: TF_VAR_cloudflare_token from Infisical germinal-infra)"
  type        = string
  sensitive   = true
}

variable "cloudflare_zone_id" {
  description = "Cloudflare zone ID for your domain"
  type        = string
}

variable "domain_name" {
  description = "Primary domain name (e.g., example.com)"
  type        = string
}

variable "contact_email" {
  description = "Contact email for DMARC reports and domain notifications"
  type        = string
}

variable "google_site_verification" {
  description = "Google site verification token (optional, leave empty if not needed)"
  type        = string
  default     = ""
}

variable "create_www_dns" {
  description = "Create WWW DNS record (set to false if already exists)"
  type        = bool
  default     = false
}

variable "create_staging_dns" {
  description = "Create staging and admin-staging DNS records"
  type        = bool
  default     = true
}

# ============================================
# Email Configuration Variables
# ============================================

variable "email_mx_records" {
  description = "Inbound MX hosts for the mailbox provider, mapped to their priority (lower = preferred)"
  type        = map(number)
}

variable "email_dns_ttl" {
  description = "TTL (seconds) of the mailbox provider records (MX, mailbox DKIM)"
  type        = number
  default     = 600
}

variable "email_spf_includes" {
  description = "Domains to include in SPF record (e.g., amazonses.com, _spf.hostinger.com)"
  type        = list(string)
  default     = ["amazonses.com"]
}

variable "email_dmarc_policy" {
  description = "DMARC policy for the domain (none, quarantine, reject)"
  type        = string
  default     = "quarantine"

  validation {
    condition     = contains(["none", "quarantine", "reject"], var.email_dmarc_policy)
    error_message = "DMARC policy must be one of: none, quarantine, reject."
  }
}

variable "email_dkim_records" {
  description = "Mailbox and sending provider DKIM/verification records, keyed by record name (e.g. zmail._domainkey for Zoho Mail, brevo1._domainkey for Brevo)"
  type        = map(object({ type = string, content = string }))
  default     = {}
}

# ============================================
# Infisical Variables
# ============================================

variable "infisical_host" {
  description = "Infisical instance the provider writes to"
  type        = string
  default     = "https://secrets.henga.dev"
}

variable "infisical_germinal_project_id" {
  description = "ID of the Infisical `germinal` project, where Terraform writes the credentials it creates"
  type        = string
  default     = "78c404c2-a76c-4967-8ff0-e7544f1b6fff"
}

# ============================================
# Backup Configuration Variables
# ============================================

variable "backup_retention_days" {
  description = "Number of days to retain daily database backups before deletion"
  type        = number
  default     = 90

  validation {
    condition     = var.backup_retention_days >= 7 && var.backup_retention_days <= 365
    error_message = "Backup retention must be between 7 and 365 days."
  }
}
