# Agent: Vikram | Sprint: 01 | Date: 2026-03-16
# Terraform CloudFront Module — Variables

variable "environment" {
  description = "Deployment environment"
  type        = string
  default     = "dev"
  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "environment must be dev, staging, or prod."
  }
}

variable "s3_bucket_name" {
  description = "Frontend S3 bucket name (output of s3_frontend module)"
  type        = string
}

variable "s3_bucket_regional_domain_name" {
  description = "Frontend S3 bucket regional domain name (output of s3_frontend module)"
  type        = string
}
