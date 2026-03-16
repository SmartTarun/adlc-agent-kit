# Agent: Vikram | Sprint: 01 | Date: 2026-03-16
# Terraform API Gateway Module — INFRAVIZ
#
# Resources created:
#   - HTTP API (API Gateway v2) — lower cost vs REST API
#   - Lambda integration with proxy routing
#   - CORS configuration
#   - Staged deployment (auto-deploy enabled)
#   - CloudWatch access log group

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
  name_prefix = "infraviz-${var.environment}"
  api_name    = "${local.name_prefix}-http-api"
}

# ── CloudWatch Log Group for Access Logs ──────────────────────────────────────
resource "aws_cloudwatch_log_group" "api_access" {
  name              = "/aws/apigateway/${local.api_name}"
  retention_in_days = 14

  tags = {
    Name        = "/aws/apigateway/${local.api_name}"
    Environment = var.environment
    Owner       = "TeamPanchayat"
    CostCenter  = "ADLC-Sprint01"
    Project     = "CostAnomalyPlatform"
  }
}

# ── HTTP API ──────────────────────────────────────────────────────────────────
resource "aws_apigatewayv2_api" "infraviz" {
  name          = local.api_name
  protocol_type = "HTTP"
  description   = "INFRAVIZ AI-powered IaC generator API"

  cors_configuration {
    allow_headers = ["Content-Type", "Authorization", "X-Amz-Date", "X-Api-Key"]
    allow_methods = ["GET", "POST", "PUT", "DELETE", "OPTIONS"]
    allow_origins = var.cors_allow_origins
    max_age       = 86400
  }

  tags = {
    Name        = local.api_name
    Environment = var.environment
    Owner       = "TeamPanchayat"
    CostCenter  = "ADLC-Sprint01"
    Project     = "CostAnomalyPlatform"
  }
}

# ── Lambda Integration ────────────────────────────────────────────────────────
resource "aws_apigatewayv2_integration" "lambda" {
  api_id                 = aws_apigatewayv2_api.infraviz.id
  integration_type       = "AWS_PROXY"
  integration_uri        = var.lambda_invoke_arn
  payload_format_version = "2.0"
  timeout_milliseconds   = 29000
}

# ── Catch-all Route → Lambda ──────────────────────────────────────────────────
resource "aws_apigatewayv2_route" "proxy" {
  api_id    = aws_apigatewayv2_api.infraviz.id
  route_key = "$default"
  target    = "integrations/${aws_apigatewayv2_integration.lambda.id}"
}

# ── Deployment Stage ──────────────────────────────────────────────────────────
resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.infraviz.id
  name        = "$default"
  auto_deploy = true

  access_log_settings {
    destination_arn = aws_cloudwatch_log_group.api_access.arn
    format = jsonencode({
      requestId      = "$context.requestId"
      sourceIp       = "$context.identity.sourceIp"
      requestTime    = "$context.requestTime"
      protocol       = "$context.protocol"
      httpMethod     = "$context.httpMethod"
      resourcePath   = "$context.resourcePath"
      routeKey       = "$context.routeKey"
      status         = "$context.status"
      responseLength = "$context.responseLength"
      integrationLatency = "$context.integrationLatency"
    })
  }

  tags = {
    Name        = "${local.api_name}-stage"
    Environment = var.environment
    Owner       = "TeamPanchayat"
    CostCenter  = "ADLC-Sprint01"
    Project     = "CostAnomalyPlatform"
  }
}
