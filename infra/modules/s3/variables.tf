# Agent: vikram | Sprint: 01 | Date: 2026-03-16
# Terraform S3 Module — Variables

variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "us-east-1"
}

variable "environment" {
  description = "Deployment environment"
  type        = string
  default     = "dev"
  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "environment must be dev, staging, or prod."
  }
}

variable "bucket_name" {
  description = "Override bucket name. If empty, auto-generated from environment + account ID."
  type        = string
  default     = ""
}
