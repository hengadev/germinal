# Credentials Terraform creates, written into the Infisical `germinal` project
# so they are never copied by hand. The Infisical Agent on the server renders
# them into each environment's env file; `make env` renders dev's.
#
#   germinal/staging/s3, germinal/prod/s3  <- aws_iam_access_key.app_user[<env>]
#   germinal/dev/s3                        <- aws_iam_access_key.app_germinal
#
# Twilio API keys are not here: the Twilio provider cannot return a key's
# secret, so they are created by hand (see README.md, "Twilio API keys").

locals {
  # Infisical environment slug => the access key whose credentials it gets
  aws_credential_keys = {
    staging = aws_iam_access_key.app_user["staging"]
    prod    = aws_iam_access_key.app_user["production"]
    dev     = aws_iam_access_key.app_germinal
  }

  # One entry per Infisical secret, "<env-slug>/<NAME>". Kept free of
  # resource attributes so import blocks (migration.tf) can iterate it.
  aws_credential_secrets = merge([
    for env in ["staging", "prod", "dev"] : {
      "${env}/AWS_ACCESS_KEY_ID"     = { env = env, name = "AWS_ACCESS_KEY_ID", attribute = "id" }
      "${env}/AWS_SECRET_ACCESS_KEY" = { env = env, name = "AWS_SECRET_ACCESS_KEY", attribute = "secret" }
    }
  ]...)
}

resource "infisical_secret" "aws_credentials" {
  for_each = local.aws_credential_secrets

  workspace_id = var.infisical_germinal_project_id
  env_slug     = each.value.env
  folder_path  = "/s3"
  name         = each.value.name
  value        = local.aws_credential_keys[each.value.env][each.value.attribute]
}
