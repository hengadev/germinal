# One-time migration to a single state (issue 012).
#
# Before: two workspaces sharing these files. `default` held the server, DNS,
# CloudFront, SES and the staging-germinal-* resources; `production` held the
# production-germinal-* resources and app-germinal.
#
# After: one state (`default`). The blocks below are applied once, by the
# first `make apply` (Phase 6). Once that apply has succeeded and the
# `production` workspace is deleted, this file can be removed.
#
# Nothing here destroys or replaces a bucket, IAM user or policy.

data "aws_caller_identity" "current" {}

locals {
  iam_policy_arn_prefix = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:policy"
}

# --------------------------------------------------------------------------
# `default` workspace: staging resources move under their for_each key.
# --------------------------------------------------------------------------

moved {
  from = aws_s3_bucket.media
  to   = aws_s3_bucket.media["staging"]
}
moved {
  from = aws_s3_bucket_versioning.media_versioning
  to   = aws_s3_bucket_versioning.media_versioning["staging"]
}
moved {
  from = aws_s3_bucket_server_side_encryption_configuration.media_encryption
  to   = aws_s3_bucket_server_side_encryption_configuration.media_encryption["staging"]
}
moved {
  from = aws_s3_bucket_public_access_block.media_block
  to   = aws_s3_bucket_public_access_block.media_block["staging"]
}
moved {
  from = aws_s3_bucket_lifecycle_configuration.media_lifecycle
  to   = aws_s3_bucket_lifecycle_configuration.media_lifecycle["staging"]
}
moved {
  from = aws_s3_bucket_cors_configuration.media_cors
  to   = aws_s3_bucket_cors_configuration.media_cors["staging"]
}
moved {
  from = aws_s3_bucket.backups
  to   = aws_s3_bucket.backups["staging"]
}
moved {
  from = aws_s3_bucket_versioning.backups_versioning
  to   = aws_s3_bucket_versioning.backups_versioning["staging"]
}
moved {
  from = aws_s3_bucket_server_side_encryption_configuration.backups_encryption
  to   = aws_s3_bucket_server_side_encryption_configuration.backups_encryption["staging"]
}
moved {
  from = aws_s3_bucket_public_access_block.backups_block
  to   = aws_s3_bucket_public_access_block.backups_block["staging"]
}
moved {
  from = aws_s3_bucket_lifecycle_configuration.backups_lifecycle
  to   = aws_s3_bucket_lifecycle_configuration.backups_lifecycle["staging"]
}
moved {
  from = aws_iam_user.app_user
  to   = aws_iam_user.app_user["staging"]
}
moved {
  from = aws_iam_access_key.app_user
  to   = aws_iam_access_key.app_user["staging"]
}
moved {
  from = aws_iam_policy.s3_access
  to   = aws_iam_policy.s3_access["staging"]
}
moved {
  from = aws_iam_user_policy_attachment.s3_access_attach
  to   = aws_iam_user_policy_attachment.s3_access_attach["staging"]
}
moved {
  from = aws_iam_policy.backup_access
  to   = aws_iam_policy.backup_access["staging"]
}
moved {
  from = aws_iam_user_policy_attachment.backup_access_attach
  to   = aws_iam_user_policy_attachment.backup_access_attach["staging"]
}
moved {
  from = aws_iam_policy.ses_send
  to   = aws_iam_policy.ses_send["staging"]
}
moved {
  from = aws_iam_user_policy_attachment.ses_send_attach
  to   = aws_iam_user_policy_attachment.ses_send_attach["staging"]
}

# --------------------------------------------------------------------------
# `production` workspace: imported, since `moved` cannot cross states.
#
# Not imported, on purpose:
# - aws_iam_access_key.app_user["production"] and aws_iam_access_key.app_germinal:
#   AWS never returns a key's secret, so an imported key could not be written
#   to Infisical. Terraform creates new keys instead (a rotation); delete the
#   old ones by hand after the apply (README.md, "After the first apply").
# - the production workspace's aws_acm_certificate.media: an unused duplicate of
#   the media.<domain> certificate, which moves to ["production"] below.
# --------------------------------------------------------------------------

import {
  to = aws_s3_bucket.media["production"]
  id = "production-${var.project_name}-media"
}
import {
  to = aws_s3_bucket_versioning.media_versioning["production"]
  id = "production-${var.project_name}-media"
}
import {
  to = aws_s3_bucket_server_side_encryption_configuration.media_encryption["production"]
  id = "production-${var.project_name}-media"
}
import {
  to = aws_s3_bucket_public_access_block.media_block["production"]
  id = "production-${var.project_name}-media"
}
import {
  to = aws_s3_bucket_lifecycle_configuration.media_lifecycle["production"]
  id = "production-${var.project_name}-media"
}
import {
  to = aws_s3_bucket_cors_configuration.media_cors["production"]
  id = "production-${var.project_name}-media"
}

# The production backup bucket was created without versioning or a lifecycle
# configuration; those two are created (not imported) to match staging.
import {
  to = aws_s3_bucket.backups["production"]
  id = "production-${var.project_name}-backups"
}
import {
  to = aws_s3_bucket_server_side_encryption_configuration.backups_encryption["production"]
  id = "production-${var.project_name}-backups"
}
import {
  to = aws_s3_bucket_public_access_block.backups_block["production"]
  id = "production-${var.project_name}-backups"
}

