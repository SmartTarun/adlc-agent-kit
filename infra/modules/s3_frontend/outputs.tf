# Agent: Vikram | Sprint: 01 | Date: 2026-03-16
# Terraform S3 Frontend Module — Outputs

output "bucket_name" {
  description = "Frontend S3 bucket name"
  value       = aws_s3_bucket.frontend.bucket
}

output "bucket_arn" {
  description = "Frontend S3 bucket ARN — pass to cloudfront module"
  value       = aws_s3_bucket.frontend.arn
}

output "bucket_regional_domain_name" {
  description = "Bucket regional domain name — used as CloudFront origin"
  value       = aws_s3_bucket.frontend.bucket_regional_domain_name
}
