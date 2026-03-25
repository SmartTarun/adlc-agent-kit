# Agent: vikram | Sprint: 01 | Date: 2026-03-16
# Terraform CloudWatch Module — Outputs

output "api_gateway_log_group_name" {
  description = "API Gateway CloudWatch log group name — pass to API Gateway stage settings"
  value       = aws_cloudwatch_log_group.api_gateway.name
}

output "api_gateway_log_group_arn" {
  description = "API Gateway CloudWatch log group ARN"
  value       = aws_cloudwatch_log_group.api_gateway.arn
}

output "lambda_log_group_name" {
  description = "Lambda CloudWatch log group name"
  value       = aws_cloudwatch_log_group.lambda.name
}

output "lambda_log_group_arn" {
  description = "Lambda CloudWatch log group ARN — include in Lambda execution role policy"
  value       = aws_cloudwatch_log_group.lambda.arn
}

output "application_log_group_name" {
  description = "Application CloudWatch log group name"
  value       = aws_cloudwatch_log_group.application.name
}

output "dashboard_url" {
  description = "CloudWatch dashboard URL"
  value       = "https://${var.aws_region}.console.aws.amazon.com/cloudwatch/home?region=${var.aws_region}#dashboards:name=${aws_cloudwatch_dashboard.infraviz.dashboard_name}"
}
