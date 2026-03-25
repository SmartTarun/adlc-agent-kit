# Agent: vikram | Sprint: 01 | Date: 2026-03-16
# Terraform CloudWatch Module — INFRAVIZ
#
# Resources created:
#   - Log groups: API Gateway, Lambda, application
#   - Metric alarms: Lambda errors, API Gateway 5xx, RDS connections
#   - CloudWatch dashboard for INFRAVIZ

terraform {
  required_version = ">= 1.7"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Environment = var.environment
      Owner       = "TeamPanchayat"
      CostCenter  = "ADLC-Sprint01"
      Project     = "CostAnomalyPlatform"
      ManagedBy   = "Terraform"
    }
  }
}

locals {
  name_prefix = "infraviz-${var.environment}"
}

# ── Log Groups ────────────────────────────────────────────────────────────────
resource "aws_cloudwatch_log_group" "api_gateway" {
  name              = "/aws/apigateway/${local.name_prefix}"
  retention_in_days = var.log_retention_days

  tags = { Name = "${local.name_prefix}-apigw-logs" }
}

resource "aws_cloudwatch_log_group" "lambda" {
  name              = "/aws/lambda/${local.name_prefix}-iac-generator"
  retention_in_days = var.log_retention_days

  tags = { Name = "${local.name_prefix}-lambda-logs" }
}

resource "aws_cloudwatch_log_group" "application" {
  name              = "/infraviz/${var.environment}/application"
  retention_in_days = var.log_retention_days

  tags = { Name = "${local.name_prefix}-app-logs" }
}

# ── Metric Alarms ─────────────────────────────────────────────────────────────
resource "aws_cloudwatch_metric_alarm" "lambda_errors" {
  alarm_name          = "${local.name_prefix}-lambda-errors"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  metric_name         = "Errors"
  namespace           = "AWS/Lambda"
  period              = 60
  statistic           = "Sum"
  threshold           = var.lambda_error_threshold
  alarm_description   = "Lambda function error count above threshold"
  treat_missing_data  = "notBreaching"

  dimensions = {
    FunctionName = "${local.name_prefix}-iac-generator"
  }

  tags = { Name = "${local.name_prefix}-lambda-errors-alarm" }
}

resource "aws_cloudwatch_metric_alarm" "api_gateway_5xx" {
  alarm_name          = "${local.name_prefix}-apigw-5xx"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  metric_name         = "5XXError"
  namespace           = "AWS/ApiGateway"
  period              = 60
  statistic           = "Sum"
  threshold           = var.api_5xx_threshold
  alarm_description   = "API Gateway 5xx errors above threshold"
  treat_missing_data  = "notBreaching"

  dimensions = {
    ApiName = "${local.name_prefix}-api"
  }

  tags = { Name = "${local.name_prefix}-apigw-5xx-alarm" }
}

resource "aws_cloudwatch_metric_alarm" "rds_connections" {
  alarm_name          = "${local.name_prefix}-rds-connections"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 2
  metric_name         = "DatabaseConnections"
  namespace           = "AWS/RDS"
  period              = 60
  statistic           = "Maximum"
  threshold           = var.rds_connection_threshold
  alarm_description   = "RDS connection count above threshold"
  treat_missing_data  = "notBreaching"

  dimensions = {
    DBClusterIdentifier = "${local.name_prefix}-aurora"
  }

  tags = { Name = "${local.name_prefix}-rds-connections-alarm" }
}

# ── Dashboard ─────────────────────────────────────────────────────────────────
resource "aws_cloudwatch_dashboard" "infraviz" {
  dashboard_name = "${local.name_prefix}-dashboard"

  dashboard_body = jsonencode({
    widgets = [
      {
        type   = "metric"
        x      = 0
        y      = 0
        width  = 12
        height = 6
        properties = {
          title  = "Lambda Invocations & Errors"
          region = var.aws_region
          metrics = [
            ["AWS/Lambda", "Invocations", "FunctionName", "${local.name_prefix}-iac-generator"],
            ["AWS/Lambda", "Errors", "FunctionName", "${local.name_prefix}-iac-generator"]
          ]
          period = 60
          stat   = "Sum"
          view   = "timeSeries"
        }
      },
      {
        type   = "metric"
        x      = 12
        y      = 0
        width  = 12
        height = 6
        properties = {
          title  = "API Gateway Requests & 5xx Errors"
          region = var.aws_region
          metrics = [
            ["AWS/ApiGateway", "Count", "ApiName", "${local.name_prefix}-api"],
            ["AWS/ApiGateway", "5XXError", "ApiName", "${local.name_prefix}-api"]
          ]
          period = 60
          stat   = "Sum"
          view   = "timeSeries"
        }
      },
      {
        type   = "metric"
        x      = 0
        y      = 6
        width  = 12
        height = 6
        properties = {
          title  = "RDS Aurora Connections & Latency"
          region = var.aws_region
          metrics = [
            ["AWS/RDS", "DatabaseConnections", "DBClusterIdentifier", "${local.name_prefix}-aurora"],
            ["AWS/RDS", "CommitLatency", "DBClusterIdentifier", "${local.name_prefix}-aurora"]
          ]
          period = 60
          stat   = "Average"
          view   = "timeSeries"
        }
      },
      {
        type   = "metric"
        x      = 12
        y      = 6
        width  = 12
        height = 6
        properties = {
          title  = "Lambda Duration (p99)"
          region = var.aws_region
          metrics = [
            ["AWS/Lambda", "Duration", "FunctionName", "${local.name_prefix}-iac-generator", { stat = "p99" }]
          ]
          period = 60
          view   = "timeSeries"
        }
      }
    ]
  })
}
