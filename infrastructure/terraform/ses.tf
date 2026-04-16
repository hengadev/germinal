# ============================================
# Amazon SES Configuration
# ============================================
# SES resources for sending emails: domain verification, DKIM, IAM policy.
# DNS records (DKIM, verification, MAIL FROM) are created automatically in cloudflare.tf.
#
# The application sends email via the SES API (aws-sdk), using the same IAM
# credentials already provisioned for S3 (app_user). No SMTP credentials needed.
#
# REMAINING MANUAL STEP:
# 1. Request SES production access in AWS Console (to send to non-verified emails)
# ============================================

# ============================================
# SES Domain Identity
# ============================================

resource "aws_ses_domain_identity" "main" {
  domain = var.domain_name
}

# ============================================
# SES DKIM Authentication
# ============================================

resource "aws_ses_domain_dkim" "main" {
  domain = aws_ses_domain_identity.main.domain
}

# ============================================
# SES Configuration Set
# ============================================

resource "aws_ses_configuration_set" "main" {
  name = "${var.environment}-${var.project_name}-config"

  sending_enabled = true

  reputation_metrics_enabled = true
}

# ============================================
# SES Sending Policy (IAM)
# ============================================

resource "aws_iam_policy" "ses_send" {
  name        = "${var.environment}-${var.project_name}-ses-send"
  description = "Policy for ${var.environment} ${var.project_name} to send emails via SES"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "SESSendAccess"
        Effect = "Allow"
        Action = [
          "ses:SendEmail",
          "ses:SendRawEmail"
        ]
        Resource = "*"
      },
      {
        Sid    = "SESVerifyAccess"
        Effect = "Allow"
        Action = [
          "ses:VerifyEmailIdentity",
          "ses:GetIdentityVerificationAttributes",
          "ses:GetIdentityMailFromDomainAttributes"
        ]
        Resource = "*"
      }
    ]
  })
}

resource "aws_iam_user_policy_attachment" "ses_send_attach" {
  user       = aws_iam_user.app_user.name
  policy_arn = aws_iam_policy.ses_send.arn
}

# ============================================
# SES MAIL FROM Domain
# ============================================

resource "aws_ses_domain_mail_from" "main" {
  domain           = aws_ses_domain_identity.main.domain
  mail_from_domain = "mail.${aws_ses_domain_identity.main.domain}"
}

# ============================================
# Outputs
# ============================================

output "ses_verification_token" {
  description = "SES domain verification token"
  value       = aws_ses_domain_identity.main.verification_token
}

output "ses_dkim_tokens" {
  description = "SES DKIM tokens"
  value       = aws_ses_domain_dkim.main.dkim_tokens
}

output "ses_mail_from_domain" {
  description = "SES MAIL FROM domain"
  value       = aws_ses_domain_mail_from.main.mail_from_domain
}

output "ses_configuration_set" {
  description = "SES configuration set name"
  value       = aws_ses_configuration_set.main.name
}
