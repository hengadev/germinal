#!/bin/sh
# Substitute the __GERMINAL_ENV__ placeholder in an Agent env template with
# a concrete Infisical environment slug, writing the per-environment copy to
# stdout.
#
# The template engine (Infisical Agent and `infisical export --template`)
# has no env function (issue 005), so each template keeps ONE source with
# the placeholder: `make env` renders dev here, and the Ansible role
# (issue 008) installs substituted copies for staging and prod on the
# server — always from this same file.
#
# Usage: render-template.sh <template-file> <environment-slug>
set -eu

if [ "$#" -ne 2 ]; then
	echo "usage: $0 <template-file> <environment-slug>" >&2
	exit 2
fi

template=$1
env_slug=$2

if [ ! -f "$template" ]; then
	echo "render-template: template not found: $template" >&2
	exit 1
fi

# Environment slugs are slugs; validating keeps the sed replacement literal.
if ! printf '%s' "$env_slug" | grep -Eq '^[a-z0-9][a-z0-9-]*$'; then
	echo "render-template: invalid environment slug: $env_slug" >&2
	exit 1
fi

sed "s/__GERMINAL_ENV__/$env_slug/g" "$template"
