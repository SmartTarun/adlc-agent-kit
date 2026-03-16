# Agent: Vikram | Sprint: 01 | Date: 2026-03-16
# Terraform Backend State Module — INFRAVIZ
#
# Resources created:
#   - S3 bucket for Terraform state (versioned, encrypted, access-logged)
#   - S3 bucket for state access logs
#   - DynamoDB table for state locking
#
# DEPLOY FIRST before any other module.
# After apply, configure backend in root module:
#   terraform {
#     backend "s3" {
#       bucket         = "<bucket_name output>"
#       key            = "infraviz/<module>/terraform.tfstate"
#       region         = "us-east-1"
#       dynamodb_table = "<lock_table output>"
#       encrypt        = true
#     }
#   }

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
      CostCenter  = "ADLC-Sprint01"
      Project     = "CostAnomalyPlatform"
      ManagedBy   = "Terraform"
    }
  }
}

locals {
  name_prefix = "infraviz-${var.environment}"
  bucket_name = coalesce(var.bucket_name, "${local.name_prefix}-tfstate-${data.aws_caller_identity.current.account_id}")
  lock_table  = coalesce(var.lock_table_name, "${local.name_prefix}-tfstate-lock")
  log_bucket  = "${local.name_prefix}-tfstate-logs-${data.aws_caller_identity.current.account_id}"
}

data "aws_caller_identity" "current" {}

# ── Access Logs Bucket ────────────────────────────────────────────────────────
resource "aws_s3_bucket" "logs" {
  bucket        = local.log_bucket
  force_destroy = var.environment == "dev" ? true : false

  tags = { Name = local.log_bucket, Purpose = "tfstate-access-logs" }
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
    id     = "expire-logs"
    status = "Enabled"
    filter { prefix = "" }
    expiration { days = 90 }
  }
}

# ── Terraform State Bucket ────────────────────────────────────────────────────
resource "aws_s3_bucket" "state" {
  bucket        = local.bucket_name
  force_destroy = var.environment == "dev" ? true : false

  tags = { Name = local.bucket_name, Purpose = "terraform-state" }
}

resource "aws_s3_bucket_versioning" "state" {
  bucket = aws_s3_bucket.state.id
  versioning_configuration { status = "Enabled" }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "state" {
  bucket = aws_s3_bucket.state.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "aws:kms"
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_public_access_block" "state" {
  bucket                  = aws_s3_bucket.state.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_logging" "state" {
  bucket        = aws_s3_bucket.state.id
  target_bucket = aws_s3_bucket.logs.id
  target_prefix = "tfstate-access-logs/"
}

resource "aws_s3_bucket_lifecycle_configuration" "state" {
  bucket = aws_s3_bucket.state.id
  rule {
    id     = "expire-old-versions"
    status = "Enabled"
    filter { prefix = "" }
    noncurrent_version_expiration { noncurrent_days = 90 }
  }
}

# ── DynamoDB State Lock Table ─────────────────────────────────────────────────
resource "aws_dynamodb_table" "state_lock" {
  name         = local.lock_table
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "LockID"

  attribute {
    name = "LockID"
    type = "S"
  }

  point_in_time_recovery { enabled = true }

  server_side_encryption {
    enabled = true
  }

  tags = { Name = local.lock_table, Purpose = "terraform-state-lock" }
}
