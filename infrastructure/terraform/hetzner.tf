# Hetzner Cloud Resources for Germinal
# This file defines the VPS server and related resources

# SSH Key for server access
resource "hcloud_ssh_key" "default" {
  name       = "${var.project_name}-${var.environment}-key"
  public_key = var.ssh_public_key

  labels = {
    project     = var.project_name
    environment = var.environment
  }
}

# Main VPS server
resource "hcloud_server" "main" {
  name        = "${var.environment}-${var.project_name}"
  image       = var.server_image
  server_type = var.server_type
  location    = var.server_location
  ssh_keys    = [hcloud_ssh_key.default.id]

  # Enable automatic backups
  backups = true

  # Disable firewall (manage with ufw inside the server if needed)
  firewall_ids = []

  labels = {
    project     = var.project_name
    environment = var.environment
    managed_by  = "terraform"
  }

  # User data for initial server setup
  user_data = templatefile("${path.module}/cloud-init.yml.tftpl", {
    docker_compose_version = "2.24.0"
    project_name           = var.project_name
  })

  # Don't destroy server if it has important data
  lifecycle {
    prevent_destroy = false
    # Set to true in production to prevent accidental deletion
    # prevent_destroy = true
  }
}
