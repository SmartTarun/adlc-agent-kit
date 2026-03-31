# Agent: vikram | Sprint: 01 | Date: 2026-03-16
# Terraform S3 Module — Outputs

output "bucket_name" {
  description = "Name of the state files S3 bucket — pass to Lambda/backend env vars"
  value       = aws_s3_bucket.state_files.bucket
}

output "bucket_arn" {
  description = "ARN of the state files S3 bucket — use in IAM policies"
  value       = aws_s3_bucket.state_files.arn
}

output "bucket_regional_domain_name" {
  description = "Regional domain name of the state files bucket"
  value       = aws_s3_bucket.state_files.bucket_regional_domain_name
}