import {
  to = aws_iam_user.app_user["production"]
  id = "production-${var.project_name}-app"
}
import {
  to = aws_iam_policy.s3_access["production"]
  id = "${local.iam_policy_arn_prefix}/production-${var.project_name}-s3-access"
}
import {
  to = aws_iam_user_policy_attachment.s3_access_attach["production"]
  id = "production-${var.project_name}-app/${local.iam_policy_arn_prefix}/production-${var.project_name}-s3-access"
}
import {
  to = aws_iam_policy.backup_access["production"]
  id = "${local.iam_policy_arn_prefix}/production-${var.project_name}-backup-access"
}
import {
  to = aws_iam_user_policy_attachment.backup_access_attach["production"]
  id = "production-${var.project_name}-app/${local.iam_policy_arn_prefix}/production-${var.project_name}-backup-access"
}
import {
  to = aws_iam_policy.ses_send["production"]
  id = "${local.iam_policy_arn_prefix}/production-${var.project_name}-ses-send"
}
import {
  to = aws_iam_user_policy_attachment.ses_send_attach["production"]
  id = "production-${var.project_name}-app/${local.iam_policy_arn_prefix}/production-${var.project_name}-ses-send"
}

import {
  to = aws_iam_user.app_germinal
  id = "app-germinal"
}
import {
  to = aws_iam_policy.app_germinal
  id = "${local.iam_policy_arn_prefix}/app-germinal-policy"
}
import {
  to = aws_iam_user_policy_attachment.app_germinal
  id = "app-germinal/${local.iam_policy_arn_prefix}/app-germinal-policy"
}

# --------------------------------------------------------------------------
# Media CDN: one per environment. The existing distribution, certificate and
# DNS record (media.<domain>) become production's, and the distribution is
# repointed at the production bucket. The existing OAC (named staging-...)
# stays staging's; production reuses the OAC the production workspace made.
# Staging gets a new distribution at media-staging.<domain>.
# --------------------------------------------------------------------------

moved {
  from = aws_cloudfront_distribution.media
  to   = aws_cloudfront_distribution.media["production"]
}
moved {
  from = aws_acm_certificate.media
  to   = aws_acm_certificate.media["production"]
}
moved {
  from = aws_acm_certificate_validation.media
  to   = aws_acm_certificate_validation.media["production"]
}
moved {
  from = cloudflare_dns_record.media
  to   = cloudflare_dns_record.media["production"]
}
moved {
  from = aws_cloudfront_origin_access_control.media
  to   = aws_cloudfront_origin_access_control.media["staging"]
}
moved {
  from = aws_s3_bucket_policy.media_cloudfront
  to   = aws_s3_bucket_policy.media_cloudfront["staging"]
}

import {
  to = aws_cloudfront_origin_access_control.media["production"]
  id = "E31DOGWPKF8093" # production-germinal-media-oac
}

# --------------------------------------------------------------------------
# Cloudflare: the mailbox moved from Hostinger to Zoho Mail by hand. The
# Hostinger MX/SPF records in the state no longer exist in Cloudflare, so
# they are forgotten (not destroyed) and the live Zoho records are imported.
# --------------------------------------------------------------------------

removed {
  from = cloudflare_dns_record.mx1
  lifecycle {
    destroy = false
  }
}
removed {
  from = cloudflare_dns_record.mx2
  lifecycle {
    destroy = false
  }
}
removed {
  from = cloudflare_dns_record.spf
  lifecycle {
    destroy = false
  }
}

import {
  for_each = {
    "mx.zoho.eu"  = "bb222d3b3d11eaad36f1f05b3721ec2e"
    "mx2.zoho.eu" = "6976c45ad86a2fef8fcbed146daec745"
    "mx3.zoho.eu" = "508b6ba2c6c3c73eee9c719929a09ba9"
  }
  to = cloudflare_dns_record.mx[each.key]
  id = "${var.cloudflare_zone_id}/${each.value}"
}
import {
  to = cloudflare_dns_record.email_spf
  id = "${var.cloudflare_zone_id}/dafcf59274d9b0df4382fbc3d52b2478"
}
import {
  to = cloudflare_dns_record.mailbox_dkim["zmail._domainkey"]
  id = "${var.cloudflare_zone_id}/5a6dad002e641cccfca56ae05a3779b1"
}
import {
  to = cloudflare_dns_record.google_site_verification[0]
  id = "${var.cloudflare_zone_id}/f3384c0441b2130896d6876bbc30d75a"
}

# --------------------------------------------------------------------------
# Infisical: these `/s3` values were pasted into `germinal` by hand
# (checklist Phase 1). Import them so Terraform overwrites them in place.
# --------------------------------------------------------------------------

import {
  for_each = local.infisical_s3_secrets
  to       = infisical_secret.s3[each.key]
  id       = "${var.infisical_germinal_project_id}:${each.value.env}:/s3:${each.value.name}"
}
