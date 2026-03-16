# Agent: Vikram | Sprint: 01 | Date: 2026-03-16
# Terraform IAM Module — Variables

variable "environment" {
  description = "Deployment environment"
  type        = string
  default     = "dev"
  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "environment must be dev, staging, or prod."
  }
}

variable "state_bucket_name" {
  description = "Name of the S3 bucket used for IaC state file storage"
  type        = string
}

variable "lambda_in_vpc" {
  description = "Set true if Lambda will be deployed inside a VPC (adds VPC network interface policy)"
  type        = bool
  default     = false
}
