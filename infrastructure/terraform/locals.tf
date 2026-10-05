# Shared locals for Germinal infrastructure

locals {
  # Per-environment AWS resources (media + backup buckets, app IAM user and
  # policies) are declared once for each of these.
  environments = toset(["staging", "production"])

  # Shared resources (SES configuration set, CloudFront OAC, ACM certificate,
  # state bucket) were first created by the old `default` workspace with
  # environment = "staging", and that name is baked into their names and tags.
  # Renaming them would replace them, so they keep it.
  shared_env = "staging"

  # Environment whose media bucket is served by CloudFront at media.<domain>.
  cdn_env = "staging"
}
