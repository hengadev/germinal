# Germinal Terraform Configuration
# This file configures the Terraform backend and providers.
#
# Run Terraform through the Makefile (`make plan`, `make apply`, ...). It
# wraps every command in `infisical run` against the `germinal-infra` project,
# which provides the secret TF_VAR_* inputs and the AWS credentials used by
# both the AWS provider and this S3 backend. See README.md.

terraform {
  # One state for everything: shared resources plus staging and production.
  backend "s3" {
    bucket       = "germinal-terraform-state"
    key          = "terraform.tfstate"
    region       = "eu-west-3"
    encrypt      = true
    use_lockfile = true
  }

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    hcloud = {
      source  = "hetznercloud/hcloud"
      version = "~> 1.67"
    }
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 5.0"
    }
    infisical = {
      source  = "Infisical/infisical"
      version = "~> 0.19"
    }
  }

  # 1.7: for_each in import blocks (migration.tf)
  required_version = ">= 1.7"
}

# AWS Provider. Credentials come from AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY,
# injected by `infisical run` (germinal-infra).
provider "aws" {
  region = var.aws_region
}

# Hetzner Cloud Provider
provider "hcloud" {
  token = var.hcloud_token
}

# Cloudflare Provider
provider "cloudflare" {
  api_token = var.cloudflare_token
}

# Infisical Provider. Writes the credentials Terraform creates into the
# `germinal` project (infisical.tf), authenticated with the operator's own
# Infisical login: the Makefile passes the session token from
# `infisical user get token` as INFISICAL_TOKEN (INFISICAL_AUTH_METHOD=token).
# No machine identity, so no extra long-lived credential.
provider "infisical" {
  host = var.infisical_host
}
