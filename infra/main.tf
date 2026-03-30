# Agent: Vikram | Sprint: 01 | Date: 2026-03-16
# CBRE Root Module — wires all /infra/modules/ together
#
# DEPLOY ORDER:
#   1. cd infra/modules/backend_state && terraform apply
#   2. Fill in backend config below with outputs from step 1
#   3. terraform init && terraform apply (this file)
#
# Modules deployed:
#   secrets_manager → iam → rds_aurora → lambda → api_gateway
#   cloudfront → s3_frontend (circular ref handled: cloudfront arn → s3 policy)

terraform {
  required_version = ">= 1.7"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 5.0"
    }
  }

  # Uncomment after running backend_state module and replace with its outputs:
  # backend "s3" {
  #   bucket         = "infraviz-dev-tfstate-<account-id>"
  #   key            = "infraviz/root/terraform.tfstate"
  #   region         = "us-east-1"
  #   dynamodb_table = "infraviz-dev-tfstate-lock"
  #   encrypt        = true
  # }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Environment = var.environment
      Owner       = "TeamPanchayat"
      CostCenter  = "ADLC-01"
      Project     = "INFRAVIZ"
      ManagedBy   = "Terraform"
    }
  }
}

# ── Secrets Manager ───────────────────────────────────────────────────────────
module "secrets_manager" {
  source      = "./modules/secrets_manager"
  environment = var.environment
}

# ── IAM ───────────────────────────────────────────────────────────────────────
module "iam" {
  source            = "./modules/iam"
  environment       = var.environment
  state_bucket_name = var.iac_state_bucket_name
  lambda_in_vpc     = var.lambda_in_vpc
}

# ── RDS Aurora ────────────────────────────────────────────────────────────────
module "rds_aurora" {
  source      = "./modules/rds_aurora"
  environment = var.environment
  vpc_id      = var.vpc_id
  subnet_ids  = var.private_subnet_ids

  # Lambda SG added after lambda module — use depends_on approach
  allowed_security_group_ids = []
}

# ── CloudFront (created before S3 so we get the ARN for bucket policy) ────────
module "cloudfront" {
  source      = "./modules/cloudfront"
  environment = var.environment

  s3_bucket_name                 = "placeholder-resolved-after-s3"
  s3_bucket_regional_domain_name = "placeholder-resolved-after-s3"

  depends_on = [module.s3_frontend]
}

# ── S3 Frontend ───────────────────────────────────────────────────────────────
module "s3_frontend" {
  source      = "./modules/s3_frontend"
  environment = var.environment

  cloudfront_distribution_arn = module.cloudfront.distribution_arn
}

# ── Lambda ────────────────────────────────────────────────────────────────────
module "lambda" {
  source      = "./modules/lambda"
  environment = var.environment

  lambda_exec_role_arn      = module.iam.lambda_exec_role_arn
  db_secret_arn             = module.rds_aurora.master_user_secret_arn
  db_host                   = module.rds_aurora.cluster_endpoint
  db_name                   = "cbre_platform"
  state_bucket_name         = var.iac_state_bucket_name
  bedrock_model_id          = var.bedrock_model_id
  api_gateway_execution_arn = module.api_gateway.execution_arn

  vpc_id     = var.lambda_in_vpc ? var.vpc_id : ""
  subnet_ids = var.lambda_in_vpc ? var.private_subnet_ids : []

  deployment_package_path = var.lambda_package_path
}

# ── API Gateway ───────────────────────────────────────────────────────────────
module "api_gateway" {
  source      = "./modules/api_gateway"
  environment = var.environment

  lambda_invoke_arn  = module.lambda.invoke_arn
  cors_allow_origins = var.cors_allow_origins
}
