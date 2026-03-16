# Agent: Vikram | Sprint: 01 | Date: 2026-03-16
# Terraform Lambda Module — Outputs

output "function_arn" {
  description = "Lambda function ARN"
  value       = aws_lambda_function.api.arn
}

output "function_name" {
  description = "Lambda function name"
  value       = aws_lambda_function.api.function_name
}

output "invoke_arn" {
  description = "Lambda invoke ARN — used by API Gateway integration"
  value       = aws_lambda_function.api.invoke_arn
}

output "security_group_id" {
  description = "Lambda security group ID (only set when vpc_id is provided)"
  value       = var.vpc_id != "" ? aws_security_group.lambda[0].id : ""
}
