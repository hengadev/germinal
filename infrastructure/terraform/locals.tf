# Shared locals for Germinal infrastructure

locals {
  # Per-environment AWS resources (media + backup buckets, app IAM user and
  # policies) are declared once for each of these.
  environments = toset(["staging", "production"])

  # Shared resources (SES configuration set, state bucket) were first created
  # by the old `default` workspace with environment = "staging", and that name
  # is baked into their names and tags.
  # Renaming them would replace them, so they keep it.
  shared_env = "staging"

  # Media CDN domain per environment (cloudfront.tf). The app stores full
  # media URLs, so these must not change once an environment holds data.
  media_domains = {
    production = "media.${var.domain_name}"
    staging    = "media-staging.${var.domain_name}"
  }
}
