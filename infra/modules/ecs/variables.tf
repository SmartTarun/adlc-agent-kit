# Agent: Vikram | Sprint: 01 | Date: 2026-03-14
# Terraform ECS Module — Variables
# Deploys Team Panchayat cluster to AWS ECS Fargate

variable "aws_region" {
  description = "AWS region to deploy the cluster"
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

variable "project" {
  description = "Project name (used in all resource names and tags)"
  type        = string
  default     = "CostAnomalyPlatform"
}

variable "cluster_name" {
  description = "ECS cluster name"
  type        = string
  default     = "panchayat-cluster"
}

variable "sprint" {
  description = "Current sprint identifier"
  type        = string
  default     = "Sprint01"
}

# ── Networking ─────────────────────────────────────────────────────────────────
variable "vpc_id" {
  description = "VPC ID to deploy into (leave empty to create a new VPC)"
  type        = string
  default     = ""
}

variable "private_subnet_ids" {
  description = "Private subnet IDs for ECS tasks (min 2 for HA)"
  type        = list(string)
  default     = []
}

variable "public_subnet_ids" {
  description = "Public subnet IDs for the Application Load Balancer"
  type        = list(string)
  default     = []
}

# ── ECR ────────────────────────────────────────────────────────────────────────
variable "ecr_repository_url" {
  description = "ECR repository URL for the agent Docker image"
  type        = string
}

variable "agent_image_tag" {
  description = "Docker image tag to deploy"
  type        = string
  default     = "latest"
}

variable "dashboard_image_tag" {
  description = "Docker image tag for the dashboard"
  type        = string
  default     = "latest"
}

# ── Task sizing ────────────────────────────────────────────────────────────────
variable "agent_cpu" {
  description = "CPU units for each agent task (1024 = 1 vCPU)"
  type        = number
  default     = 1024
}

variable "agent_memory" {
  description = "Memory (MB) for each agent task"
  type        = number
  default     = 2048
}

variable "dashboard_cpu" {
  description = "CPU units for dashboard task"
  type        = number
  default     = 512
}

variable "dashboard_memory" {
  description = "Memory (MB) for dashboard task"
  type        = number
  default     = 1024
}

# ── Secrets ────────────────────────────────────────────────────────────────────
variable "anthropic_api_key_ssm_path" {
  description = "AWS SSM Parameter Store path for ANTHROPIC_API_KEY (SecureString)"
  type        = string
  default     = "/panchayat/anthropic_api_key"
}

variable "db_password_ssm_path" {
  description = "AWS SSM Parameter Store path for PostgreSQL password"
  type        = string
  default     = "/panchayat/db_password"
}

# ── S3 state backend ───────────────────────────────────────────────────────────
variable "state_bucket_name" {
  description = "S3 bucket name for Terraform state"
  type        = string
  default     = "panchayat-tfstate"
}

variable "state_lock_table" {
  description = "DynamoDB table name for Terraform state locking"
  type        = string
  default     = "panchayat-tfstate-lock"
}

# ── Dashboard ALB ──────────────────────────────────────────────────────────────
variable "enable_alb" {
  description = "Create an Application Load Balancer for the dashboard"
  type        = bool
  default     = true
}

variable "dashboard_port" {
  description = "Port the dashboard container listens on"
  type        = number
  default     = 3000
}

variable "certificate_arn" {
  description = "ACM certificate ARN for HTTPS on the ALB (leave empty for HTTP only)"
  type        = string
  default     = ""
}

# ── Tags (required per ADLC standards) ────────────────────────────────────────
variable "tags" {
  description = "Common tags applied to all resources"
  type        = map(string)
  default = {
    Owner      = "TeamPanchayat"
    CostCenter = "ADLC-Sprint01"
    Project    = "CostAnomalyPlatform"
  }
}
