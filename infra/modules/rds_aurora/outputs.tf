# Agent: Vikram | Sprint: 01 | Date: 2026-03-16
# Terraform RDS Aurora Module — Outputs

output "cluster_endpoint" {
  description = "Writer endpoint for the Aurora cluster"
  value       = aws_rds_cluster.aurora.endpoint
}

output "cluster_reader_endpoint" {
  description = "Reader endpoint for the Aurora cluster"
  value       = aws_rds_cluster.aurora.reader_endpoint
}

output "cluster_id" {
  description = "Aurora cluster identifier"
  value       = aws_rds_cluster.aurora.cluster_identifier
}

output "cluster_arn" {
  description = "Aurora cluster ARN"
  value       = aws_rds_cluster.aurora.arn
}

output "database_name" {
  description = "Database name"
  value       = aws_rds_cluster.aurora.database_name
}

output "master_username" {
  description = "Master username"
  value       = aws_rds_cluster.aurora.master_username
  sensitive   = true
}

output "security_group_id" {
  description = "Aurora security group ID — reference in Lambda module's allowed_security_group_ids"
  value       = aws_security_group.aurora.id
}

output "master_user_secret_arn" {
  description = "ARN of the Secrets Manager secret storing the master password (managed by RDS)"
  value       = aws_rds_cluster.aurora.master_user_secret[0].secret_arn
}
