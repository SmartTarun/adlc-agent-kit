# Agent: Vikram | Sprint: 01 | Date: 2026-03-14
# Terraform ECS Module — Outputs

output "cluster_id" {
  description = "ECS Cluster ID"
  value       = aws_ecs_cluster.panchayat.id
}

output "cluster_arn" {
  description = "ECS Cluster ARN"
  value       = aws_ecs_cluster.panchayat.arn
}

output "cluster_name" {
  description = "ECS Cluster name"
  value       = aws_ecs_cluster.panchayat.name
}

output "dashboard_url" {
  description = "Sprint board URL (ALB DNS or direct)"
  value       = var.enable_alb ? "http://${aws_lb.dashboard[0].dns_name}" : "Deploy with enable_alb=true to get a URL"
}

output "dashboard_service_arn" {
  description = "ARN of the dashboard ECS service"
  value       = aws_ecs_service.dashboard.id
}

output "agent_service_arns" {
  description = "Map of agent name -> ECS service ARN"
  value       = { for k, v in aws_ecs_service.agents : k => v.id }
}

output "workspace_bucket" {
  description = "S3 bucket name for shared agent workspace"
  value       = aws_s3_bucket.workspace.bucket
}

output "workspace_bucket_arn" {
  description = "S3 bucket ARN"
  value       = aws_s3_bucket.workspace.arn
}

output "cloudwatch_log_groups" {
  description = "Map of agent name -> CloudWatch log group name"
  value       = merge(
    { dashboard = aws_cloudwatch_log_group.dashboard.name },
    { for k, v in aws_cloudwatch_log_group.agents : k => v.name }
  )
}

output "execution_role_arn" {
  description = "ECS task execution role ARN"
  value       = aws_iam_role.ecs_execution.arn
}

output "task_role_arn" {
  description = "ECS task role ARN (standard agents)"
  value       = aws_iam_role.ecs_task.arn
}

output "vikram_task_role_arn" {
  description = "ECS task role ARN for Vikram (Terraform / PowerUser)"
  value       = aws_iam_role.ecs_task_vikram.arn
}

output "security_group_agent" {
  description = "Security group ID for agent tasks"
  value       = aws_security_group.agent_task.id
}

output "security_group_dashboard" {
  description = "Security group ID for dashboard task"
  value       = aws_security_group.dashboard_task.id
}

output "keerthi_task_definition_arn" {
  description = "Keerthi (QA) task definition ARN — start on demand when all agents are DONE"
  value       = aws_ecs_task_definition.agents["keerthi"].arn
}

output "summary" {
  description = "Human-readable deployment summary"
  value       = <<-EOT
    ══════════════════════════════════════════
     Team Panchayat — ECS Fargate Cluster
    ══════════════════════════════════════════
     Cluster   : ${aws_ecs_cluster.panchayat.name}
     Region    : ${var.aws_region}
     Env       : ${var.environment}
     Sprint    : ${var.sprint}
     Workspace : s3://${aws_s3_bucket.workspace.bucket}
     Dashboard : ${var.enable_alb ? "http://${aws_lb.dashboard[0].dns_name}" : "(ALB disabled)"}
    ══════════════════════════════════════════
  EOT
}
