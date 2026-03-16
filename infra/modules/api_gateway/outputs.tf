# Agent: Vikram | Sprint: 01 | Date: 2026-03-16
# Terraform API Gateway Module — Outputs

output "api_endpoint" {
  description = "HTTP API endpoint URL"
  value       = aws_apigatewayv2_stage.default.invoke_url
}

output "api_id" {
  description = "HTTP API ID"
  value       = aws_apigatewayv2_api.infraviz.id
}

output "execution_arn" {
  description = "API Gateway execution ARN — pass to lambda module for invoke permission"
  value       = aws_apigatewayv2_api.infraviz.execution_arn
}
