# Agent: Vikram | Sprint: 01 | Date: 2026-03-16
# Terraform CloudFront Module — Outputs

output "distribution_id" {
  description = "CloudFront distribution ID"
  value       = aws_cloudfront_distribution.frontend.id
}

output "distribution_arn" {
  description = "CloudFront distribution ARN — pass to s3_frontend module for OAC bucket policy"
  value       = aws_cloudfront_distribution.frontend.arn
}

output "domain_name" {
  description = "CloudFront distribution domain (e.g. d1234.cloudfront.net) — access the React app here"
  value       = aws_cloudfront_distribution.frontend.domain_name
}
