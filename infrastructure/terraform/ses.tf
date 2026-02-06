# ============================================
# Amazon SES Configuration (OPTIONAL)
# ============================================
# This file defines SES (Simple Email Service) resources for sending emails.
#
# USAGE:
# 1. First, complete manual SES setup in AWS Console:
#    - Verify your domain in SES
#    - Request production access (to send to non-verified emails)
#    - Create SMTP credentials
#
# 2. Add DKIM DNS records to Cloudflare (you'll get tokens from AWS Console)
#
# 3. Update your .env with SES SMTP credentials:
#    SMTP_HOST=email.{region}.amazonaws.com
#    SMTP_PORT=587
#    SMTP_SECURE=false
#    SMTP_USER=AKIAXXXXXXXXXXXXXXXX (from SES SMTP credentials)
#    SMTP_PASSWORD=XXXXXXXXXXXXXXXXXX (from SES SMTP credentials)
#    SMTP_FROM_EMAIL=noreply@yourdomain.com
#    SMTP_FROM_NAME=Germinal
#
# 4. Once everything is working manually, you can uncomment the resources
#    below to move SES to Infrastructure as Code.
#
# 5. Run: terraform plan && terraform apply
#
# NOTE: Moving to IaC will NOT re-create SMTP credentials - you'll keep using
#       the ones created manually (SES doesn't support credential rotation via Terraform)
# ============================================

# ============================================
# SES Domain Identity
# ============================================
# Verifies your domain ownership with SES.
# After creation, AWS will provide verification tokens for DNS records.
#
# MANUAL STEP: After applying, add these TXT records to Cloudflare:
#   Type: TXT
#   Name: _amazonses
#   Value: {aws_ses_domain_identity.main.verification_token}
# ============================================

# resource "aws_ses_domain_identity" "main" {
#   domain = var.domain_name
#
#   tags = {
#     Name        = "${var.project_name} SES Domain"
#     Environment = var.environment
#     ManagedBy   = "Terraform"
#   }
# }

# ============================================
# SES DKIM Authentication
# ============================================
# Generates DKIM tokens for email authentication and spoofing protection.
# After creation, you'll get 3 CNAME records to add to Cloudflare.
#
# MANUAL STEP: After applying, add these CNAME records to Cloudflare:
#   Type: CNAME
#   Name: {token1}._domainkey
#   Value: {token1}.dkim.amazonses.com
#   (repeat for token2 and token3)
# ============================================

# resource "aws_ses_domain_dkim" "main" {
#   domain = aws_ses_domain_identity.main.domain
# }

# ============================================
# SES Configuration Set
# ============================================
# A logical grouping of email sending preferences. Useful for:
# - Sending analytics
# - Reputation metrics per use-case
# - Event publishing (bounces, complaints, deliveries)
# ============================================

# resource "aws_ses_configuration_set" "main" {
#   name = "${var.environment}-${var.project_name}-config"
#
#   sending_enabled = true
#
#   reputation_metrics_enabled = true
#
#   tags = {
#     Name        = "${var.project_name} SES Config Set"
#     Environment = var.environment
#     ManagedBy   = "Terraform"
#   }
# }

# ============================================
# SES Sending Policy (IAM)
# ============================================
# Allows the application IAM user to send emails via SES.
# This policy is attached to the existing app_user defined in s3.tf.
#
# Note: This only authorizes API calls. For SMTP, you need separate
#       SMTP credentials created in the AWS Console.
# ============================================

# resource "aws_iam_policy" "ses_send" {
#   name        = "${var.project_name}-ses-send"
#   description = "Policy for ${var.project_name} to send emails via SES"
#
#   policy = jsonencode({
#     Version = "2012-10-17"
#     Statement = [
#       {
#         Sid      = "SESSendAccess"
#         Effect   = "Allow"
#         Action   = [
#           "ses:SendEmail",
#           "ses:SendRawEmail"
#         ]
#         Resource = "*"
#       },
#       {
#         Sid      = "SESVerifyAccess"
#         Effect   = "Allow"
#         Action   = [
#           "ses:VerifyEmailIdentity",
#           "ses:GetIdentityVerificationAttributes",
#           "ses:GetIdentityMailFromDomainAttributes"
#         ]
#         Resource = "*"
#       }
#     ]
#   })
# }

# resource "aws_iam_user_policy_attachment" "ses_send_attach" {
#   user       = aws_iam_user.app_user.name
#   policy_arn = aws_iam_policy.ses_send.arn
# }

# ============================================
# SES MAIL FROM Domain (Optional)
# ============================================
# Configures a MAIL FROM domain for bounce/compaint tracking.
# This gives you better control over bounce notifications.
#
# MANUAL STEP: After applying, add MX and TXT records to Cloudflare:
#   MX: 10 feedback-smtp.{region}.amazonses.com
#   TXT: "v=spf1 include:amazonses.com ~all"
# ============================================

# resource "aws_ses_domain_mail_from" "main" {
#   domain           = aws_ses_domain_identity.main.domain
#   mail_from_domain = "mail.${aws_ses_domain_identity.main.domain}"
# }

# ============================================
# Outputs (for reference)
# ============================================
# After uncommenting and applying, these values will be useful for DNS setup.

# output "ses_verification_token" {
#   description = "Token to add as _amazonses TXT record in Cloudflare"
#   value       = aws_ses_domain_identity.main.verification_token
# }

# output "ses_dkim_tokens" {
#   description = "DKIM tokens to add as _domainkey CNAME records in Cloudflare"
#   value       = aws_ses_domain_dkim.main.dkim_tokens
# }

# output "ses_mail_from_domain" {
#   description = "MAIL FROM domain for MX records"
#   value       = aws_ses_domain_mail_from.main.mail_from_domain
# }

# ============================================
# MANUAL SETUP CHECKLIST
# ============================================
# Before enabling Terraform SES resources:
#
# [ ] 1. Domain is verified in AWS SES Console
# [ ] 2. Production access requested (if sending to non-verified emails)
# [ ] 3. SMTP credentials created in SES Console (SES → SMTP Settings)
# [ ] 4. DKIM records added to Cloudflare DNS
# [ ] 5. SPF record updated to include amazonses.com
# [ ] 6. .env updated with SES SMTP credentials
# [ ] 7. Test email sent successfully
# [ ] 8. Then uncomment resources above and run terraform apply
# ============================================
