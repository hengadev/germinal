# Values Terraform owns, written into the Infisical `germinal` project so they
# are never copied by hand. The Infisical Agent on the server renders them
# into each environment's env file; `make env` renders dev's.
#
#   germinal/staging/s3, germinal/prod/s3:
#     AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY  <- aws_iam_access_key.app_user[<env>]
#     AWS_REGION, S3_BUCKET_NAME, MEDIA_URL     <- region, media bucket, media CDN
#
# Nothing is written to germinal/dev: dev uses the local MinIO and keeps its
# AWS_* keys empty, so it can reach no real bucket and send no real email.
#
# Twilio API keys are not here: the Twilio provider cannot return a key's
# secret, so they are created by hand (see README.md, "Twilio API keys").

locals {
  # Terraform environment name => Infisical environment slug
  infisical_env_slugs = {
    staging    = "staging"
    production = "prod"
  }

  # Value of each secret, keyed "<env-slug>/<NAME>"
  infisical_s3_values = merge([
    for env, slug in local.infisical_env_slugs : {
      "${slug}/AWS_ACCESS_KEY_ID"     = aws_iam_access_key.app_user[env].id
      "${slug}/AWS_SECRET_ACCESS_KEY" = aws_iam_access_key.app_user[env].secret
      "${slug}/AWS_REGION"            = var.aws_region
      "${slug}/S3_BUCKET_NAME"        = aws_s3_bucket.media[env].bucket
      "${slug}/MEDIA_URL"             = "https://${local.media_domains[env]}"
    }
  ]...)

  # Same keys, split into env and name, with no resource attributes, so the
  # for_each keys are known at plan time.
  infisical_s3_secrets = {
    for key in flatten([
      for slug in values(local.infisical_env_slugs) : [
        for name in ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_REGION", "S3_BUCKET_NAME", "MEDIA_URL"] : "${slug}/${name}"
      ]
    ]) : key => { env = split("/", key)[0], name = split("/", key)[1] }
  }
}

resource "infisical_secret" "s3" {
  for_each = local.infisical_s3_secrets

  workspace_id = var.infisical_germinal_project_id
  env_slug     = each.value.env
  folder_path  = "/s3"
  name         = each.value.name
  value        = local.infisical_s3_values[each.key]
}
