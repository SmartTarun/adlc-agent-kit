# Agent: Vikram | Sprint: 01 | Date: 2026-03-16
# Terraform Lambda Module — INFRAVIZ
#
# Resources created:
#   - Lambda function (Python 3.11, FastAPI via Mangum)
#   - CloudWatch Log Group (with retention)
#   - Lambda security group (if VPC mode)
#   - SSM parameters for function config

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
  name_prefix   = "infraviz-${var.environment}"
  function_name = "${local.name_prefix}-api"
}

data "aws_region" "current" {}

# ── CloudWatch Log Group ──────────────────────────────────────────────────────
resource "aws_cloudwatch_log_group" "lambda" {
  name              = "/aws/lambda/${local.function_name}"
  retention_in_days = var.log_retention_days

  tags = {
    Name        = "/aws/lambda/${local.function_name}"
    Environment = var.environment
    Owner       = "TeamPanchayat"
    CostCenter  = "ADLC-01"
    Project     = "INFRAVIZ"
  }
}

# ── Lambda Security Group (VPC mode) ─────────────────────────────────────────
resource "aws_security_group" "lambda" {
  count = var.vpc_id != "" ? 1 : 0

  name        = "${local.function_name}-sg"
  description = "Lambda function outbound access security group"
  vpc_id      = var.vpc_id

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
    description = "All outbound — Bedrock API + RDS + Secrets Manager"
  }

  tags = {
    Name        = "${local.function_name}-sg"
    Environment = var.environment
    Owner       = "TeamPanchayat"
    CostCenter  = "ADLC-01"
    Project     = "INFRAVIZ"
  }
}

# ── Lambda Function ───────────────────────────────────────────────────────────
resource "aws_lambda_function" "api" {
  function_name = local.function_name
  description   = "INFRAVIZ FastAPI backend — AI-powered IaC generator"
  role          = var.lambda_exec_role_arn

  # Deployment package — zip uploaded by CI/CD pipeline
  filename         = var.deployment_package_path
  source_code_hash = filebase64sha256(var.deployment_package_path)
  handler          = "app.main.handler"
  runtime          = "python3.11"

  memory_size = var.memory_size
  timeout     = var.timeout

  architectures = ["arm64"]

  environment {
    variables = {
      ENVIRONMENT          = var.environment
      DB_SECRET_ARN        = var.db_secret_arn
      DB_HOST              = var.db_host
      DB_NAME              = var.db_name
      BEDROCK_MODEL_ID     = var.bedrock_model_id
      STATE_BUCKET_NAME    = var.state_bucket_name
      LOG_LEVEL            = var.environment == "dev" ? "DEBUG" : "INFO"
    }
  }

  dynamic "vpc_config" {
    for_each = var.vpc_id != "" ? [1] : []
    content {
      subnet_ids         = var.subnet_ids
      security_group_ids = [aws_security_group.lambda[0].id]
    }
  }

  tracing_config {
    mode = "Active"
  }

  depends_on = [aws_cloudwatch_log_group.lambda]

  tags = {
    Name        = local.function_name
    Environment = var.environment
    Owner       = "TeamPanchayat"
    CostCenter  = "ADLC-01"
    Project     = "INFRAVIZ"
  }
}

# ── Lambda Permission — API Gateway Invoke ────────────────────────────────────
resource "aws_lambda_permission" "api_gateway" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.api.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${var.api_gateway_execution_arn}/*/*"
}
