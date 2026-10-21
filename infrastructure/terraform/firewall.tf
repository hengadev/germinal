# ============================================
# Hetzner Cloud firewall — the origin's real network boundary
# ============================================
#
# Every public hostname is proxied by Cloudflare, so HTTP/HTTPS may only come
# from Cloudflare's edges: a direct caller would bypass Cloudflare's WAF/DDoS
# protection and could spoof the CF-Connecting-IP header that Caddy trusts
# for the client IP (issue 012, PRD M1/M5). SSH comes only from the admin
# allowlist.
#
# UFW on the host stays as defence in depth, but it is not the boundary:
# ports Docker publishes (Caddy's 80/443) bypass UFW's INPUT rules, because
# Docker inserts its own iptables rules ahead of them. This firewall filters
# before traffic reaches the server at all.

resource "hcloud_firewall" "main" {
  name = "${var.project_name}-origin"

  rule {
    description = "HTTP from Cloudflare only"
    direction   = "in"
    protocol    = "tcp"
    port        = "80"
    source_ips  = concat(var.cloudflare_ipv4_ranges, var.cloudflare_ipv6_ranges)
  }

  rule {
    description = "HTTPS from Cloudflare only"
    direction   = "in"
    protocol    = "tcp"
    port        = "443"
    source_ips  = concat(var.cloudflare_ipv4_ranges, var.cloudflare_ipv6_ranges)
  }

  rule {
    description = "HTTP/3 from Cloudflare only"
    direction   = "in"
    protocol    = "udp"
    port        = "443"
    source_ips  = concat(var.cloudflare_ipv4_ranges, var.cloudflare_ipv6_ranges)
  }

  rule {
    description = "SSH from the admin allowlist only"
    direction   = "in"
    protocol    = "tcp"
    port        = tostring(var.ssh_port)
    source_ips  = var.ssh_allowed_ips
  }

  labels = {
    project    = var.project_name
    managed_by = "terraform"
  }
}
