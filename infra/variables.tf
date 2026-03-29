# Agent: Vikram | Sprint: 01 | Date: 2026-03-16
# CBRE Root Module — Variables

variable "aws_region" {
  description = "AWS region for all resources"
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

variable "vpc_id" {
  description = "VPC ID (required when lambda_in_vpc = true)"
  type        = string
  default     = ""
}

variable "private_subnet_ids" {
  description = "Private subnet IDs for RDS and Lambda (when VPC mode enabled)"
  type        = list(string)
  default     = []
}

variable "lambda_in_vpc" {
  description = "Deploy Lambda inside a VPC (requires vpc_id + private_subnet_ids)"
  type        = bool
  default     = false
}

variable "iac_state_bucket_name" {
  description = "S3 bucket name for IaC state file storage (output of backend_state module)"
  type        = string
}

variable "bedrock_model_id" {
  description = "AWS Bedrock model ID for Claude LLM"
  type        = string
  default     = "anthropic.claude-sonnet-4-6-20250514-v1:0"
}

variable "lambda_package_path" {
  description = "Path to the Lambda deployment zip (built by CI/CD from /backend)"
  type        = string
  default     = "../backend/dist/cbre_platform-api.zip"
}

variable "cors_allow_origins" {
  description = "CORS allowed origins for the HTTP API"
  type        = list(string)
  default     = ["*"]
}
