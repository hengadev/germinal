# Germinal Makefile
# Usage: make <target>
#
# Developer targets only. Releases NEVER happen from a local machine:
# CI builds and deploys (.github/workflows) — a push to main deploys
# staging, and the Promote-to-production workflow ships the SHA staging
# is serving (see infrastructure/compose/README.md for 'deploy <stack> <sha>').

.PHONY: help pull \
        dev-mock dev-up dev-down dev-reset dev-migrate dev dev-logs studio try try-setup env

# Default target
help:
	@echo "Germinal Commands"
	@echo "================="
	@echo ""
	@echo "General:"
	@echo "  make pull               - Pull latest code (git pull --rebase)"
	@echo ""
	@echo "Releases (CI, not here):"
	@echo "  Pushes to main deploy staging; the Promote-to-production workflow"
	@echo "  (.github/workflows) ships the SHA staging is serving. Server-side"
	@echo "  entry point: deploy <stack> <sha> (infrastructure/compose/)."
	@echo ""
	@echo "Local Development (docker compose db+redis+minio, app runs natively for fast HMR):"
	@echo "  make try                - Zero-account run: cp .env.example .env, then seeded app + dev server"
	@echo "  make env                - Render .env from Infisical dev (invited contributors; needs infisical login)"
	@echo "  make dev                - Start db+redis+minio, migrate, then run the dev server (all-in-one)"
	@echo "  make dev-up             - Start db+redis+minio in the background (idempotent)"
	@echo "  make dev-down           - Stop db+redis+minio (keeps data)"
	@echo "  make dev-reset          - Stop db+redis+minio and WIPE their local data volumes"
	@echo "  make dev-migrate        - Apply schema to the local dev database"
	@echo "  make dev-logs           - Follow db+redis+minio container logs"
	@echo "  make studio             - Open Drizzle Studio (DB browser) at localhost:4983"
	@echo "  make dev-mock           - Start local dev server with mock data (no DB required)"
	@echo ""
	@echo "Tests run with pnpm: pnpm test, pnpm test:integration, pnpm test:e2e."

# ===========================================
# General Commands
# ===========================================

pull:
	@echo "Pulling latest code..."
	git pull --rebase

# ===========================================
# Local Development Commands
# ===========================================
#
# db+redis+minio run via docker-compose; the app runs natively (`pnpm dev`) for
# fast HMR — bind-mount HMR inside a container buys nothing on a single-dev
# machine and adds file-watch overhead. Leave them running in the
# background across sessions (restart: unless-stopped) rather than
# stopping/starting them each time; `make dev-up` is idempotent.

# minio-init is a one-shot (creates the media bucket) and `up --wait` fails
# on any exited container, even with code 0, so it gets its own `run`.
dev-up:
	@echo "Starting local db+redis+minio (waits until healthy)..."
	docker compose up -d --wait db redis minio
	docker compose run --rm minio-init

dev-down:
	@echo "Stopping local db+redis+minio (data preserved)..."
	docker compose down

dev-reset:
	@echo "Stopping local db+redis+minio and WIPING their data volumes..."
	docker compose down -v

# Same migration files and entry point as production and `make try`, so the
# local schema can't drift from what gets deployed.
dev-migrate: dev-up
	@echo "Applying migrations to local dev database..."
	node scripts/migrate.js

dev-logs:
	docker compose logs -f db redis minio

# All-in-one: ensure services are up and migrated, then run the dev server.
dev: dev-migrate
	pnpm dev

# Runs Drizzle Studio via pnpm on the host — pnpm is already required to
# run `pnpm dev`, so this starts instantly with no separate container.
studio: dev-up
	pnpm drizzle-kit studio --port 4983

dev-mock:
	@echo "Starting local development with mock data..."
	./dev.sh

# ===========================================
# "Try it" path (zero-account, see README)
# ===========================================
#
# The portfolio-visitor entry point: everything a fresh clone needs to see
# the app with seeded content, with no third-party account. Everything
# except the dev server lives in try-setup so CI can exercise the exact
# same path non-interactively (`make try-setup && pnpm build`).

try-setup:
	@test -f .env || { echo "No .env found. Run: cp .env.example .env"; exit 1; }
	@test -d node_modules || { echo "Installing dependencies..."; pnpm install; }
	@echo "Starting local db+redis+minio (Docker)..."
	docker compose up -d --wait db redis minio
	docker compose run --rm minio-init
	@echo "Applying migrations..."
	node scripts/migrate.js
	@echo "Creating demo admin (skipped if it already exists)..."
	node scripts/create-admin.js
	@echo "Seeding events, sessions and talents..."
	pnpm tsx scripts/seed.ts

try: try-setup
	@echo ""
	@echo "Germinal is starting at http://localhost:5173"
	@echo "  Public site: seeded events and talents"
	@echo "  Admin back-office: log in at /login with ADMIN_EMAIL/ADMIN_PASSWORD from .env"
	pnpm dev

# ===========================================
# Infisical env (invited contributors)
# ===========================================
#
# Renders .env from the team's Infisical dev environment using the SAME
# templates the server's Infisical Agent renders (issue 006), so local
# development can't differ from the server in how values are assembled.
# Requires the Infisical CLI and `infisical login`; an existing .env is
# backed up, never overwritten silently.
# See infrastructure/infisical/templates/README.md.

env:
	@sh infrastructure/infisical/make-env.sh
