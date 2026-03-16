# Agent: Vikram | Sprint: 01 | Date: 2026-03-16
# Terraform Backend State Module — Outputs

output "state_bucket_name" {
  description = "S3 bucket name for Terraform remote state"
  value       = aws_s3_bucket.state.bucket
}

output "state_bucket_arn" {
  description = "S3 bucket ARN for Terraform remote state"
  value       = aws_s3_bucket.state.arn
}

output "lock_table_name" {
  description = "DynamoDB table name for Terraform state locking"
  value       = aws_dynamodb_table.state_lock.name
}

output "lock_table_arn" {
  description = "DynamoDB table ARN"
  value       = aws_dynamodb_table.state_lock.arn
}

output "backend_config" {
  description = "Terraform backend block config snippet (copy into root module backend.tf)"
  value = <<-EOT
    terraform {
      backend "s3" {
        bucket         = "${aws_s3_bucket.state.bucket}"
        key            = "infraviz/<module>/terraform.tfstate"
        region         = "${aws_s3_bucket.state.region}"
        dynamodb_table = "${aws_dynamodb_table.state_lock.name}"
        encrypt        = true
      }
    }
  EOT
}
