# Agent: Vikram | Sprint: 01 | Date: 2026-03-16
# Terraform S3 Frontend Module — Variables

variable "environment" {
  description = "Deployment environment"
  type        = string
  default     = "dev"
  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "environment must be dev, staging, or prod."
  }
}

variable "cloudfront_distribution_arn" {
  description = "CloudFront distribution ARN — used in bucket policy OAC condition"
  type        = string
}
