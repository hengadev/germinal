# Germinal VPS Deployment Makefile
# Usage: make <target>

# Docker image configuration - set your Docker Hub username here
DOCKER_USER ?= henga
DOCKER_IMAGE ?= $(DOCKER_USER)/germinal:latest

.PHONY: help pull \
        prod-start prod-stop prod-restart prod-logs prod-shell prod-migrate prod-create-admin \
        dev-start dev-stop dev-restart dev-logs dev-shell dev-mock \
        image-build image-push image-pull \
        status ps clean prune \
        infra-info infra-apply infra-plan infra-destroy \
        server-info server-ssh server-rebuild \
        db-backup db-backup-now db-restore \
        s3-list s3-sync s3-size \
        dns-info dns-verify

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
	@echo "Local Development (run dev.sh with mock data):"
	@echo "  make dev-mock      - Start local dev with mock data"
	@echo ""
	@echo "Maintenance:"
	@echo "  make clean         - Stop all and remove containers"
	@echo "  make prune         - Remove unused Docker resources"
	@echo ""
	@echo "Quick workflows:"
	@echo "  make deploy        - Pull image and restart production"
	@echo "  make deploy-dev    - Pull image and restart development"
	@echo ""
	@echo "Infrastructure (terraform/):"
	@echo "  make infra-info    - Show all infrastructure info (server, DNS, credentials)"
	@echo "  make infra-plan    - Show terraform plan"
	@echo "  make infra-apply   - Apply terraform changes"
	@echo "  make infra-destroy - Destroy all terraform resources"
	@echo ""
	@echo "Server:"
	@echo "  make server-info   - Show VPS connection details"
	@echo "  make server-ssh    - SSH into the VPS"
	@echo "  make server-rebuild - Rebuild VPS via terraform"
	@echo ""
	@echo "Database Backups (S3):"
	@echo "  make db-backup-now - Create immediate database backup"
	@echo "  make db-restore    - Restore database from S3 backup"
	@echo "  make db-list       - List available backups in S3"
	@echo ""
	@echo "S3 Storage:"
	@echo "  make s3-list       - List S3 media bucket contents"
	@echo "  make s3-sync       - Sync local media to S3"
	@echo "  make s3-size       - Show S3 bucket size"
	@echo ""
	@echo "DNS:"
	@echo "  make dns-info      - Show DNS configuration"
	@echo "  make dns-verify    - Verify DNS propagation"
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
# Local Development Commands (run dev.sh directly)
# ===========================================

dev-mock:
	@echo "Starting local development with mock data..."
	MOCK_ADMIN_EMAIL=admin@local.dev MOCK_ADMIN_PASSWORD=password123 ./dev.sh

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

# ===========================================
# Infrastructure Commands (terraform/)
# ===========================================

INFRA_DIR = infrastructure/terraform

# Show all infrastructure info
infra-info:
	@echo "==========================================="
	@echo "Infrastructure Overview"
	@echo "==========================================="
	@echo ""
	@if [ -d "$(INFRA_DIR)" ]; then \
		cd $(INFRA_DIR) && \
		echo "--- Server ---" && \
		terraform output -raw server_name 2>/dev/null || echo "N/A" && \
		terraform output -raw server_ipv4_address 2>/dev/null || echo "N/A" && \
		echo "" && \
		echo "--- DNS ---" && \
		terraform output -raw app_url 2>/dev/null || echo "N/A" && \
		echo "" && \
		echo "--- S3 Media Bucket ---" && \
		terraform output -raw media_bucket_name 2>/dev/null || echo "N/A" && \
		echo "" && \
		echo "--- S3 Backup Bucket ---" && \
		terraform output -raw backup_bucket_name 2>/dev/null || echo "N/A"; \
	else \
		echo "Infrastructure directory not found: $(INFRA_DIR)"; \
	fi
	@echo "==========================================="

# Terraform plan
infra-plan:
	@if [ -d "$(INFRA_DIR)" ]; then \
		cd $(INFRA_DIR) && terraform plan; \
	else \
		echo "Infrastructure directory not found: $(INFRA_DIR)"; \
	fi

# Terraform apply
infra-apply:
	@if [ -d "$(INFRA_DIR)" ]; then \
		cd $(INFRA_DIR) && terraform apply; \
	else \
		echo "Infrastructure directory not found: $(INFRA_DIR)"; \
	fi

# Terraform destroy
infra-destroy:
	@if [ -d "$(INFRA_DIR)" ]; then \
		cd $(INFRA_DIR) && terraform destroy; \
	else \
		echo "Infrastructure directory not found: $(INFRA_DIR)"; \
	fi

# ===========================================
# Server Commands
# ===========================================

# Show server connection details
server-info:
	@if [ -d "$(INFRA_DIR)" ]; then \
		cd $(INFRA_DIR) && make server-info; \
	else \
		echo "Infrastructure directory not found: $(INFRA_DIR)"; \
	fi

# SSH into the server
server-ssh:
	@if [ -d "$(INFRA_DIR)" ]; then \
		cd $(INFRA_DIR) && make server-ssh; \
	else \
		echo "Infrastructure directory not found: $(INFRA_DIR)"; \
	fi

