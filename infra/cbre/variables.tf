# Agent: vikram | Sprint: 01 | Date: 2026-03-28
# CBRE Root Infrastructure — Variables

variable "environment" {
  description = "Deployment environment (dev | staging | prod)"
  type        = string
  default     = "dev"

  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "environment must be dev, staging, or prod."
  }
}

variable "aws_region" {
  description = "AWS region for all resources"
  type        = string
  default     = "us-east-1"
}

# ── Database ──────────────────────────────────────────────────────────────────
variable "db_name" {
  description = "PostgreSQL database name"
  type        = string
  default     = "cbre_intel"
}

variable "db_instance_class" {
  description = "RDS instance class"
  type        = string
  default     = "db.t3.micro"
}

variable "allocated_storage_gb" {
  description = "Initial RDS storage in GB"
  type        = number
  default     = 20
}

variable "max_allocated_storage_gb" {
  description = "Max RDS autoscale storage in GB"
  type        = number
  default     = 100
}

# ── ECS: FastAPI Backend ───────────────────────────────────────────────────────
variable "backend_port" {
  description = "FastAPI container port"
  type        = number
  default     = 8000
}

variable "backend_cpu" {
  description = "FastAPI task CPU units (512 = 0.5 vCPU)"
  type        = number
  default     = 512
}

variable "backend_memory" {
  description = "FastAPI task memory in MB"
  type        = number
  default     = 1024
}

variable "backend_desired_count" {
  description = "Number of FastAPI task instances"
  type        = number
  default     = 1
}

variable "backend_image_tag" {
  description = "Docker image tag for cbre-backend (pushed to ECR by Kiran)"
  type        = string
  default     = "latest"
}

# ── ECS: ETL Scheduler ────────────────────────────────────────────────────────
variable "etl_cpu" {
  description = "ETL scheduler task CPU units (256 = 0.25 vCPU)"
  type        = number
  default     = 256
}

variable "etl_memory" {
  description = "ETL scheduler task memory in MB"
  type        = number
  default     = 512
}

variable "etl_image_tag" {
  description = "Docker image tag for cbre-etl (pushed to ECR by Kiran)"
  type        = string
  default     = "latest"
}

# ── Frontend ──────────────────────────────────────────────────────────────────
variable "bucket_suffix" {
  description = "Suffix for S3 bucket name global uniqueness"
  type        = string
  default     = "panchayat"
}
