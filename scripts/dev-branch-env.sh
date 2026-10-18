#!/bin/sh
# Prints the environment `make dev` / `make dev-migrate` / `make studio` run
# with, as `export` lines for eval. On main it prints nothing: the app uses
# DATABASE_URL from .env (the shared `germinal` dev DB).
#
# On any other branch it points DATABASE_URL at a database of that branch's
# own, germinal_br_<branch>, created on first use as a copy of `germinal`.
# The branch's migrations then run against real dev data without touching
# the DB main uses, so switching back to main never finds a schema it
# doesn't know. `make dev-db-reset` re-copies it, `make dev-db-prune` drops
# the copies of deleted branches.
#
# Also makes a fresh git worktree runnable: links .env from the main
# checkout and installs node_modules when missing.
#
# Everything except the export lines goes to stderr.
set -eu

PG="docker compose -p germinal exec -T db"
SOURCE_DB=germinal

log() { echo "[dev-branch] $*" >&2; }

main_checkout=$(git worktree list --porcelain | sed -n '1s/^worktree //p')
if [ ! -e .env ] && [ "$main_checkout" != "$(pwd)" ] && [ -f "$main_checkout/.env" ]; then
	log "linking .env from $main_checkout"
	ln -s "$main_checkout/.env" .env
fi
if [ ! -d node_modules ]; then
	log "installing dependencies"
	pnpm install >&2
fi

branch=$(git rev-parse --abbrev-ref HEAD)
if [ "$branch" = main ]; then
	exit 0
fi

# Postgres identifiers: lowercase, [a-z0-9_], at most 63 bytes.
slug=$(printf '%s' "$branch" | tr 'A-Z' 'a-z' | tr -c 'a-z0-9' '_' | cut -c1-48)
db="germinal_br_$slug"

base_url=${DATABASE_URL:-$(sed -n 's/^DATABASE_URL=//p' .env 2>/dev/null | tr -d "\"'")}
if [ -z "$base_url" ]; then
	log "no DATABASE_URL in the environment or .env"
	exit 1
fi

exists=$($PG psql -U postgres -tAc "select 1 from pg_database where datname = '$db'")
if [ "$exists" != 1 ]; then
	log "branch '$branch': creating $db as a copy of $SOURCE_DB"
	$PG createdb -U postgres "$db"
	# pg_dump rather than `createdb -T`: a template copy fails while main's
	# dev server holds a connection to the source DB.
	$PG sh -c "pg_dump -U postgres $SOURCE_DB | psql -q -U postgres -d $db" >/dev/null
else
	log "branch '$branch': using $db"
fi

echo "export DATABASE_URL='${base_url%/*}/$db'"
