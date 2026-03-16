# Agent: Vikram | Sprint: 01 | Date: 2026-03-16
# Terraform API Gateway Module — Variables

variable "environment" {
  description = "Deployment environment"
  type        = string
  default     = "dev"
  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "environment must be dev, staging, or prod."
  }
}

variable "lambda_invoke_arn" {
  description = "Lambda invoke ARN (output of lambda module)"
  type        = string
}

variable "cors_allow_origins" {
  description = "CORS allowed origins for the API"
  type        = list(string)
  default     = ["*"]
}
