# Agent: Vikram | Sprint: 01 | Date: 2026-03-16
# Terraform IAM Module — INFRAVIZ
#
# Resources created:
#   - Lambda execution role (CloudWatch Logs, VPC network interface, X-Ray)
#   - Inline policy: AWS Bedrock InvokeModel (Claude)
#   - Inline policy: S3 state bucket read/write
#   - Inline policy: Secrets Manager read (DB creds + API keys)
#   - Inline policy: SSM Parameter Store read

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
}

data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

# ── Lambda Execution Role ─────────────────────────────────────────────────────
resource "aws_iam_role" "lambda_exec" {
  name = "${local.name_prefix}-lambda-exec"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })

  tags = {
    Name        = "${local.name_prefix}-lambda-exec"
    Environment = var.environment
    Owner       = "TeamPanchayat"
    CostCenter  = "ADLC-01"
    Project     = "INFRAVIZ"
  }
}

# Attach AWS-managed basic Lambda execution policy (CloudWatch Logs)
resource "aws_iam_role_policy_attachment" "lambda_basic" {
  role       = aws_iam_role.lambda_exec.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

# VPC network interface (needed if Lambda is placed inside a VPC)
resource "aws_iam_role_policy_attachment" "lambda_vpc" {
  count      = var.lambda_in_vpc ? 1 : 0
  role       = aws_iam_role.lambda_exec.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole"
}

# X-Ray tracing
resource "aws_iam_role_policy_attachment" "lambda_xray" {
  role       = aws_iam_role.lambda_exec.name
  policy_arn = "arn:aws:iam::aws:policy/AWSXRayDaemonWriteAccess"
}

# ── Bedrock InvokeModel Policy ────────────────────────────────────────────────
resource "aws_iam_role_policy" "bedrock" {
  name = "${local.name_prefix}-bedrock-invoke"
  role = aws_iam_role.lambda_exec.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "BedrockInvokeModel"
        Effect = "Allow"
        Action = [
          "bedrock:InvokeModel",
          "bedrock:InvokeModelWithResponseStream"
        ]
        Resource = [
          "arn:aws:bedrock:${data.aws_region.current.name}::foundation-model/anthropic.claude-sonnet-4-6-*",
          "arn:aws:bedrock:${data.aws_region.current.name}::foundation-model/anthropic.claude-*"
        ]
      }
    ]
  })
}

# ── S3 State Bucket Policy ────────────────────────────────────────────────────
resource "aws_iam_role_policy" "s3_state" {
  name = "${local.name_prefix}-s3-state"
  role = aws_iam_role.lambda_exec.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "StateBucketReadWrite"
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:PutObject",
          "s3:DeleteObject",
          "s3:ListBucket",
          "s3:GetObjectVersion"
        ]
        Resource = [
          "arn:aws:s3:::${var.state_bucket_name}",
          "arn:aws:s3:::${var.state_bucket_name}/*"
        ]
      }
    ]
  })
}

# ── Secrets Manager Read Policy ───────────────────────────────────────────────
resource "aws_iam_role_policy" "secrets" {
  name = "${local.name_prefix}-secrets-read"
  role = aws_iam_role.lambda_exec.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "SecretsManagerRead"
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue",
          "secretsmanager:DescribeSecret"
        ]
        Resource = [
          "arn:aws:secretsmanager:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:secret:infraviz/${var.environment}/*"
        ]
      }
    ]
  })
}

# ── SSM Parameter Store Read Policy ──────────────────────────────────────────
resource "aws_iam_role_policy" "ssm" {
  name = "${local.name_prefix}-ssm-read"
  role = aws_iam_role.lambda_exec.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "SSMParameterRead"
        Effect = "Allow"
        Action = [
          "ssm:GetParameter",
          "ssm:GetParameters",
          "ssm:GetParametersByPath"
        ]
        Resource = [
          "arn:aws:ssm:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:parameter/infraviz/${var.environment}/*"
        ]
      },
      {
        Sid      = "SSMDecryptKMS"
        Effect   = "Allow"
        Action   = ["kms:Decrypt"]
        Resource = ["arn:aws:kms:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:key/*"]
        Condition = {
          StringEquals = {
            "kms:ViaService" = "ssm.${data.aws_region.current.name}.amazonaws.com"
          }
        }
      }
    ]
  })
}