# Rebuild server via terraform
server-rebuild:
	@echo "Rebuilding VPS via Terraform..."
	@if [ -d "$(INFRA_DIR)" ]; then \
		cd $(INFRA_DIR) && \
		terraform apply -replace=hcloud_server.main; \
	else \
		echo "Infrastructure directory not found: $(INFRA_DIR)"; \
	fi

# ===========================================
# Database Backup Commands (S3)
# ===========================================

# Create immediate database backup
db-backup-now:
	@echo "Creating immediate database backup..."
	@if [ -f "scripts/backup-db.sh" ]; then \
		BACKUP_TYPE=onetime ./scripts/backup-db.sh; \
	else \
		echo "Backup script not found: scripts/backup-db.sh"; \
		echo "Create it from the terraform README example"; \
	fi

# List available backups in S3
db-list:
	@echo "Listing database backups in S3..."
	@if [ -d "$(INFRA_DIR)" ]; then \
		BUCKET=$$(cd $(INFRA_DIR) && terraform output -raw backup_bucket_name 2>/dev/null); \
		if [ -n "$$BUCKET" ]; then \
			aws s3 ls s3://$$BUCKET/ --recursive --human-readable; \
		else \
			echo "Could not determine backup bucket name"; \
		fi \
	else \
		echo "Infrastructure directory not found: $(INFRA_DIR)"; \
	fi

# Restore database from S3 backup
db-restore:
	@echo "Restoring database from S3 backup..."
	@echo "Usage: make db-restore BACKUP=s3://bucket/path/to/backup.sql.gz"
	@if [ -z "$(BACKUP)" ]; then \
		echo "Error: Please specify BACKUP parameter"; \
		echo "Example: make db-restore BACKUP=s3://my-backup-bucket/daily/backup.sql.gz"; \
		exit 1; \
	fi
	@echo "Downloading and restoring $(BACKUP)..."
	@aws s3 cp $(BACKUP) /tmp/restore-backup.sql.gz && \
		gunzip -c /tmp/restore-backup.sql.gz | docker exec -i $$(docker ps -q -f "name=germinal.*db") psql -U germinal -d germinal_prod && \
		rm /tmp/restore-backup.sql.gz && \
		echo "Database restored successfully"

# ===========================================
# S3 Storage Commands
# ===========================================

# List S3 media bucket contents
s3-list:
	@echo "Listing S3 media bucket contents..."
	@if [ -d "$(INFRA_DIR)" ]; then \
		BUCKET=$$(cd $(INFRA_DIR) && terraform output -raw media_bucket_name 2>/dev/null); \
		if [ -n "$$BUCKET" ]; then \
			aws s3 ls s3://$$BUCKET/ --recursive --human-readable | head -50; \
			echo "... (showing first 50 items)"; \
		else \
			echo "Could not determine media bucket name"; \
		fi \
	else \
		echo "Infrastructure directory not found: $(INFRA_DIR)"; \
	fi

# Sync local media to S3
s3-sync:
	@echo "Syncing local media to S3..."
	@if [ -d "$(INFRA_DIR)" ]; then \
		BUCKET=$$(cd $(INFRA_DIR) && terraform output -raw media_bucket_name 2>/dev/null); \
		if [ -n "$$BUCKET" ]; then \
			aws s3 sync uploads/ s3://$$BUCKET/ --delete; \
			echo "Sync completed"; \
		else \
			echo "Could not determine media bucket name"; \
		fi \
	else \
		echo "Infrastructure directory not found: $(INFRA_DIR)"; \
	fi

# Show S3 bucket size
s3-size:
	@echo "Calculating S3 bucket size..."
	@if [ -d "$(INFRA_DIR)" ]; then \
		BUCKET=$$(cd $(INFRA_DIR) && terraform output -raw media_bucket_name 2>/dev/null); \
		if [ -n "$$BUCKET" ]; then \
			aws s3 ls s3://$$BUCKET/ --recursive --summarize --human-readable; \
		else \
			echo "Could not determine media bucket name"; \
		fi \
	else \
		echo "Infrastructure directory not found: $(INFRA_DIR)"; \
	fi

# ===========================================
# DNS Commands
# ===========================================

# Show DNS configuration
dns-info:
	@if [ -d "$(INFRA_DIR)" ]; then \
		cd $(INFRA_DIR) && make dns-info; \
	else \
		echo "Infrastructure directory not found: $(INFRA_DIR)"; \
	fi

# Verify DNS propagation
dns-verify:
	@echo "Verifying DNS propagation..."
	@if [ -d "$(INFRA_DIR)" ]; then \
		DOMAIN=$$(cd $(INFRA_DIR) && terraform output -raw domain_name 2>/dev/null); \
		if [ -n "$$DOMAIN" ]; then \
			echo "Checking A record for $$DOMAIN..."; \
			dig +short $$DOMAIN A; \
			echo "Checking CNAME record for www.$$DOMAIN..."; \
			dig +short www.$$DOMAIN CNAME; \
		else \
			echo "Could not determine domain name"; \
		fi \
	else \
		echo "Infrastructure directory not found: $(INFRA_DIR)"; \
	fi
