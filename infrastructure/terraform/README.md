# Germinal Terraform

Infrastructure as code for Germinal: the Hetzner VPS, Cloudflare DNS, and the
AWS side (S3 media and backup buckets, IAM, CloudFront, SES).

One state, in S3, holds everything: the shared resources plus the
per-environment resources for **staging** and **production**. It can be
planned and applied from any computer with no flags, after `infisical login`.

## What this manages

| Area | Resources |
| --- | --- |
| Hetzner | The VPS (`hcloud_server.main`), its **primary IPs** (IPv4 + IPv6), which survive a server rebuild, and the origin firewall (`hcloud_firewall.main`) |
| Cloudflare | App records (`@`, `www`, `admin`, `staff`, `staging`, ...), email records (Zoho Mail MX, SPF, DKIM, DMARC), SES and ACM validation records, `media` and `media-staging` CNAMEs |
| AWS, per environment | `<env>-germinal-media` and `<env>-germinal-backups` buckets, the `<env>-germinal-app` IAM user, its policies (S3, SES) and access key, the `production-germinal-backup` IAM user (backup bucket, no delete; key written to Infisical prod `/backup`), and a media CDN (CloudFront + ACM): `media.<domain>` for production, `media-staging.<domain>` for staging |
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
  | `TF_VAR_cloudflare_token` | Cloudflare provider (Cloudflare token "Germinal terraform": DNS edit on the `germinalstudio.co` zone only) |
  | `TF_VAR_ssh_allowed_ips` | SSH allowlist of the origin firewall, as a list (`["203.0.113.4/32"]`); see [Origin firewall](#origin-firewall) |
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
   (Standard), named `<env>-germinal-app`, in the **Ireland (IE1)** region:
   an API key only works in the region it was created in, and the app sends
   its requests to the region in `TWILIO_REGION` / `TWILIO_EDGE` (`ie1` /
   `dublin`; empty = US1).
2. Put the SID and secret in Infisical `germinal/<env>/twilio` as
   `TWILIO_API_KEY_SID` and `TWILIO_API_KEY_SECRET`.
3. Delete the previous key in the Twilio console once the app runs with the new one.

To check a key, a region and the sender end to end, send one SMS from the
running app container with [scripts/twilio-send-test.js](../../scripts/twilio-send-test.js)
(staging first; usage and error codes in its header). The sender must work in
IE1: no +1 number; an Alphanumeric Sender ID (paid accounts only) or a
non-+1 number moved to IE1.

## Single state (issue 012)

The two old workspaces (`default` and `production`) were merged into one state
by the Phase 6 rebuild (2026-10-06). The one-time `moved`/`import` blocks
(`migration.tf`) and the `production` workspace are gone; the old
`production-germinal-app` access key was replaced by the one in `s3.tf`.

## Origin firewall

`firewall.tf` attaches a Hetzner Cloud firewall to the server (issue 012):

- **80/443 TCP and 443 UDP (HTTP/3) only from Cloudflare's edge ranges**
  (`cloudflare_ipv4_ranges`, `cloudflare_ipv6_ranges`). Every public hostname
  is proxied, so a direct caller could only be bypassing Cloudflare's WAF, or
  spoofing the `CF-Connecting-IP` header that Caddy trusts for the client IP.
  When Cloudflare publishes new ranges (<https://www.cloudflare.com/ips/>),
  update both variables **and** the Ansible caddy role's
  `caddy_trusted_proxies`, then apply both.
- **SSH only from `ssh_allowed_ips`**, which has no default: a missing value
  stops the plan instead of reopening SSH to the internet. It is currently
  open to all sources (see *CI deploys use SSH too* below).
- **This firewall is the real boundary; UFW is defence in depth.** Ports that
  Docker publishes (Caddy's 80/443) bypass UFW, because Docker inserts its own
  iptables rules ahead of UFW's. Never rely on a UFW rule to close a
  published port.

**CI deploys use SSH too.** The staging deploy (`ci.yml`) and Promote
(`promote.yml`) jobs SSH into the server from GitHub-hosted runners, whose
addresses are not fixed. An allowlist of admin IPs alone would block them.
**Decision (2026-10-22): SSH stays open to all sources**
(`ssh_allowed_ips = ["0.0.0.0/0", "::/0"]`), protected by key-only auth and
the CI key's forced command. Narrow it only together with a fixed-address
path for CI (a self-hosted runner or a VPN).

**Caddy's Cloudflare token** (Infisical `prod/caddy/CLOUDFLARE_API_TOKEN`,
Cloudflare token "Germinal ansible") has Zone DNS read + edit on the
`germinalstudio.co` zone only, nothing account-wide: it lives on the server.

## Files

```
main.tf            backend (S3, eu-west-3, lockfile) and providers
locals.tf          environments, shared-resource naming
variables.tf       inputs (secrets marked sensitive)
terraform.tfvars   non-secret input values (committed)
hetzner.tf         server + primary IPs
firewall.tf        origin firewall: Cloudflare-only HTTP(S), allowlisted SSH
cloudflare.tf      DNS records
s3.tf, backups.tf  per-environment buckets, IAM user, policies, access key
ses.tf             SES identity, DKIM, MAIL FROM, per-environment send policy
cloudfront.tf      media CDN per environment (CloudFront + ACM)
app-germinal.tf    S3-only IAM user for operator use (keys made by hand)
infisical.tf       credentials written into the germinal project
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
