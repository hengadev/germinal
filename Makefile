# Germinal VPS Deployment Makefile
# Usage: make <target>

# Docker image configuration - set your Docker Hub username here
DOCKER_USER ?= henga
DOCKER_IMAGE ?= $(DOCKER_USER)/germinal:latest
DOCKER_IMAGE_STAGING ?= $(DOCKER_USER)/germinal:staging

# VPS connection - resolved from Terraform output, falls back to known IP
VPS_IP ?= $(shell cd infrastructure/terraform && terraform output -raw server_ipv4_address 2>/dev/null || echo "46.225.25.238")
VPS_USER ?= germinal
VPS_SSH = ssh -i ~/.ssh/germinal $(VPS_USER)@$(VPS_IP)

# App directories on the VPS
PROD_DIR = /opt/germinal
STAGING_DIR = /opt/germinal-staging

.PHONY: help pull \
        prod-start prod-stop prod-restart prod-logs prod-logs-app prod-shell prod-migrate prod-create-admin prod-db-shell \
        staging-start staging-stop staging-restart staging-logs staging-shell staging-migrate staging-create-admin \
        dev-mock \
        image-build image-push image-pull image-release \
        image-build-staging image-push-staging image-release-staging \
        deploy deploy-staging release \
        status ps clean prune clean-all \
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
	@echo "  make pull               - Pull latest code (git pull --rebase)"
	@echo "  make status             - Show status of all containers (prod + staging)"
	@echo "  make ps                 - Alias for status"
	@echo ""
	@echo "Docker Image (local machine):"
	@echo "  make image-build        - Build production image locally (:latest)"
	@echo "  make image-push         - Push production image to Docker Hub"
	@echo "  make image-release      - Build and push production image in one step"
	@echo "  make image-build-staging   - Build staging image locally (:staging)"
	@echo "  make image-push-staging    - Push staging image to Docker Hub"
	@echo "  make image-release-staging - Build and push staging image in one step"
	@echo ""
	@echo "Production (germinalstudio.co):"
	@echo "  make prod-start         - Start production stack on VPS"
	@echo "  make prod-stop          - Stop production stack on VPS"
	@echo "  make prod-restart       - Restart production stack on VPS"
	@echo "  make prod-logs          - Follow production logs"
	@echo "  make prod-shell         - Open shell in production app container"
	@echo "  make prod-migrate       - Run database migrations (prod)"
	@echo "  make prod-create-admin  - Create admin user (prod)"
	@echo ""
	@echo "Staging (staging.germinalstudio.co):"
	@echo "  make staging-start      - Start staging app on VPS"
	@echo "  make staging-stop       - Stop staging app on VPS"
	@echo "  make staging-restart    - Restart staging app on VPS"
	@echo "  make staging-logs       - Follow staging logs"
	@echo "  make staging-shell      - Open shell in staging app container"
	@echo "  make staging-migrate    - Run database migrations (staging)"
	@echo "  make staging-create-admin - Create admin user (staging)"
	@echo ""
	@echo "Local Development:"
	@echo "  make dev-mock           - Start local dev server with mock data"
	@echo ""
	@echo "Quick workflows:"
	@echo "  make release            - Build and push production image (then deploy from VPS)"
	@echo "  make deploy             - Pull :latest and restart production on VPS"
	@echo "  make deploy-staging     - Pull :staging and restart staging on VPS"
	@echo ""
	@echo "Maintenance:"
	@echo "  make clean              - Stop and remove all Germinal containers"
	@echo "  make prune              - Remove unused Docker resources on VPS"
	@echo ""
	@echo "Infrastructure (terraform/):"
	@echo "  make infra-info         - Show infrastructure info"
	@echo "  make infra-plan         - Show terraform plan"
	@echo "  make infra-apply        - Apply terraform changes"
	@echo "  make infra-destroy      - Destroy all terraform resources"
	@echo ""
	@echo "Server:"
	@echo "  make server-info        - Show VPS connection details"
	@echo "  make server-ssh         - SSH into the VPS"
	@echo "  make server-rebuild     - Rebuild VPS via terraform"
	@echo ""
	@echo "Database Backups (S3):"
	@echo "  make db-backup-now      - Create immediate database backup"
	@echo "  make db-restore         - Restore database from S3 backup"
	@echo "  make db-list            - List available backups in S3"
	@echo ""
	@echo "S3 Storage:"
	@echo "  make s3-list            - List S3 media bucket contents"
	@echo "  make s3-sync            - Sync local media to S3"
	@echo "  make s3-size            - Show S3 bucket size"
	@echo ""
	@echo "DNS:"
	@echo "  make dns-info           - Show DNS configuration"
	@echo "  make dns-verify         - Verify DNS propagation"
	@echo ""
	@echo "VPS: $(VPS_USER)@$(VPS_IP)"
	@echo "Production image: $(DOCKER_IMAGE)"
	@echo "Staging image:    $(DOCKER_IMAGE_STAGING)"

# ===========================================
# General Commands
# ===========================================

pull:
	@echo "Pulling latest code..."
	git pull --rebase

status:
	@echo "Container status on VPS:"
	$(VPS_SSH) "docker ps -a --filter 'name=germinal' --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'"

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
	@echo "Pulling image on VPS..."
	$(VPS_SSH) "docker pull $(DOCKER_IMAGE)"
	@echo "Image pulled: $(DOCKER_IMAGE)"

