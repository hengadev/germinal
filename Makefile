# Germinal VPS Deployment Makefile
# Usage: make <target>

.PHONY: help pull \
        prod-start prod-stop prod-restart prod-logs prod-build prod-shell prod-migrate prod-create-admin \
        dev-start dev-stop dev-restart dev-logs dev-build dev-shell \
        status ps clean prune

# Default target
help:
	@echo "Germinal VPS Deployment Commands"
	@echo "================================"
	@echo ""
	@echo "General:"
	@echo "  make pull          - Pull latest code (git pull --rebase)"
	@echo "  make status        - Show status of all containers"
	@echo "  make ps            - Alias for status"
	@echo ""
	@echo "Production (port 4100):"
	@echo "  make prod-start    - Start production (build if needed)"
	@echo "  make prod-stop     - Stop production"
	@echo "  make prod-restart  - Restart production"
	@echo "  make prod-build    - Rebuild and start production"
	@echo "  make prod-logs     - Follow production logs"
	@echo "  make prod-shell    - Open shell in production container"
	@echo "  make prod-migrate  - Run database migrations"
	@echo "  make prod-create-admin - Create admin user"
	@echo ""
	@echo "Development (port 4101):"
	@echo "  make dev-start     - Start development"
	@echo "  make dev-stop      - Stop development"
	@echo "  make dev-restart   - Restart development"
	@echo "  make dev-build     - Rebuild and start development"
	@echo "  make dev-logs      - Follow development logs"
	@echo "  make dev-shell     - Open shell in dev container"
	@echo ""
	@echo "Maintenance:"
	@echo "  make clean         - Stop all and remove containers"
	@echo "  make prune         - Remove unused Docker resources"
	@echo ""
	@echo "Quick workflows:"
	@echo "  make update-prod   - Pull code and rebuild production"
	@echo "  make update-dev    - Pull code and rebuild development"

# ===========================================
# General Commands
# ===========================================

pull:
	@echo "Pulling latest code..."
	git pull --rebase

status:
	@echo "Container status:"
	@docker ps -a --filter "name=germinal" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

ps: status

# ===========================================
# Production Commands
# ===========================================

prod-start:
	@echo "Starting production..."
	docker compose -f docker-compose.prod.yml up -d

prod-stop:
	@echo "Stopping production..."
	docker compose -f docker-compose.prod.yml down

prod-restart: prod-stop prod-start
	@echo "Production restarted."

prod-build:
	@echo "Building and starting production..."
	docker compose -f docker-compose.prod.yml up -d --build

prod-logs:
	docker compose -f docker-compose.prod.yml logs -f

prod-logs-app:
	docker compose -f docker-compose.prod.yml logs -f app

prod-logs-db:
	docker compose -f docker-compose.prod.yml logs -f db

prod-shell:
	docker compose -f docker-compose.prod.yml exec app sh

prod-migrate:
	@echo "Running production migrations..."
	docker compose -f docker-compose.prod.yml exec app npx drizzle-kit push

prod-create-admin:
	@echo "Creating admin user..."
	docker compose -f docker-compose.prod.yml exec app npx tsx scripts/create-admin.ts

prod-db-shell:
	docker compose -f docker-compose.prod.yml exec db psql -U germinal -d germinal_prod

# ===========================================
# Development Commands
# ===========================================

dev-start:
	@echo "Starting development..."
	docker compose -f docker-compose.dev.yml up -d

dev-stop:
	@echo "Stopping development..."
	docker compose -f docker-compose.dev.yml down

dev-restart: dev-stop dev-start
	@echo "Development restarted."

dev-build:
	@echo "Building and starting development..."
	docker compose -f docker-compose.dev.yml up -d --build

dev-logs:
	docker compose -f docker-compose.dev.yml logs -f

dev-shell:
	docker compose -f docker-compose.dev.yml exec app sh

# ===========================================
# Quick Workflows
# ===========================================

update-prod: pull prod-build
	@echo "Production updated and rebuilt."

update-dev: pull dev-build
	@echo "Development updated and rebuilt."

deploy: update-prod prod-migrate
	@echo "Deployed: code pulled, rebuilt, and migrated."

# ===========================================
# Maintenance Commands
# ===========================================

clean:
	@echo "Stopping and removing all Germinal containers..."
	-docker compose -f docker-compose.prod.yml down --remove-orphans
	-docker compose -f docker-compose.dev.yml down --remove-orphans

prune:
	@echo "Removing unused Docker resources..."
	docker system prune -f

# Remove everything including volumes (DANGEROUS)
clean-all: clean
	@echo "WARNING: This will delete all data including databases!"
	@read -p "Are you sure? [y/N] " confirm && [ "$$confirm" = "y" ] || exit 1
	docker compose -f docker-compose.prod.yml down -v
	docker compose -f docker-compose.dev.yml down -v
	@echo "All containers and volumes removed."
