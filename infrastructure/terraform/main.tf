# Germinal Terraform Configuration
# This file configures the Terraform backend and providers

terraform {
  # S3 backend for state storage
  # Note: The bucket must be created before running terraform init
  # You can create it manually via AWS CLI or console, or use backend.tf
  # backend "s3" {
  #   bucket         = "germinal-terraform-state"
  #   key            = "terraform.tfstate"
  #   region         = "eu-central-1"
  #   encrypt        = true
  #   use_lockfile   = true
  # }

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    hcloud = {
      source  = "hetznercloud/hcloud"
      version = "~> 1.45"
    }
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 5.0"
    }
    twilio = {
      source  = "twilio/twilio"
      version = "~> 0.18"
    }
  }

  required_version = ">= 1.0"
}

# AWS Provider
provider "aws" {
  region  = var.aws_region
  profile = "terraform-germinal"
}

# Hetzner Cloud Provider
provider "hcloud" {
  token = var.hcloud_token
}

# Cloudflare Provider
provider "cloudflare" {
  api_token = var.cloudflare_token
}

# Twilio Provider
# Uses the master Auth Token solely to create scoped API keys — the Auth Token itself
# never leaves Terraform and is never written to the VPS.
provider "twilio" {
  username = var.twilio_account_sid
  password = var.twilio_auth_token
}
