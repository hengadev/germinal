#!/bin/sh
# `make env` — render the local .env from the team's Infisical dev
# environment (issue 006).
#
# Renders the SAME templates the server's Infisical Agent renders: app.env
# (every folder the app container receives, plus DATABASE_URL assembled from
# /db) followed by admin.env, so local development runs the same admin
# bootstrap the server runs. Nothing is invented locally, so local and
# server environments cannot drift apart.
#
# Requires the Infisical CLI and a logged-in session (`infisical login`).
# An existing .env is backed up to .env.backup-<timestamp>, never
# overwritten silently.
set -eu

repo_root=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
project_id=78c404c2-a76c-4967-8ff0-e7544f1b6fff
env_slug=dev
templates="$repo_root/infrastructure/infisical/templates"

die() {
	echo "make env: $*" >&2
	exit 1
}

if ! command -v infisical >/dev/null 2>&1; then
	die "the Infisical CLI is not installed.
  Install it first: https://infisical.com/docs/cli/overview"
fi

[ -f "$templates/app.env.tmpl" ] || die "template not found: $templates/app.env.tmpl"
[ -f "$templates/admin.env.tmpl" ] || die "template not found: $templates/admin.env.tmpl"

# Substituted copies never touch the repo; the trap also covers failures.
work=$(mktemp -d "${TMPDIR:-/tmp}/germinal-env.XXXXXX")
trap 'rm -rf "$work"' EXIT INT TERM

# The CLI exits non-zero on auth and template errors, but a rendered file
# that is missing its backbone means something went wrong too — so the
# output is sanity-checked before it replaces anything.
render() { # <template> <output-file>
	template=$1
	output=$2
	"$repo_root/infrastructure/infisical/render-template.sh" "$template" "$env_slug" \
		> "$work/template"
	infisical export --template="$work/template" \
		--projectId="$project_id" --env="$env_slug" --silent > "$output" || return 1
}

umask 077
if ! render "$templates/app.env.tmpl" "$work/.env"; then
	die "rendering app.env from Infisical '$env_slug' failed.
  If you have not logged in yet, run: infisical login"
fi
if ! render "$templates/admin.env.tmpl" "$work/admin.part"; then
	die "rendering admin.env from Infisical '$env_slug' failed.
  If you have not logged in yet, run: infisical login"
fi
cat "$work/admin.part" >> "$work/.env"

grep -q '^DATABASE_URL=postgresql://' "$work/.env" \
	|| die "rendered output has no DATABASE_URL — refusing to write .env"
grep -q '^ADMIN_EMAIL=' "$work/.env" \
	|| die "rendered output has no ADMIN_EMAIL — refusing to write .env"

cd "$repo_root"
if [ -f .env ]; then
	backup=".env.backup-$(date -u +%Y%m%dT%H%M%SZ)"
	cp .env "$backup"
	echo "make env: existing .env backed up to $backup"
fi
mv "$work/.env" .env

echo "make env: wrote .env from Infisical '$env_slug'"
echo "  make dev     — start db+redis, migrate, run the dev server"
echo "  node scripts/create-admin.js — create the dev admin account"
