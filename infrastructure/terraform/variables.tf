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
  default     = "cpx11"

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

variable "ssh_public_key" {
  description = "SSH public key for server access (content of your id_rsa.pub file)"
  type        = string
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
