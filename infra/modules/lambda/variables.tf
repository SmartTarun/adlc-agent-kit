# Agent: Vikram | Sprint: 01 | Date: 2026-03-16
# Terraform Lambda Module — Variables

variable "environment" {
  description = "Deployment environment"
  type        = string
  default     = "dev"
  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "environment must be dev, staging, or prod."
  }
}

variable "lambda_exec_role_arn" {
  description = "ARN of the IAM execution role for Lambda (output of iam module)"
  type        = string
}

variable "deployment_package_path" {
  description = "Local path to the Lambda deployment zip package"
  type        = string
  default     = "../../backend/dist/infraviz-api.zip"
}

variable "memory_size" {
  description = "Lambda function memory in MB"
  type        = number
  default     = 512
}

variable "timeout" {
  description = "Lambda function timeout in seconds"
  type        = number
  default     = 30
}

variable "log_retention_days" {
  description = "CloudWatch Logs retention in days"
  type        = number
  default     = 14
}

variable "db_secret_arn" {
  description = "ARN of the Secrets Manager secret for DB credentials"
  type        = string
}

variable "db_host" {
  description = "Aurora cluster writer endpoint"
  type        = string
}

variable "db_name" {
  description = "Database name"
  type        = string
  default     = "infraviz"
}

variable "bedrock_model_id" {
  description = "AWS Bedrock model ID for Claude (e.g. anthropic.claude-sonnet-4-6-20250514-v1:0)"
  type        = string
  default     = "anthropic.claude-sonnet-4-6-20250514-v1:0"
}

variable "state_bucket_name" {
  description = "S3 bucket name for IaC state file storage"
  type        = string
}

variable "api_gateway_execution_arn" {
  description = "API Gateway execution ARN — used to grant invoke permission"
  type        = string
}

# ── VPC (optional) ────────────────────────────────────────────────────────────
variable "vpc_id" {
  description = "VPC ID to deploy Lambda into (leave empty for public Lambda)"
  type        = string
  default     = ""
}

variable "subnet_ids" {
  description = "Private subnet IDs for VPC-mode Lambda"
  type        = list(string)
  default     = []
}
