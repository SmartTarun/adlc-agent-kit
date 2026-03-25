# Agent: Vikram | Sprint: 01 | Date: 2026-03-16
# Terraform Secrets Manager Module — INFRAVIZ
#
# Resources created:
#   - Secret: LLM API key (Anthropic or Azure OpenAI) — placeholder, value set manually
#   - Secret: Additional app secrets placeholder
#
# NOTE: DB master password secret is managed by RDS (rds_aurora module).
# Lambda retrieves DB credentials via rds_aurora.master_user_secret_arn.
# No hardcoded credentials — all values set via AWS Console or CLI after apply.

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
  secret_prefix = "infraviz/${var.environment}"
}

# ── LLM API Key Secret ────────────────────────────────────────────────────────
# Stores Anthropic API key (if NOT using Bedrock) or Azure OpenAI key.
# After `terraform apply`, set the value via:
#   aws secretsmanager put-secret-value \
#     --secret-id <llm_api_key_secret_arn output> \
#     --secret-string '{"api_key": "sk-..."}'
resource "aws_secretsmanager_secret" "llm_api_key" {
  name        = "${local.secret_prefix}/llm-api-key"
  description = "INFRAVIZ LLM API key (Anthropic or Azure OpenAI)"

  recovery_window_in_days = var.environment == "dev" ? 0 : 30

  tags = {
    Name        = "${local.name_prefix}-llm-api-key"
    Environment = var.environment
    Owner       = "TeamPanchayat"
    CostCenter  = "ADLC-01"
    Project     = "INFRAVIZ"
  }
}

resource "aws_secretsmanager_secret_version" "llm_api_key_placeholder" {
  secret_id     = aws_secretsmanager_secret.llm_api_key.id
  secret_string = jsonencode({ api_key = "REPLACE_ME_AFTER_APPLY" })

  lifecycle {
    # Prevent Terraform from resetting the value on subsequent applies
    ignore_changes = [secret_string]
  }
}

# ── App Config Secret ─────────────────────────────────────────────────────────
# Stores miscellaneous app-level config that shouldn't be in env vars.
resource "aws_secretsmanager_secret" "app_config" {
  name        = "${local.secret_prefix}/app-config"
  description = "INFRAVIZ application configuration secrets"

  recovery_window_in_days = var.environment == "dev" ? 0 : 30

  tags = {
    Name        = "${local.name_prefix}-app-config"
    Environment = var.environment
    Owner       = "TeamPanchayat"
    CostCenter  = "ADLC-01"
    Project     = "INFRAVIZ"
  }
}

resource "aws_secretsmanager_secret_version" "app_config_placeholder" {
  secret_id     = aws_secretsmanager_secret.app_config.id
  secret_string = jsonencode({ jwt_secret = "REPLACE_ME_AFTER_APPLY" })

  lifecycle {
    ignore_changes = [secret_string]
  }
}