# Build and push in one command (run on local machine)
image-release: image-build image-push
	@echo "Image built and pushed: $(DOCKER_IMAGE)"

image-build-staging:
	@echo "Building staging image..."
	docker build -t $(DOCKER_IMAGE_STAGING) -f Dockerfile .
	@echo "Image built: $(DOCKER_IMAGE_STAGING)"

image-push-staging:
	@echo "Pushing staging image to Docker Hub..."
	docker push $(DOCKER_IMAGE_STAGING)
	@echo "Image pushed: $(DOCKER_IMAGE_STAGING)"

# Build and push staging in one command (run on local machine)
image-release-staging: image-build-staging image-push-staging
	@echo "Staging image built and pushed: $(DOCKER_IMAGE_STAGING)"

# ===========================================
# Production Commands (VPS)
# ===========================================

prod-start:
	@echo "Starting production on VPS..."
	$(VPS_SSH) "cd $(PROD_DIR) && DOCKER_IMAGE=$(DOCKER_IMAGE) docker compose up -d"

prod-stop:
	@echo "Stopping production on VPS..."
	$(VPS_SSH) "cd $(PROD_DIR) && docker compose down"

prod-restart:
	@echo "Restarting production on VPS..."
	$(VPS_SSH) "cd $(PROD_DIR) && docker compose down && DOCKER_IMAGE=$(DOCKER_IMAGE) docker compose up -d"

prod-logs:
	$(VPS_SSH) "cd $(PROD_DIR) && docker compose logs -f"

prod-logs-app:
	$(VPS_SSH) "cd $(PROD_DIR) && docker compose logs -f app"

prod-logs-db:
	$(VPS_SSH) "cd $(PROD_DIR) && docker compose logs -f postgres"

prod-shell:
	$(VPS_SSH) -t "cd $(PROD_DIR) && docker compose exec app sh"

prod-migrate:
	@echo "Migrations run automatically on startup via hooks.server.ts."
	@echo "To force a manual run, restart the container: make prod-restart"

prod-create-admin:
	@echo "Creating admin user (production)..."
	$(VPS_SSH) "cd $(PROD_DIR) && docker compose exec app npx tsx scripts/create-admin.ts"

prod-db-shell:
	$(VPS_SSH) -t "cd $(PROD_DIR) && docker compose exec postgres psql -U germinal -d germinal"

# ===========================================
# Staging Commands (VPS)
# ===========================================

staging-start:
	@echo "Starting staging on VPS..."
	$(VPS_SSH) "cd $(STAGING_DIR) && DOCKER_IMAGE=$(DOCKER_IMAGE_STAGING) docker compose up -d"

staging-stop:
	@echo "Stopping staging on VPS..."
	$(VPS_SSH) "cd $(STAGING_DIR) && docker compose down"

staging-restart:
	@echo "Restarting staging on VPS..."
	$(VPS_SSH) "cd $(STAGING_DIR) && docker compose down && DOCKER_IMAGE=$(DOCKER_IMAGE_STAGING) docker compose up -d"

staging-logs:
	$(VPS_SSH) "cd $(STAGING_DIR) && docker compose logs -f"

staging-shell:
	$(VPS_SSH) -t "cd $(STAGING_DIR) && docker compose exec app sh"

staging-migrate:
	@echo "Migrations run automatically on startup via hooks.server.ts."
	@echo "To force a manual run, restart the container: make staging-restart"

staging-create-admin:
	@echo "Creating admin user (staging)..."
	$(VPS_SSH) "cd $(STAGING_DIR) && docker compose exec app npx tsx scripts/create-admin.ts"

# ===========================================
# Local Development Commands (run dev.sh directly)
# ===========================================

dev-mock:
	@echo "Starting local development with mock data..."
	./dev.sh

# ===========================================
# Quick Workflows
# ===========================================

# Pull image on VPS and restart production
deploy:
	@echo "Deploying production..."
	$(VPS_SSH) "docker pull $(DOCKER_IMAGE) && cd $(PROD_DIR) && docker compose up -d"
	@echo "Production deployed."

# Pull staging image on VPS and restart staging
deploy-staging:
	@echo "Deploying staging..."
	$(VPS_SSH) "docker pull $(DOCKER_IMAGE_STAGING) && cd $(STAGING_DIR) && DOCKER_IMAGE=$(DOCKER_IMAGE_STAGING) docker compose up -d"
	@echo "Staging deployed."

# Build and push image locally (then run make deploy / make deploy-staging on VPS)
release: image-release
	@echo "Image released. Run 'make deploy' or 'make deploy-staging' to update."

# ===========================================
# Maintenance Commands
# ===========================================

clean:
	@echo "Stopping and removing all Germinal containers on VPS..."
	-$(VPS_SSH) "cd $(PROD_DIR) && docker compose down --remove-orphans"
	-$(VPS_SSH) "cd $(STAGING_DIR) && docker compose down --remove-orphans"

prune:
	@echo "Removing unused Docker resources on VPS..."
	$(VPS_SSH) "docker system prune -f"

# Remove everything including volumes (DANGEROUS)
clean-all: clean
	@echo "WARNING: This will delete all data including databases!"
	@read -p "Are you sure? [y/N] " confirm && [ "$$confirm" = "y" ] || exit 1
	$(VPS_SSH) "cd $(PROD_DIR) && docker compose down -v"
	$(VPS_SSH) "cd $(STAGING_DIR) && docker compose down -v"
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
	$(VPS_SSH)

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
