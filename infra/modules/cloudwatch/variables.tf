# Agent: vikram | Sprint: 01 | Date: 2026-03-16
# Terraform CloudWatch Module — Variables

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

variable "log_retention_days" {
  description = "CloudWatch log group retention in days"
  type        = number
  default     = 30
  validation {
    condition     = contains([1, 3, 5, 7, 14, 30, 60, 90, 120, 150, 180, 365, 400, 545, 731, 1827, 3653], var.log_retention_days)
    error_message = "log_retention_days must be a valid CloudWatch retention value."
  }
}

variable "lambda_error_threshold" {
  description = "Lambda error count alarm threshold per minute"
  type        = number
  default     = 5
}

variable "api_5xx_threshold" {
  description = "API Gateway 5xx error count alarm threshold per minute"
  type        = number
  default     = 10
}

variable "rds_connection_threshold" {
  description = "RDS max database connections alarm threshold"
  type        = number
  default     = 50
}
