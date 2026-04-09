#!/usr/bin/env bash
# Creates Twilio API keys (staging + production) via the Twilio REST API and writes
# them into the correct Ansible vault files.
#
# Reads twilio_account_sid and twilio_auth_token from infrastructure/terraform/terraform.tfvars.
# Skips creation if a key is already present in the vault (idempotent).
# The Auth Token is used only here to create the keys and is never written to the VPS.
#
# Usage: run directly or via `make apply-twilio` in infrastructure/terraform/

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TERRAFORM_DIR="$SCRIPT_DIR/../terraform"
ANSIBLE_DIR="$SCRIPT_DIR/../ansible"
TFVARS_FILE="$TERRAFORM_DIR/terraform.tfvars"
PROD_VAULT="$ANSIBLE_DIR/group_vars/all.vault.yml"
STAGING_VAULT="$ANSIBLE_DIR/group_vars/germinal_staging.vault.yml"

# ── Prerequisites ────────────────────────────────────────────────────
for cmd in curl python3; do
    command -v "$cmd" >/dev/null 2>&1 || { echo "❌  $cmd is required but not found"; exit 1; }
done

[ -f "$TFVARS_FILE" ]   || { echo "❌  terraform.tfvars not found at $TFVARS_FILE"; exit 1; }
[ -f "$PROD_VAULT" ]    || { echo "❌  Production vault not found: $PROD_VAULT"; exit 1; }
[ -f "$STAGING_VAULT" ] || { echo "❌  Staging vault not found: $STAGING_VAULT"; exit 1; }

# ── Read credentials from terraform.tfvars ───────────────────────────
read_tfvar() {
    python3 -c "
import re, sys
with open('$TFVARS_FILE') as f:
    for line in f:
        m = re.match(r'\s*' + sys.argv[1] + r'\s*=\s*\"([^\"]+)\"', line)
        if m:
            print(m.group(1))
            sys.exit(0)
sys.exit(1)
" "$1" 2>/dev/null || echo ""
}

ACCOUNT_SID=$(read_tfvar twilio_account_sid)
AUTH_TOKEN=$(read_tfvar twilio_auth_token)

[ -n "$ACCOUNT_SID" ] || { echo "❌  twilio_account_sid not set in terraform.tfvars"; exit 1; }
[ -n "$AUTH_TOKEN" ]  || { echo "❌  twilio_auth_token not set in terraform.tfvars"; exit 1; }

# ── Helpers ───────────────────────────────────────────────────────────
get_yaml_key() {
    # $1 = file path, $2 = key name
    python3 -c "
import yaml, sys
data = yaml.safe_load(open(sys.argv[1])) or {}
print(data.get(sys.argv[2], '') or '')
" "$1" "$2"
}

set_yaml_keys() {
    # $1 = file path, remaining args = key=value pairs
    python3 - "$@" <<'PYEOF'
import yaml, sys

path = sys.argv[1]
data = yaml.safe_load(open(path)) or {}
for pair in sys.argv[2:]:
    key, val = pair.split('=', 1)
    data[key] = val
with open(path, 'w') as f:
    yaml.dump(data, f, default_flow_style=False, allow_unicode=True)
PYEOF
}

create_twilio_key() {
    local friendly_name="$1"
    local response
    response=$(curl -s -X POST \
        "https://api.twilio.com/2010-04-01/Accounts/${ACCOUNT_SID}/Keys.json" \
        -u "${ACCOUNT_SID}:${AUTH_TOKEN}" \
        --data-urlencode "FriendlyName=${friendly_name}")

    local error
    error=$(python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('message',''))" <<< "$response")
    [ -z "$error" ] || { echo "❌  Twilio API error: $error" >&2; exit 1; }

    python3 -c "import json,sys; d=json.load(sys.stdin); print(d['sid']); print(d['secret'])" <<< "$response"
}

# ── Production vault ──────────────────────────────────────────────────
echo ""
echo "Checking production vault..."
EXISTING_SID=$(get_yaml_key "$PROD_VAULT" "vault_twilio_api_key_sid")

if [ -n "$EXISTING_SID" ]; then
    echo "  ✓ Production key already set ($EXISTING_SID) — skipping"
else
    echo "  Creating production API key (production-germinal-app)..."
    read -r PROD_SID PROD_SECRET < <(create_twilio_key "production-germinal-app")
    set_yaml_keys "$PROD_VAULT" \
        "vault_twilio_account_sid=$ACCOUNT_SID" \
        "vault_twilio_api_key_sid=$PROD_SID" \
        "vault_twilio_api_key_secret=$PROD_SECRET"
    echo "  ✓ Production vault updated (key: $PROD_SID)"
fi

# ── Staging vault ─────────────────────────────────────────────────────
echo "Checking staging vault..."
EXISTING_STAGING_SID=$(get_yaml_key "$STAGING_VAULT" "vault_staging_twilio_api_key_sid")

if [ -n "$EXISTING_STAGING_SID" ]; then
    echo "  ✓ Staging key already set ($EXISTING_STAGING_SID) — skipping"
else
    echo "  Creating staging API key (staging-germinal-app)..."
    read -r STAGING_SID STAGING_SECRET < <(create_twilio_key "staging-germinal-app")
    set_yaml_keys "$STAGING_VAULT" \
        "vault_staging_twilio_account_sid=$ACCOUNT_SID" \
        "vault_staging_twilio_api_key_sid=$STAGING_SID" \
        "vault_staging_twilio_api_key_secret=$STAGING_SECRET"
    echo "  ✓ Staging vault updated (key: $STAGING_SID)"
fi

echo ""
echo "✅  Done. Run 'make deploy' and 'make deploy-staging' in infrastructure/ansible to apply."
