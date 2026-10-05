#!/bin/sh
# Run Terraform with its secrets from Infisical (issue 012).
#
#   ./tf.sh plan            (or `make plan`)
#
# - `infisical run` injects the `germinal-infra` project's secrets: the
#   TF_VAR_* inputs and the AWS credentials used by the AWS provider and the
#   S3 state backend.
# - The Infisical provider (infisical.tf) authenticates with the operator's
#   own login: the session token from `infisical user get token` is handed to
#   it as INFISICAL_TOKEN. No machine identity is involved.
#
# Requires the Infisical CLI and `infisical login` (as a member of both the
# `germinal-infra` and `germinal` projects).
set -eu

infra_project_id=d9878ce5-172e-4ecd-b48f-9995520b99c6
infra_env=prod

die() {
	echo "tf.sh: $*" >&2
	exit 1
}

command -v infisical >/dev/null 2>&1 ||
	die "the Infisical CLI is not installed: https://infisical.com/docs/cli/overview"
command -v terraform >/dev/null 2>&1 || die "terraform is not installed"

token=$(infisical user get token --plain --silent 2>/dev/null) || token=
[ -n "$token" ] || die "no Infisical session. Run: infisical login"

cd "$(dirname -- "$0")"

# Passed under a neutral name so `infisical run` itself never treats it as
# its own INFISICAL_TOKEN; renamed for Terraform inside the child. Keeping it
# in the environment (not argv) keeps it out of `ps`.
GERMINAL_TF_INFISICAL_TOKEN=$token
export GERMINAL_TF_INFISICAL_TOKEN
unset token

# AWS_PROFILE is dropped so the germinal-infra credentials are the only ones
# Terraform can use, on every computer.
exec infisical run --projectId="$infra_project_id" --env="$infra_env" --path=/ --silent -- \
	sh -c 'INFISICAL_TOKEN=$GERMINAL_TF_INFISICAL_TOKEN
INFISICAL_AUTH_METHOD=token
export INFISICAL_TOKEN INFISICAL_AUTH_METHOD
unset GERMINAL_TF_INFISICAL_TOKEN AWS_PROFILE
exec terraform "$@"' terraform "$@"
