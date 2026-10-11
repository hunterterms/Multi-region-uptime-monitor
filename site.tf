resource "aws_s3_bucket" "site" {
  bucket_prefix = "uptime-status-site"
  force_destroy = true
}

//states that the buckeet can never be made public
resource "aws_s3_bucket_public_access_block" "site" {
  bucket                  = resource.aws_s3_bucket.site.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

//makes cloudfront sign its requests to s3
resource "aws_cloudfront_origin_access_control" "site" {
  name                              = "uptime-status-site"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

data "aws_cloudfront_cache_policy" "caching_optimised" {
  name = "Managed-CachingOptimized"
}

resource "aws_cloudfront_distribution" "site" {
  enabled             = true
  default_root_object = "index.html"

  //where the files come from
  origin {
    domain_name              = resource.aws_s3_bucket.site.bucket_regional_domain_name
    origin_access_control_id = resource.aws_cloudfront_origin_access_control.site.id
    origin_id                = "site"
  }

  //where /api/status comes from
  origin {
    domain_name = trimprefix(resource.aws_apigatewayv2_api.status.api_endpoint, "https://")
    origin_id   = "api"

    custom_origin_config {
      https_port             = 443
      http_port              = 80
      origin_protocol_policy = "https-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }

  //requests which are NOT /api/
  default_cache_behavior {
    cached_methods         = ["GET", "HEAD"]
    allowed_methods        = ["GET", "HEAD"]
    target_origin_id       = "site"
    viewer_protocol_policy = "redirect-to-https"
    cache_policy_id        = data.aws_cloudfront_cache_policy.caching_optimised.id
    compress               = true
  }

  //requests starting with /api/ go to API Gateway
  ordered_cache_behavior {
    cached_methods         = ["GET", "HEAD"]
    allowed_methods        = ["GET", "HEAD"]
    target_origin_id       = "api"
    viewer_protocol_policy = "redirect-to-https"
    cache_policy_id        = data.aws_cloudfront_cache_policy.caching_optimised.id
    compress               = true
    path_pattern           = "/api/*"
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = true
  }
}

//let the cloudfron distribution read the s3 bucket, and nothing else
resource "aws_s3_bucket_policy" "site" {
  bucket = resource.aws_s3_bucket.site.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect    = "Allow"
        Principal = { Service = "cloudfront.amazonaws.com" }
        Action    = "s3:GetObject"
        Resource  = "${aws_s3_bucket.site.arn}/*"
        Condition = { StringEquals = { "AWS:SourceArn" = aws_cloudfront_distribution.site.arn } }
      },
    ]
  })
}

output "site_url" {
  value = "https://${aws_cloudfront_distribution.site.domain_name}"
}

output "site_bucket" {
  value = resource.aws_s3_bucket.site.id
}

output "site_distribution_id" {
  value = resource.aws_cloudfront_distribution.site.id
}
