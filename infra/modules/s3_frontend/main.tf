# Agent: Vikram | Sprint: 01 | Date: 2026-03-16
# Terraform S3 Frontend Module — INFRAVIZ
#
# Resources created:
#   - S3 bucket for React static assets
#   - Bucket policy allowing CloudFront OAC read
#   - S3 versioning + KMS encryption
#   - Public access block (all blocked — served via CloudFront only)

terraform {
  required_version = ">= 1.7"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 5.0"
    }
  }
}

locals {
  name_prefix  = "infraviz-${var.environment}"
  bucket_name  = "${local.name_prefix}-frontend-${data.aws_caller_identity.current.account_id}"
}

data "aws_caller_identity" "current" {}

# ── S3 Bucket ─────────────────────────────────────────────────────────────────
resource "aws_s3_bucket" "frontend" {
  bucket        = local.bucket_name
  force_destroy = var.environment == "dev" ? true : false

  tags = {
    Name        = local.bucket_name
    Purpose     = "react-frontend-static"
    Environment = var.environment
    Owner       = "TeamPanchayat"
    CostCenter  = "ADLC-01"
    Project     = "INFRAVIZ"
  }
}

resource "aws_s3_bucket_versioning" "frontend" {
  bucket = aws_s3_bucket.frontend.id
  versioning_configuration { status = "Enabled" }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "frontend" {
  bucket = aws_s3_bucket.frontend.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "aws:kms"
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_public_access_block" "frontend" {
  bucket                  = aws_s3_bucket.frontend.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# ── Bucket Policy — CloudFront OAC Read ──────────────────────────────────────
resource "aws_s3_bucket_policy" "frontend" {
  bucket = aws_s3_bucket.frontend.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AllowCloudFrontOACRead"
        Effect = "Allow"
        Principal = {
          Service = "cloudfront.amazonaws.com"
        }
        Action   = "s3:GetObject"
        Resource = "${aws_s3_bucket.frontend.arn}/*"
        Condition = {
          StringEquals = {
            "AWS:SourceArn" = var.cloudfront_distribution_arn
          }
        }
      }
    ]
  })
}
