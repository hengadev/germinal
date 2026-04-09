# Twilio Resources for Germinal
# Creates one scoped API key per environment in a single apply.
# The Auth Token is used only here (to authenticate with Twilio) and never written to the VPS.

resource "twilio_api_keys_v2010_account_key" "staging" {
  account_sid   = var.twilio_account_sid
  friendly_name = "staging-${var.project_name}-app"
}

resource "twilio_api_keys_v2010_account_key" "production" {
  account_sid   = var.twilio_account_sid
  friendly_name = "production-${var.project_name}-app"
}
