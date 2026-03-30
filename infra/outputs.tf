# Agent: Vikram | Sprint: 01 | Date: 2026-03-16
# CBRE Root Module — Outputs

output "api_endpoint" {
  description = "CBRE backend API URL — give to Kiran for integration tests"
  value       = module.api_gateway.api_endpoint
}

output "frontend_url" {
  description = "CBRE React frontend URL — give to Rohan"
  value       = "https://${module.cloudfront.domain_name}"
}

output "cloudfront_distribution_id" {
  description = "CloudFront distribution ID — needed for cache invalidation on deploy"
  value       = module.cloudfront.distribution_id
}

output "frontend_bucket_name" {
  description = "Frontend S3 bucket name — CI/CD uploads React build here"
  value       = module.s3_frontend.bucket_name
}

output "aurora_endpoint" {
  description = "Aurora writer endpoint — for Rasool migration runs"
  value       = module.rds_aurora.cluster_endpoint
  sensitive   = true
}

output "aurora_secret_arn" {
  description = "ARN of RDS-managed master password secret"
  value       = module.rds_aurora.master_user_secret_arn
  sensitive   = true
}

output "lambda_function_name" {
  description = "Lambda function name — for CloudWatch logs and manual invocations"
  value       = module.lambda.function_name
}
