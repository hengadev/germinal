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
  description = "Hetzner Cloud server type (cpx11, cpx21, cpx31, etc.)"
  type        = string
  default     = "cpx22"

  validation {
    condition     = can(regex("^cpx[0-9]{2}$", var.server_type))
    error_message = "Server type must be a valid CX plan (e.g., cpx11, cpx21, cpx31)."
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
  description = "Mailbox provider DKIM records, keyed by record name (e.g. zmail._domainkey for Zoho Mail)"
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
