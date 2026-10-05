# Germinal Terraform

Infrastructure as code for Germinal: the Hetzner VPS, Cloudflare DNS, and the
AWS side (S3 media and backup buckets, IAM, CloudFront, SES).

One state, in S3, holds everything: the shared resources plus the
per-environment resources for **staging** and **production**. It can be
planned and applied from any computer with no flags, after `infisical login`.

## What this manages

| Area | Resources |
| --- | --- |
| Hetzner | The VPS (`hcloud_server.main`) and its **primary IPs** (IPv4 + IPv6), which survive a server rebuild |
| Cloudflare | App records (`@`, `www`, `admin`, `staff`, `staging`, ...), email records (Zoho Mail MX, SPF, DKIM, DMARC), SES and ACM validation records, `media` and `media-staging` CNAMEs |
| AWS, per environment | `<env>-germinal-media` and `<env>-germinal-backups` buckets, the `<env>-germinal-app` IAM user, its policies (S3, backups, SES) and access key, and a media CDN (CloudFront + ACM): `media.<domain>` for production, `media-staging.<domain>` for staging |
| AWS, shared | SES domain identity, DKIM and MAIL FROM; the `app-germinal` IAM user (operator use, keys made by hand); the state bucket |
| Infisical | The credentials Terraform creates, written into the `germinal` project (below) |

## Secrets and inputs

- **Non-secret inputs** are in the committed [`terraform.tfvars`](terraform.tfvars):
  domain, zone ID, DNS and email records, server settings. Never put a secret in it.
- **Secret inputs** are in the Infisical project **`germinal-infra`**
  (environment `prod`, path `/`) and arrive as environment variables through
  `infisical run`:

  | Infisical key | Used for |
  | --- | --- |
  | `TF_VAR_hcloud_token` | Hetzner provider |
  | `TF_VAR_cloudflare_token` | Cloudflare provider |
  | `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | AWS provider **and** the S3 state backend (the `terraform-germinal` IAM user) |

  The server's `germinal-vps` identity has no access to `germinal-infra`.

- **Outputs written to Infisical.** Terraform writes the credentials it
  creates, and the `/s3` values it owns, into the `germinal` project, so
  nobody copies them by hand:

  | Infisical `germinal` | Value |
  | --- | --- |
  | `staging`, `prod` `/s3` `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | that environment's `<env>-germinal-app` access key |
  | `staging`, `prod` `/s3` `AWS_REGION`, `S3_BUCKET_NAME`, `MEDIA_URL` | region, media bucket, media CDN URL |

  The Infisical Agent on the server renders them into each environment's env
  file. Nothing is written to `dev`: it uses the local MinIO and keeps its
  `AWS_*` keys empty, so it reaches no real bucket and sends no real email.

### How Terraform authenticates to Infisical

`./tf.sh` (which every Makefile target uses) does two things:

1. `infisical run --projectId=<germinal-infra> --env=prod` injects the secret inputs above.
2. It hands the Infisical **provider** your own session token
   (`infisical user get token`) as `INFISICAL_TOKEN` with
   `INFISICAL_AUTH_METHOD=token`. There is no machine identity for Terraform,
   so no extra long-lived credential exists. You need write access to the
   `germinal` project's `/s3` folders.

When your Infisical session expires, `tf.sh` stops with "run: infisical login".

## Usage

Prerequisites: Terraform ≥ 1.7, the Infisical CLI, `infisical login`, and
membership of both `germinal-infra` and `germinal`. No AWS profile, no local
tfvars, no workspace.

```bash
cd infrastructure/terraform
make init       # S3 backend + providers (versions pinned in .terraform.lock.hcl)
make plan
make apply      # also updates the credentials in Infisical
make validate   # fmt -check + validate, offline
./tf.sh <any terraform command>   # e.g. ./tf.sh state list
```

### Rebuilding the server

```bash
./tf.sh apply -replace=hcloud_server.main
```

