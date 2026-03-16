# Agent: Vikram | Sprint: 01 | Date: 2026-03-16
# Terraform Secrets Manager Module — Outputs

output "llm_api_key_secret_arn" {
  description = "ARN of the LLM API key secret — pass to Lambda env vars or IAM policy"
  value       = aws_secretsmanager_secret.llm_api_key.arn
}

output "llm_api_key_secret_name" {
  description = "Name of the LLM API key secret"
  value       = aws_secretsmanager_secret.llm_api_key.name
}

output "app_config_secret_arn" {
  description = "ARN of the app config secret"
  value       = aws_secretsmanager_secret.app_config.arn
}
