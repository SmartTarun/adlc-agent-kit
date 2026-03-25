# Agent: Vikram | Sprint: 01 | Date: 2026-03-16
# Terraform RDS Aurora Module — INFRAVIZ
#
# Resources created:
#   - Aurora Serverless v2 PostgreSQL cluster
#   - DB subnet group (requires >= 2 AZ subnets)
#   - Security group (Lambda → RDS on port 5432)
#   - CloudWatch log exports (postgresql, upgradelogs)

terraform {
  required_version = ">= 1.7"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 5.0"
    }
  }
}

locals {
  name_prefix  = "infraviz-${var.environment}"
  cluster_id   = "${local.name_prefix}-aurora"
  db_port      = 5432
}

data "aws_region" "current" {}

# ── DB Subnet Group ───────────────────────────────────────────────────────────
resource "aws_db_subnet_group" "aurora" {
  name        = "${local.cluster_id}-subnet-group"
  description = "Subnet group for INFRAVIZ Aurora Serverless v2"
  subnet_ids  = var.subnet_ids

  tags = {
    Name        = "${local.cluster_id}-subnet-group"
    Environment = var.environment
    Owner       = "TeamPanchayat"
    CostCenter  = "ADLC-01"
    Project     = "INFRAVIZ"
  }
}

# ── Security Group ────────────────────────────────────────────────────────────
resource "aws_security_group" "aurora" {
  name        = "${local.cluster_id}-sg"
  description = "Allow inbound PostgreSQL from Lambda security group"
  vpc_id      = var.vpc_id

  ingress {
    from_port       = local.db_port
    to_port         = local.db_port
    protocol        = "tcp"
    security_groups = var.allowed_security_group_ids
    description     = "PostgreSQL from Lambda"
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
    description = "All outbound"
  }

  tags = {
    Name        = "${local.cluster_id}-sg"
    Environment = var.environment
    Owner       = "TeamPanchayat"
    CostCenter  = "ADLC-01"
    Project     = "INFRAVIZ"
  }
}

# ── Aurora Serverless v2 Cluster ──────────────────────────────────────────────
resource "aws_rds_cluster" "aurora" {
  cluster_identifier     = local.cluster_id
  engine                 = "aurora-postgresql"
  engine_mode            = "provisioned"
  engine_version         = var.engine_version
  database_name          = var.database_name
  master_username        = var.master_username
  manage_master_user_password = true

  db_subnet_group_name   = aws_db_subnet_group.aurora.name
  vpc_security_group_ids = [aws_security_group.aurora.id]

  serverlessv2_scaling_configuration {
    min_capacity = var.min_acu
    max_capacity = var.max_acu
  }

  storage_encrypted   = true
  deletion_protection = var.environment == "prod" ? true : false
  skip_final_snapshot = var.environment == "dev" ? true : false

  final_snapshot_identifier = var.environment != "dev" ? "${local.cluster_id}-final-snapshot" : null

  enabled_cloudwatch_logs_exports = ["postgresql"]

  backup_retention_period = var.environment == "dev" ? 1 : 7
  preferred_backup_window = "03:00-04:00"

  tags = {
    Name        = local.cluster_id
    Environment = var.environment
    Owner       = "TeamPanchayat"
    CostCenter  = "ADLC-01"
    Project     = "INFRAVIZ"
  }
}

# ── Aurora Serverless v2 Writer Instance ──────────────────────────────────────
resource "aws_rds_cluster_instance" "writer" {
  identifier         = "${local.cluster_id}-writer"
  cluster_identifier = aws_rds_cluster.aurora.id
  instance_class     = "db.serverless"
  engine             = aws_rds_cluster.aurora.engine
  engine_version     = aws_rds_cluster.aurora.engine_version

  db_subnet_group_name = aws_db_subnet_group.aurora.name

  performance_insights_enabled = var.environment != "dev" ? true : false

  tags = {
    Name        = "${local.cluster_id}-writer"
    Environment = var.environment
    Owner       = "TeamPanchayat"
    CostCenter  = "ADLC-01"
    Project     = "INFRAVIZ"
  }
}
