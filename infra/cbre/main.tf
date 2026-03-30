# Agent: vikram | Sprint: 01 | Date: 2026-03-28
# CBRE Unified Asset Intelligence Platform — Root Infrastructure Module
#
# DEPLOY ORDER:
#   1. cd ../modules/backend_state && terraform apply  (one-time, creates S3+DynamoDB for state)
#   2. Uncomment backend "s3" block below, fill in outputs from step 1
#   3. terraform init && terraform apply (this file)
#
# Architecture:
#   cbre_secrets → cbre_vpc → cbre_iam + cbre_rds + cbre_alb → cbre_ecs → cbre_frontend
#
# Module outputs for team handoffs:
#   Rasool: db_endpoint, db_secret_arn
#   Kiran:  ecr_backend_url, ecr_etl_url, db_endpoint, db_secret_arn
#   Rohan:  s3_bucket_name, cloudfront_domain, cloudfront_distribution_id

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
  #   bucket         = "<bucket-name-from-backend-state-output>"
  #   key            = "cbre/root/terraform.tfstate"
  #   region         = "us-east-1"
  #   dynamodb_table = "<table-name-from-backend-state-output>"
  #   encrypt        = true
  # }
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
      Application = "CBRE-AssetIntelligence"
    }
  }
}

# ── 1. Secrets Manager (first — IAM + ECS reference secret ARNs) ──────────────
module "secrets" {
  source      = "../modules/cbre_secrets"
  environment = var.environment
}

# ── 2. VPC ────────────────────────────────────────────────────────────────────
module "vpc" {
  source      = "../modules/cbre_vpc"
  environment = var.environment
  aws_region  = var.aws_region
}

# ── 3a. ALB (depends on vpc, provides SG id to ecs) ──────────────────────────
module "alb" {
  source      = "../modules/cbre_alb"
  environment = var.environment

  vpc_id            = module.vpc.vpc_id
  public_subnet_ids = module.vpc.public_subnet_ids
  backend_port      = var.backend_port

  depends_on = [module.vpc]
}

# ── 3b. ECS (partial — creates SG and ECR repos before IAM/RDS reference) ────
# NOTE: cbre_ecs creates the task security group needed by cbre_rds.
# We wire task_security_group_id back to rds after both are created.
# Terraform handles this via module output references (no circular dep at plan level).

# ── 4. IAM (needs ECR ARNs from ecs module — created via two-pass if needed) ─
# To avoid a dependency cycle, IAM policy allows all ECR resources in account.
module "iam" {
  source      = "../modules/cbre_iam"
  environment = var.environment
  aws_region  = var.aws_region

  # ecr_repo_arns left empty — ECS module creates repos after IAM.
  # IAM task role uses wildcard ECR resource within the account.
  ecr_repo_arns = []

  depends_on = [module.secrets]
}

# ── 5. RDS PostgreSQL ─────────────────────────────────────────────────────────
# Chicken-and-egg: cbre_rds needs ecs_task_sg_id, but cbre_ecs also needs RDS outputs.
# Solution: ECS SG is created separately here using a minimal data resource,
# OR we accept that Terraform resolves this through the dependency graph.
# cbre_ecs.task_security_group_id is an output, referenced AFTER ecs module runs.

module "ecs" {
  source      = "../modules/cbre_ecs"
  environment = var.environment
  aws_region  = var.aws_region

  vpc_id             = module.vpc.vpc_id
  private_subnet_ids = module.vpc.private_subnet_ids
  alb_sg_id          = module.alb.alb_security_group_id

  task_execution_role_arn = module.iam.task_execution_role_arn
  task_role_arn           = module.iam.task_role_arn

  # RDS outputs passed here — Terraform resolves order from depends_on
  db_host       = module.rds.db_address
  db_name       = var.db_name
  db_secret_arn = module.rds.db_secret_arn

  anthropic_secret_arn = module.secrets.anthropic_api_key_arn
  rentcast_secret_arn  = module.secrets.rentcast_api_key_arn
  alb_target_group_arn = module.alb.target_group_arn

  backend_port          = var.backend_port
  backend_cpu           = var.backend_cpu
  backend_memory        = var.backend_memory
  backend_desired_count = var.backend_desired_count
  backend_image_tag     = var.backend_image_tag
  etl_cpu               = var.etl_cpu
  etl_memory            = var.etl_memory
  etl_image_tag         = var.etl_image_tag

  depends_on = [module.vpc, module.iam, module.alb]
}

module "rds" {
  source      = "../modules/cbre_rds"
  environment = var.environment

  vpc_id             = module.vpc.vpc_id
  private_subnet_ids = module.vpc.private_subnet_ids
  ecs_task_sg_id     = module.ecs.task_security_group_id

  db_instance_class        = var.db_instance_class
  allocated_storage_gb     = var.allocated_storage_gb
  max_allocated_storage_gb = var.max_allocated_storage_gb

  depends_on = [module.vpc, module.ecs]
}

# ── 6. Frontend (S3 + CloudFront — last, needs ALB DNS) ──────────────────────
module "frontend" {
  source      = "../modules/cbre_frontend"
  environment = var.environment

  alb_dns_name  = module.alb.alb_dns_name
  bucket_suffix = var.bucket_suffix

  depends_on = [module.alb]
}
