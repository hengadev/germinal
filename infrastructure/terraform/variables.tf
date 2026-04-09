# Input Variables for Germinal Infrastructure

variable "aws_region" {
  description = "AWS region for resources"
  type        = string
  default     = "eu-central-1"
}

variable "project_name" {
  description = "Project name used for resource naming"
  type        = string
  default     = "germinal"
}

variable "environment" {
  description = "Deployment environment (development, staging, production)"
  type        = string
  default     = "development"

  validation {
    condition     = contains(["development", "staging", "production"], var.environment)
    error_message = "Environment must be one of: development, staging, production."
  }
}

variable "allowed_origins" {
  description = "Allowed CORS origins for S3 bucket (e.g., your application domains)"
  type        = list(string)
  default = [
    "http://localhost:5173",
    "http://localhost:4100",
  ]
}

variable "create_backend_resources" {
  description = "Set to false after initial backend setup to avoid recreating state resources"
  type        = bool
  default     = true
}

# ============================================
# Hetzner Cloud Variables
# ============================================

variable "hcloud_token" {
  description = "Hetzner Cloud API token"
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
  description = "Cloudflare API token with Zone:Edit permissions"
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

variable "email_mx_primary" {
  description = "Primary MX server for your mailbox provider"
  type        = string
  default     = "mx1.hostinger.com"
}

variable "email_mx_primary_priority" {
  description = "Priority for primary MX server (lower = higher priority)"
  type        = number
  default     = 10
}

variable "email_mx_secondary" {
  description = "Secondary MX server for your mailbox provider"
  type        = string
  default     = "mx2.hostinger.com"
}

variable "email_mx_secondary_priority" {
  description = "Priority for secondary MX server"
  type        = number
  default     = 20
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
  description = "Mailbox provider DKIM records (from Hostinger hPanel > Emails > Email DNS Records)"
  type        = map(object({ type = string, content = string }))
  default     = {}
}

# ============================================
# Twilio Configuration Variables
# ============================================
# Used by infrastructure/scripts/update-twilio-vault.sh to create API keys.
# Not consumed by any Terraform resource — stored here so credentials live
# in one place alongside the rest of the infrastructure config.

variable "twilio_account_sid" {
  description = "Twilio Account SID (AC...). Use TEST credentials for the staging key."
  type        = string
  sensitive   = true
  default     = ""
}

variable "twilio_auth_token" {
  description = "Twilio Auth Token — used only to create API keys, never written to the VPS."
  type        = string
  sensitive   = true
  default     = ""
}

variable "twilio_phone_number_production" {
  description = "Production Twilio sender phone number in E.164 format (e.g., +33600000000)."
  type        = string
  default     = ""
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
