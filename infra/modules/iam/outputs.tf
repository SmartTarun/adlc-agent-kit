# Agent: Vikram | Sprint: 01 | Date: 2026-03-16
# Terraform IAM Module — Outputs

output "lambda_exec_role_arn" {
  description = "ARN of the Lambda execution IAM role — pass to the lambda module"
  value       = aws_iam_role.lambda_exec.arn
}

output "lambda_exec_role_name" {
  description = "Name of the Lambda execution IAM role"
  value       = aws_iam_role.lambda_exec.name
}
