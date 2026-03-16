# Agent: Vikram | Sprint: 01 | Date: 2026-03-16
# Terraform RDS Aurora Module — Variables

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
  description = "VPC ID to deploy Aurora into"
  type        = string
}

variable "subnet_ids" {
  description = "List of subnet IDs for the DB subnet group (minimum 2, in different AZs)"
  type        = list(string)
}

variable "allowed_security_group_ids" {
  description = "Security group IDs allowed to connect to Aurora on port 5432 (e.g., Lambda SG)"
  type        = list(string)
  default     = []
}

variable "database_name" {
  description = "Name of the initial database to create"
  type        = string
  default     = "infraviz"
}

variable "master_username" {
  description = "Master username for the Aurora cluster"
  type        = string
  default     = "infraviz_admin"
}

variable "engine_version" {
  description = "Aurora PostgreSQL engine version"
  type        = string
  default     = "15.4"
}

variable "min_acu" {
  description = "Minimum Aurora Serverless v2 capacity units (0.5 ACU minimum)"
  type        = number
  default     = 0.5
}

variable "max_acu" {
  description = "Maximum Aurora Serverless v2 capacity units"
  type        = number
  default     = 4
}
