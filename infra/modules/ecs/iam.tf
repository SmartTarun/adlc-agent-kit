# Agent: Vikram | Sprint: 01 | Date: 2026-03-14
# Terraform ECS Module — IAM Roles & Policies

# ── ECS Task Execution Role (pulls images, writes logs) ───────────────────────
resource "aws_iam_role" "ecs_execution" {
  name = "${var.cluster_name}-execution-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "ecs-tasks.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })

  tags = merge(var.tags, {
    Environment = var.environment
    Name        = "${var.cluster_name}-execution-role"
  })
}

resource "aws_iam_role_policy_attachment" "ecs_execution_managed" {
  role       = aws_iam_role.ecs_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

# Allow reading SSM SecureString parameters (API keys)
resource "aws_iam_role_policy" "ecs_execution_ssm" {
  name = "${var.cluster_name}-ssm-read"
  role = aws_iam_role.ecs_execution.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["ssm:GetParameters", "ssm:GetParameter"]
        Resource = [
          "arn:aws:ssm:${var.aws_region}:*:parameter/panchayat/*",
        ]
      },
      {
        Effect   = "Allow"
        Action   = ["kms:Decrypt"]
        Resource = ["*"]
        Condition = {
          StringEquals = { "kms:ViaService" = "ssm.${var.aws_region}.amazonaws.com" }
        }
      },
    ]
  })
}

# ── ECS Task Role (runtime permissions for each agent) ────────────────────────
resource "aws_iam_role" "ecs_task" {
  name = "${var.cluster_name}-task-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "ecs-tasks.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })

  tags = merge(var.tags, {
    Environment = var.environment
    Name        = "${var.cluster_name}-task-role"
  })
}

# Allow agents to read/write the workspace S3 bucket
resource "aws_iam_role_policy" "ecs_task_s3" {
  name = "${var.cluster_name}-s3-workspace"
  role = aws_iam_role.ecs_task.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = ["s3:GetObject","s3:PutObject","s3:DeleteObject","s3:ListBucket"]
        Resource = [
          aws_s3_bucket.workspace.arn,
          "${aws_s3_bucket.workspace.arn}/*",
        ]
      },
    ]
  })
}

# Allow agents to write CloudWatch logs
resource "aws_iam_role_policy" "ecs_task_logs" {
  name = "${var.cluster_name}-cloudwatch-logs"
  role = aws_iam_role.ecs_task.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "logs:CreateLogGroup",
        "logs:CreateLogStream",
        "logs:PutLogEvents",
        "logs:DescribeLogStreams",
      ]
      Resource = "arn:aws:logs:${var.aws_region}:*:log-group:/panchayat/*"
    }]
  })
}

# Allow Vikram specifically to run Terraform (broader S3, DynamoDB, EC2 etc.)
resource "aws_iam_role" "ecs_task_vikram" {
  name = "${var.cluster_name}-vikram-task-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "ecs-tasks.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })

  tags = merge(var.tags, {
    Environment = var.environment
    Name        = "${var.cluster_name}-vikram-task-role"
    Agent       = "vikram"
  })
}

resource "aws_iam_role_policy_attachment" "vikram_terraform" {
  role       = aws_iam_role.ecs_task_vikram.name
  # PowerUserAccess for Terraform operations (scope down for production)
  policy_arn = "arn:aws:iam::aws:policy/PowerUserAccess"
}
