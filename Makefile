# Germinal VPS Deployment Makefile
# Usage: make <target>

# Docker image configuration - set your Docker Hub username here
DOCKER_USER ?= henga
DOCKER_IMAGE ?= $(DOCKER_USER)/germinal:latest

.PHONY: help pull \
        prod-start prod-stop prod-restart prod-logs prod-shell prod-migrate prod-create-admin \
        dev-start dev-stop dev-restart dev-logs dev-shell \
        image-build image-push image-pull \
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
	@echo "Docker Image (run on local machine):"
	@echo "  make image-build   - Build production image locally"
	@echo "  make image-push    - Push image to Docker Hub"
	@echo "  make image-pull    - Pull image from Docker Hub (run on VPS)"
	@echo ""
	@echo "Production (port 4100):"
	@echo "  make prod-start    - Start production"
	@echo "  make prod-stop     - Stop production"
	@echo "  make prod-restart  - Restart production"
	@echo "  make prod-logs     - Follow production logs"
	@echo "  make prod-shell    - Open shell in production container"
	@echo "  make prod-migrate  - Run database migrations"
	@echo "  make prod-create-admin - Create admin user"
	@echo ""
	@echo "Development (port 4101, uses mock data):"
	@echo "  make dev-start     - Start development"
	@echo "  make dev-stop      - Stop development"
	@echo "  make dev-restart   - Restart development"
	@echo "  make dev-logs      - Follow development logs"
	@echo "  make dev-shell     - Open shell in dev container"
	@echo ""
	@echo "Maintenance:"
	@echo "  make clean         - Stop all and remove containers"
	@echo "  make prune         - Remove unused Docker resources"
	@echo ""
	@echo "Quick workflows:"
	@echo "  make deploy        - Pull image and restart production"
	@echo "  make deploy-dev    - Pull image and restart development"
	@echo ""
	@echo "Current image: $(DOCKER_IMAGE)"

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
# Docker Image Commands (run on local machine)
# ===========================================

image-build:
	@echo "Building production image..."
	docker build -t $(DOCKER_IMAGE) -f Dockerfile .
	@echo "Image built: $(DOCKER_IMAGE)"

image-push:
	@echo "Pushing image to Docker Hub..."
	docker push $(DOCKER_IMAGE)
	@echo "Image pushed: $(DOCKER_IMAGE)"

image-pull:
	@echo "Pulling image from Docker Hub..."
	docker pull $(DOCKER_IMAGE)
	@echo "Image pulled: $(DOCKER_IMAGE)"

# Build and push in one command (run on local machine)
image-release: image-build image-push
	@echo "Image built and pushed: $(DOCKER_IMAGE)"

# ===========================================
# Production Commands
# ===========================================

prod-start:
	@echo "Starting production..."
	DOCKER_IMAGE=$(DOCKER_IMAGE) docker compose -f docker-compose.prod.yml up -d

prod-stop:
	@echo "Stopping production..."
	docker compose -f docker-compose.prod.yml down

prod-restart: prod-stop prod-start
	@echo "Production restarted."

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
# Development Commands (VPS with mock data)
# ===========================================

dev-start:
	@echo "Starting development with mock data..."
	DOCKER_IMAGE=$(DOCKER_IMAGE) docker compose -f docker-compose.dev.yml up -d

dev-stop:
	@echo "Stopping development..."
	docker compose -f docker-compose.dev.yml down

dev-restart: dev-stop dev-start
	@echo "Development restarted."

dev-logs:
	docker compose -f docker-compose.dev.yml logs -f

dev-shell:
	docker compose -f docker-compose.dev.yml exec app sh

# ===========================================
# Quick Workflows
# ===========================================

# Deploy: pull image and restart (run on VPS)
deploy: image-pull prod-restart
	@echo "Production deployed."

deploy-dev: image-pull dev-restart
	@echo "Development deployed."

# Full release from local machine
release: image-release
	@echo "Image released. Run 'make deploy' on VPS to update."

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
