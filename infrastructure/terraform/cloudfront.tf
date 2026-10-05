# CloudFront Distributions for Media Delivery
# One CDN per environment, each serving that environment's private media
# bucket through an Origin Access Control (OAC):
#   production  media.<domain>          -> production-germinal-media
#   staging     media-staging.<domain>  -> staging-germinal-media
# The app stores full media URLs (MEDIA_URL/<key>) at upload time, so an
# environment's media domain must not be repointed once it holds data.

# ============================================
# AWS Provider for us-east-1 (required for ACM)
# ============================================

provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"
}

# ============================================
# CloudFront Origin Access Control
# ============================================

resource "aws_cloudfront_origin_access_control" "media" {
  for_each                          = local.environments
  name                              = "${each.key}-${var.project_name}-media-oac"
  description                       = "OAC for ${var.project_name} media bucket"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# ============================================
# ACM Certificates (must be us-east-1 for CloudFront)
# ============================================

resource "aws_acm_certificate" "media" {
  for_each          = local.environments
  provider          = aws.us_east_1
  domain_name       = local.media_domains[each.key]
  validation_method = "DNS"

  tags = {
    Name        = "${var.project_name} Media Certificate"
    Environment = each.key
    ManagedBy   = "Terraform"
  }

  lifecycle {
    create_before_destroy = true
  }
}

# DNS validation via Cloudflare. Keyed by media domain (known at plan time,
# unlike a new certificate's validation options); each certificate has a
# single domain, so a single validation record.
resource "cloudflare_dns_record" "acm_validation" {
  for_each = { for env, domain in local.media_domains : domain => env }

  zone_id = var.cloudflare_zone_id
  name    = trimsuffix(one(aws_acm_certificate.media[each.value].domain_validation_options).resource_record_name, ".") # Cloudflare stores names without the trailing dot
  type    = one(aws_acm_certificate.media[each.value].domain_validation_options).resource_record_type
  content = trimsuffix(one(aws_acm_certificate.media[each.value].domain_validation_options).resource_record_value, ".")
  proxied = false
  ttl     = 60
}

resource "aws_acm_certificate_validation" "media" {
  for_each                = local.environments
  provider                = aws.us_east_1
  certificate_arn         = aws_acm_certificate.media[each.key].arn
  validation_record_fqdns = [for dvo in aws_acm_certificate.media[each.key].domain_validation_options : dvo.resource_record_name]
  depends_on              = [cloudflare_dns_record.acm_validation]
}

# ============================================
# CloudFront Distributions
# ============================================

resource "aws_cloudfront_distribution" "media" {
  for_each        = local.environments
  enabled         = true
  is_ipv6_enabled = true
  comment         = "${var.project_name} media distribution (${each.key})"
  aliases         = [local.media_domains[each.key]]
  price_class     = "PriceClass_100" # US, Canada, Europe only

  origin {
    domain_name              = aws_s3_bucket.media[each.key].bucket_regional_domain_name
    origin_id                = "S3Media"
    origin_access_control_id = aws_cloudfront_origin_access_control.media[each.key].id
  }

  default_cache_behavior {
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = "S3Media"
    viewer_protocol_policy = "redirect-to-https"
    compress               = true

    forwarded_values {
      query_string = false
      cookies {
        forward = "none"
      }
    }

    min_ttl     = 0
    default_ttl = 86400    # 1 day
    max_ttl     = 31536000 # 1 year
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    acm_certificate_arn      = aws_acm_certificate_validation.media[each.key].certificate_arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }

  tags = {
    Name        = "${var.project_name} Media CDN"
    Environment = each.key
    ManagedBy   = "Terraform"
  }
}
