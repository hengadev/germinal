# CloudFront Distribution for Media Delivery
# This file configures CloudFront with OAC for secure S3 media access

# ============================================
# AWS Provider for us-east-1 (required for ACM)
# ============================================

provider "aws" {
  alias   = "us_east_1"
  region  = "us-east-1"
  profile = "terraform-germinal"
}

# ============================================
# CloudFront Origin Access Control
# ============================================

resource "aws_cloudfront_origin_access_control" "media" {
  name                              = "${var.environment}-${var.project_name}-media-oac"
  description                       = "OAC for ${var.project_name} media bucket"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# ============================================
# ACM Certificate (must be us-east-1 for CloudFront)
# ============================================

resource "aws_acm_certificate" "media" {
  provider          = aws.us_east_1
  domain_name       = "media.${var.domain_name}"
  validation_method = "DNS"

  tags = {
    Name        = "${var.project_name} Media Certificate"
    Environment = var.environment
    ManagedBy   = "Terraform"
  }

  lifecycle {
    create_before_destroy = true
  }
}

# DNS validation via CloudFlare
resource "cloudflare_dns_record" "acm_validation" {
  for_each = {
    for dvo in aws_acm_certificate.media.domain_validation_options : dvo.domain_name => {
      name   = dvo.resource_record_name
      record = dvo.resource_record_value
      type   = dvo.resource_record_type
    }
  }

  zone_id = var.cloudflare_zone_id
  name    = each.value.name
  type    = each.value.type
  content = trimsuffix(each.value.record, ".")
  proxied = false
  ttl     = 60
}

resource "aws_acm_certificate_validation" "media" {
  provider                = aws.us_east_1
  certificate_arn         = aws_acm_certificate.media.arn
  validation_record_fqdns = [for record in cloudflare_dns_record.acm_validation : record.name]
}

# ============================================
# CloudFront Distribution
# ============================================

resource "aws_cloudfront_distribution" "media" {
  enabled         = true
  is_ipv6_enabled = true
  comment         = "${var.project_name} media distribution (${var.environment})"
  aliases         = ["media.${var.domain_name}"]
  price_class     = "PriceClass_100" # US, Canada, Europe only

  origin {
    domain_name              = aws_s3_bucket.media.bucket_regional_domain_name
    origin_id                = "S3Media"
    origin_access_control_id = aws_cloudfront_origin_access_control.media.id
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
    acm_certificate_arn      = aws_acm_certificate.media.arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }

  tags = {
    Name        = "${var.project_name} Media CDN"
    Environment = var.environment
    ManagedBy   = "Terraform"
  }

  depends_on = [aws_acm_certificate_validation.media]
}