The primary IPs are separate resources (with delete protection and
`prevent_destroy`), so the new server gets the same addresses and the DNS
records don't change. Then re-run the Ansible playbooks.

### Rotating the app credentials

```bash
./tf.sh apply -replace='aws_iam_access_key.app_user["production"]'   # or "staging"
```

The new key is written to Infisical in the same apply, and the Agent picks it up.

### Twilio API keys (manual)

Twilio API keys are **not** managed by Terraform: the Twilio provider cannot
return a key's secret (twilio/terraform-provider-twilio#82), so Terraform
could not write it to Infisical. Per environment:

1. Twilio console → Account → API keys & tokens → **Create API key**
   (Standard), named `<env>-germinal-app`.
2. Put the SID and secret in Infisical `germinal/<env>/twilio` as
   `TWILIO_API_KEY_SID` and `TWILIO_API_KEY_SECRET`.
3. Delete the previous key in the Twilio console once the app runs with the new one.

## After the first apply (one-time, issue 012)

The first apply is the Phase 6 rebuild, `./tf.sh apply -replace=hcloud_server.main`.
Not a plain `make apply`: the existing server has no primary IPs yet, and
without `-replace` Terraform would power it off to swap them in.

That first apply imports the old
`production` workspace's resources and creates a **new** access key for
`production-germinal-app` (AWS never returns an existing key's secret, so the
old key could not be written to Infisical). Afterwards:

1. Check `./tf.sh plan` shows no changes.
2. Delete the **old** access key of `production-germinal-app` (IAM console →
   user → Security credentials; the one Terraform did not just create).
   `app-germinal`'s keys are untouched.
3. Retire the old workspace: `./tf.sh workspace delete -force production`
   (drops that state only; its resources are all in `default` now).
4. Optional: delete the `production` workspace's unused duplicate, which
   Terraform no longer tracks: the ACM certificate for `media.<domain>` tagged
   `Environment = production` in us-east-1 (the one **not** attached to the
   production distribution).
5. Delete `migration.tf`.

## Files

```
main.tf            backend (S3, eu-west-3, lockfile) and providers
locals.tf          environments, shared-resource naming
variables.tf       inputs (secrets marked sensitive)
terraform.tfvars   non-secret input values (committed)
hetzner.tf         server + primary IPs
cloudflare.tf      DNS records
s3.tf, backups.tf  per-environment buckets, IAM user, policies, access key
ses.tf             SES identity, DKIM, MAIL FROM, per-environment send policy
cloudfront.tf      media CDN per environment (CloudFront + ACM)
app-germinal.tf    S3-only IAM user for operator use (keys made by hand)
infisical.tf       credentials written into the germinal project
migration.tf       one-time move from two workspaces to one state (issue 012)
backend.tf         the state bucket itself (and the old, unused DynamoDB lock table)
tf.sh, Makefile    run Terraform through Infisical
```

## Media CDN

Each environment's media bucket is private and served by its own CloudFront
distribution: `https://media.<domain>` (production) and
`https://media-staging.<domain>` (staging). Terraform writes the URL to
`MEDIA_URL` in `germinal/<env>/s3`. The app stores **full** media URLs in the
database at upload time, so never repoint an environment's media domain once
it holds data.

## Email

Sending goes through the Amazon SES API with each environment's app
credentials; receiving is Zoho Mail. SES DNS records are created from
`ses.tf`; the mailbox records (MX, SPF, DKIM) come from `terraform.tfvars`.
The only manual SES step is requesting production access in the AWS console.
`make dns-email` prints a summary.

## Troubleshooting

- **"no Infisical session"**: run `infisical login`.
- **`No value for required variable "hcloud_token"`**: the key in
  `germinal-infra` must be named exactly `TF_VAR_hcloud_token`.
- **State lock held** after an interrupted run: `./tf.sh force-unlock <LOCK_ID>`.
