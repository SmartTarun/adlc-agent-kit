# Agent: vikram | Sprint: 01 | Date: 2026-03-28
# CBRE Root Infrastructure — Outputs
#
# Team handoffs:
#   Rasool: db_endpoint, db_secret_arn, db_name
#   Kiran:  ecr_backend_url, ecr_etl_url, db_endpoint, db_secret_arn, api_base_url
#   Rohan:  s3_bucket_name, cloudfront_domain, cloudfront_distribution_id

# ── Rasool (Database Migrations) ──────────────────────────────────────────────
output "db_endpoint" {
  description = "RDS endpoint (host:port) — for DATABASE_URL in alembic.ini"
  value       = module.rds.db_endpoint
}

output "db_address" {
  description = "RDS host only (without port)"
  value       = module.rds.db_address
}

output "db_port" {
  description = "RDS port (5432)"
  value       = module.rds.db_port
}

output "db_name" {
  description = "PostgreSQL database name"
  value       = module.rds.db_name
}

output "db_username" {
  description = "RDS master username"
  value       = module.rds.db_username
}

output "db_secret_arn" {
  description = "Secrets Manager ARN for RDS master password — Rasool reads this for migrations"
  value       = module.rds.db_secret_arn
}

# ── Kiran (FastAPI Backend + ETL) ─────────────────────────────────────────────
output "ecr_backend_url" {
  description = "ECR URL for FastAPI image — `docker push <url>:tag`"
  value       = module.ecs.ecr_backend_url
}

output "ecr_etl_url" {
  description = "ECR URL for ETL image — `docker push <url>:tag`"
  value       = module.ecs.ecr_etl_url
}

output "anthropic_secret_arn" {
  description = "Secrets Manager ARN for Anthropic API key — Kiran injects into FastAPI env"
  value       = module.secrets.anthropic_api_key_arn
}

output "rentcast_secret_arn" {
  description = "Secrets Manager ARN for RentCast API key — Kiran injects into ETL env"
  value       = module.secrets.rentcast_api_key_arn
}

output "api_base_url" {
  description = "FastAPI base URL via CloudFront — use for frontend API calls"
  value       = "https://${module.frontend.cloudfront_domain}/api"
}

output "alb_dns_name" {
  description = "ALB DNS name for direct backend access (bypass CloudFront)"
  value       = module.alb.alb_dns_name
}

# ── Rohan (React Frontend) ────────────────────────────────────────────────────
output "s3_bucket_name" {
  description = "S3 bucket for React build — `aws s3 sync dist/ s3://<name> --delete`"
  value       = module.frontend.s3_bucket_name
}

output "cloudfront_domain" {
  description = "CloudFront domain for CBRE dashboard — share with Directors"
  value       = module.frontend.cloudfront_domain
}

output "cloudfront_distribution_id" {
  description = "CloudFront distribution ID — `aws cloudfront create-invalidation --paths '/*'`"
  value       = module.frontend.cloudfront_distribution_id
}

# ── Infrastructure Summary ────────────────────────────────────────────────────
output "cluster_name" {
  description = "ECS cluster name"
  value       = module.ecs.cluster_name
}

output "backend_log_group" {
  description = "CloudWatch log group for FastAPI"
  value       = module.ecs.backend_log_group
}

output "etl_log_group" {
  description = "CloudWatch log group for ETL scheduler"
  value       = module.ecs.etl_log_group
}
