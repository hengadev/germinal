# Germinal Terraform Configuration
# This file configures the Terraform backend and providers

terraform {
  # S3 backend for state storage
  # Note: The bucket must be created before running terraform init
  # You can create it manually via AWS CLI or console, or use backend.tf
  backend "s3" {
    bucket         = "germinal-terraform-state"
    key            = "terraform.tfstate"
    region         = "eu-central-1"
    encrypt        = true
    dynamodb_table = "germinal-terraform-locks"
  }

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    hcloud = {
      source  = "hetznercloud/hcloud"
      version = "~> 1.45"
    }
  }

  required_version = ">= 1.0"
}

# AWS Provider
provider "aws" {
  region = var.aws_region
}

# Hetzner Cloud Provider
provider "hcloud" {
  token = var.hcloud_token
}
