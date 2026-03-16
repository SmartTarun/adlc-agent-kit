# Agent: Vikram | Sprint: 01 | Date: 2026-03-16
# Terraform Backend State Module — Variables

variable "aws_region" {
  description = "AWS region for the state bucket and lock table"
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
  description = "Override the auto-generated S3 bucket name (must be globally unique)"
  type        = string
  default     = ""
}

variable "lock_table_name" {
  description = "Override the auto-generated DynamoDB lock table name"
  type        = string
  default     = ""
}
