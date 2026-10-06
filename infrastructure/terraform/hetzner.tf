# Hetzner Cloud Resources for Germinal
# This file defines the VPS server and related resources

# Reference existing SSH key from Hetzner console
data "hcloud_ssh_key" "default" {
  name = "terraform-germinal"
}

# Primary IPs, managed on their own so that replacing the server keeps its
# addresses: DNS and anything else pointing at the server stay valid across
# rebuilds. auto_delete = false and delete protection keep them when the
# server is destroyed.
resource "hcloud_primary_ip" "main" {
  for_each = toset(["ipv4", "ipv6"])

  name              = "${var.project_name}-${each.key}"
  type              = each.key
  location          = var.server_location
  auto_delete       = false
  delete_protection = true

  labels = {
    project    = var.project_name
    managed_by = "terraform"
  }

  lifecycle {
    prevent_destroy = true
  }
}

# Main VPS server (staging and production both run on it)
resource "hcloud_server" "main" {
  name        = var.project_name
  image       = var.server_image
  server_type = var.server_type
  location    = var.server_location
  ssh_keys    = [data.hcloud_ssh_key.default.id]

  # Enable automatic backups
  backups = var.enable_backups

  # Disable firewall (manage with ufw inside the server if needed)
  firewall_ids = []

  public_net {
    ipv4_enabled = true
    ipv4         = hcloud_primary_ip.main["ipv4"].id
    ipv6_enabled = true
    ipv6         = hcloud_primary_ip.main["ipv6"].id
  }

  labels = {
    project    = var.project_name
    managed_by = "terraform"
  }

  # User data for initial server setup
  user_data = file("${path.module}/cloud-init.yml.tftpl")

  # The server holds nothing that isn't rebuilt by Ansible + Infisical, so it
  # may be replaced (`terraform apply -replace=hcloud_server.main`); the
  # primary IPs above survive that.
  lifecycle {
    prevent_destroy = false
  }
}
