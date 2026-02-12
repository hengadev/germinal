# Hetzner Cloud Resources for Germinal
# This file defines the VPS server and related resources

# Reference existing SSH key from Hetzner console
data "hcloud_ssh_key" "default" {
  name = "terraform-germinal"
}

# Main VPS server
resource "hcloud_server" "main" {
  name        = var.project_name
  image       = var.server_image
  server_type = var.server_type
  location    = var.server_location
  ssh_keys    = [data.hcloud_ssh_key.default.id]

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
  user_data = file("${path.module}/cloud-init.yml.tftpl")

  # Don't destroy server if it has important data
  lifecycle {
    prevent_destroy = false
    # Set to true in production to prevent accidental deletion
    # prevent_destroy = true
  }
}
