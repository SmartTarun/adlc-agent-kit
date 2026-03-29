# Agent: vikram | Sprint: 01 | Date: 2026-03-16
# Terraform S3 Module — CBRE
#
# Resources created:
#   - S3 bucket for user Terraform state file storage (IaC artefacts)
#   - S3 bucket for access logs
#
# Distinct from backend_state module (which holds Terraform's own state).
# This bucket stores user-generated .tfstate files uploaded via the CBRE Unified Asset Intelligence Platform UI.

terraform {
  required_version = ">= 1.7"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Environment = var.environment
      Owner       = "TeamPanchayat"
      CostCenter  = "ADLC-01"
      Project     = "CBRE"
      ManagedBy   = "Terraform"
    }
  }
}

locals {
  name_prefix  = "cbre_platform-${var.environment}"
  bucket_name  = coalesce(var.bucket_name, "${local.name_prefix}-state-files-${data.aws_caller_identity.current.account_id}")
  log_bucket   = "${local.name_prefix}-state-files-logs-${data.aws_caller_identity.current.account_id}"
}

data "aws_caller_identity" "current" {}

# ── Access Logs Bucket ────────────────────────────────────────────────────────
resource "aws_s3_bucket" "logs" {
  bucket        = local.log_bucket
  force_destroy = var.environment == "dev" ? true : false

  tags = { Name = local.log_bucket, Purpose = "state-files-access-logs" }
}

resource "aws_s3_bucket_public_access_block" "logs" {
  bucket                  = aws_s3_bucket.logs.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "logs" {
  bucket = aws_s3_bucket.logs.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "aws:kms"
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "logs" {
  bucket = aws_s3_bucket.logs.id
  rule {
    id     = "expire-access-logs"
    status = "Enabled"
    filter { prefix = "" }
    expiration { days = 90 }
  }
}

# ── User State Files Bucket ───────────────────────────────────────────────────
resource "aws_s3_bucket" "state_files" {
  bucket        = local.bucket_name
  force_destroy = var.environment == "dev" ? true : false

  tags = { Name = local.bucket_name, Purpose = "cbre_platform-user-state-files" }
}

resource "aws_s3_bucket_versioning" "state_files" {
  bucket = aws_s3_bucket.state_files.id
  versioning_configuration { status = "Enabled" }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "state_files" {
  bucket = aws_s3_bucket.state_files.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "aws:kms"
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_public_access_block" "state_files" {
  bucket                  = aws_s3_bucket.state_files.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_logging" "state_files" {
  bucket        = aws_s3_bucket.state_files.id
  target_bucket = aws_s3_bucket.logs.id
  target_prefix = "state-files-access-logs/"
}

resource "aws_s3_bucket_lifecycle_configuration" "state_files" {
  bucket = aws_s3_bucket.state_files.id
  rule {
    id     = "expire-old-versions"
    status = "Enabled"
    filter { prefix = "" }
    noncurrent_version_expiration { noncurrent_days = 90 }
  }
}

# ── Bucket Policy: restrict to IAM role only ──────────────────────────────────
resource "aws_s3_bucket_policy" "state_files" {
  bucket = aws_s3_bucket.state_files.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "DenyInsecureTransport"
        Effect    = "Deny"
        Principal = "*"
        Action    = "s3:*"
        Resource = [
          aws_s3_bucket.state_files.arn,
          "${aws_s3_bucket.state_files.arn}/*"
        ]
        Condition = {
          Bool = { "aws:SecureTransport" = "false" }
        }
      }
    ]
  })
}
