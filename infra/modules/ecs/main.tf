# Agent: Vikram | Sprint: 01 | Date: 2026-03-14
# Terraform ECS Module — Team Panchayat cluster on AWS ECS Fargate
#
# Resources created:
#   - ECS Cluster
#   - ECS Task Definitions + Services for all 7 agents + dashboard
#   - Application Load Balancer (dashboard)
#   - CloudWatch Log Groups
#   - S3 bucket (shared workspace)
#   - ECR repositories
#   - Security Groups

terraform {
  required_version = ">= 1.7"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 5.0"
    }
  }

  # S3 + DynamoDB backend — configure via backend.tf in root module
  # backend "s3" {
  #   bucket         = "panchayat-tfstate"
  #   key            = "ecs/terraform.tfstate"
  #   region         = "us-east-1"
  #   dynamodb_table = "panchayat-tfstate-lock"
  #   encrypt        = true
  # }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = merge(var.tags, {
      Environment = var.environment
      ManagedBy   = "Terraform"
    })
  }
}

locals {
  name_prefix = "${var.cluster_name}-${var.environment}"

  agents = ["arjun", "vikram", "rasool", "kavya", "kiran", "rohan", "keerthi"]

  # Per-agent CPU & memory overrides
  agent_sizes = {
    arjun   = { cpu = 1024, memory = 2048 }  # Opus needs more headroom
    vikram  = { cpu = 1024, memory = 2048 }
    rasool  = { cpu = 512,  memory = 1024 }
    kavya   = { cpu = 512,  memory = 1024 }
    kiran   = { cpu = 1024, memory = 2048 }
    rohan   = { cpu = 1024, memory = 2048 }
    keerthi = { cpu = 512,  memory = 1024 }
  }
}

# ── ECS Cluster ───────────────────────────────────────────────────────────────
resource "aws_ecs_cluster" "panchayat" {
  name = local.name_prefix

  setting {
    name  = "containerInsights"
    value = "enabled"
  }

  tags = {
    Name = local.name_prefix
  }
}

resource "aws_ecs_cluster_capacity_providers" "panchayat" {
  cluster_name       = aws_ecs_cluster.panchayat.name
  capacity_providers = ["FARGATE", "FARGATE_SPOT"]

  default_capacity_provider_strategy {
    base              = 1
    weight            = 100
    capacity_provider = "FARGATE"
  }
}

# ── S3 Workspace Bucket (shared filesystem equivalent) ────────────────────────
resource "aws_s3_bucket" "workspace" {
  bucket = "${local.name_prefix}-workspace"

  tags = {
    Name    = "${local.name_prefix}-workspace"
    Purpose = "agent-shared-workspace"
  }
}

resource "aws_s3_bucket_versioning" "workspace" {
  bucket = aws_s3_bucket.workspace.id
  versioning_configuration { status = "Enabled" }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "workspace" {
  bucket = aws_s3_bucket.workspace.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "aws:kms"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "workspace" {
  bucket                  = aws_s3_bucket.workspace.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# ── CloudWatch Log Groups ─────────────────────────────────────────────────────
resource "aws_cloudwatch_log_group" "dashboard" {
  name              = "/panchayat/${var.environment}/dashboard"
  retention_in_days = 14
}

resource "aws_cloudwatch_log_group" "agents" {
  for_each          = toset(local.agents)
  name              = "/panchayat/${var.environment}/${each.key}"
  retention_in_days = 14
}

# ── Security Groups ───────────────────────────────────────────────────────────
resource "aws_security_group" "alb" {
  name        = "${local.name_prefix}-alb-sg"
  description = "Allow HTTP/HTTPS to the dashboard ALB"
  vpc_id      = var.vpc_id

  ingress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
    description = "HTTP"
  }

  dynamic "ingress" {
    for_each = var.certificate_arn != "" ? [1] : []
    content {
      from_port   = 443
      to_port     = 443
      protocol    = "tcp"
      cidr_blocks = ["0.0.0.0/0"]
      description = "HTTPS"
    }
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
    description = "All outbound"
  }

  tags = { Name = "${local.name_prefix}-alb-sg" }
}

resource "aws_security_group" "dashboard_task" {
  name        = "${local.name_prefix}-dashboard-sg"
  description = "Dashboard ECS task security group"
  vpc_id      = var.vpc_id

  ingress {
    from_port       = var.dashboard_port
    to_port         = var.dashboard_port
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
    description     = "ALB to dashboard"
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
    description = "All outbound"
  }

  tags = { Name = "${local.name_prefix}-dashboard-sg" }
}

resource "aws_security_group" "agent_task" {
  name        = "${local.name_prefix}-agent-sg"
  description = "Agent ECS tasks security group"
  vpc_id      = var.vpc_id

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
    description = "All outbound (agents need internet for Anthropic API)"
  }

  tags = { Name = "${local.name_prefix}-agent-sg" }
}

# ── Application Load Balancer (Dashboard) ────────────────────────────────────
resource "aws_lb" "dashboard" {
  count              = var.enable_alb ? 1 : 0
  name               = "${local.name_prefix}-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = var.public_subnet_ids

  tags = { Name = "${local.name_prefix}-alb" }
}

resource "aws_lb_target_group" "dashboard" {
  count       = var.enable_alb ? 1 : 0
  name        = "${local.name_prefix}-dashboard-tg"
  port        = var.dashboard_port
  protocol    = "HTTP"
  vpc_id      = var.vpc_id
  target_type = "ip"

  health_check {
    path                = "/health"
    healthy_threshold   = 2
    unhealthy_threshold = 3
    interval            = 15
    timeout             = 5
    matcher             = "200"
  }

  tags = { Name = "${local.name_prefix}-dashboard-tg" }
}

resource "aws_lb_listener" "http" {
  count             = var.enable_alb ? 1 : 0
  load_balancer_arn = aws_lb.dashboard[0].arn
  port              = 80
  protocol          = "HTTP"

  dynamic "default_action" {
    for_each = var.certificate_arn != "" ? [1] : []
    content {
      type = "redirect"
      redirect {
        port        = "443"
        protocol    = "HTTPS"
        status_code = "HTTP_301"
      }
    }
  }

  dynamic "default_action" {
    for_each = var.certificate_arn == "" ? [1] : []
    content {
      type             = "forward"
      target_group_arn = aws_lb_target_group.dashboard[0].arn
    }
  }
}

resource "aws_lb_listener" "https" {
  count             = var.enable_alb && var.certificate_arn != "" ? 1 : 0
  load_balancer_arn = aws_lb.dashboard[0].arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = var.certificate_arn

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.dashboard[0].arn
  }
}

# ── Dashboard Task Definition ─────────────────────────────────────────────────
resource "aws_ecs_task_definition" "dashboard" {
  family                   = "${local.name_prefix}-dashboard"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.dashboard_cpu
  memory                   = var.dashboard_memory
  execution_role_arn       = aws_iam_role.ecs_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  container_definitions = jsonencode([{
    name      = "dashboard"
    image     = "${var.ecr_repository_url}:dashboard-${var.dashboard_image_tag}"
    essential = true

    portMappings = [{
      containerPort = var.dashboard_port
      protocol      = "tcp"
    }]

    environment = [
      { name = "PORT",             value = tostring(var.dashboard_port) },
      { name = "WORKSPACE",        value = "/workspace" },
      { name = "S3_WORKSPACE",     value = aws_s3_bucket.workspace.bucket },
      { name = "AWS_REGION",       value = var.aws_region },
    ]

    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = aws_cloudwatch_log_group.dashboard.name
        "awslogs-region"        = var.aws_region
        "awslogs-stream-prefix" = "dashboard"
      }
    }

    healthCheck = {
      command     = ["CMD-SHELL", "wget -qO- http://localhost:${var.dashboard_port}/health || exit 1"]
      interval    = 15
      timeout     = 5
      retries     = 3
      startPeriod = 10
    }
  }])

  tags = { Name = "${local.name_prefix}-dashboard" }
}

resource "aws_ecs_service" "dashboard" {
  name            = "${local.name_prefix}-dashboard"
  cluster         = aws_ecs_cluster.panchayat.id
  task_definition = aws_ecs_task_definition.dashboard.arn
  desired_count   = 1
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = var.private_subnet_ids
    security_groups  = [aws_security_group.dashboard_task.id]
    assign_public_ip = false
  }

  dynamic "load_balancer" {
    for_each = var.enable_alb ? [1] : []
    content {
      target_group_arn = aws_lb_target_group.dashboard[0].arn
      container_name   = "dashboard"
      container_port   = var.dashboard_port
    }
  }

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  tags = { Name = "${local.name_prefix}-dashboard" }
}

# ── Agent Task Definitions ────────────────────────────────────────────────────
resource "aws_ecs_task_definition" "agents" {
  for_each = toset(local.agents)

  family                   = "${local.name_prefix}-${each.key}"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = local.agent_sizes[each.key].cpu
  memory                   = local.agent_sizes[each.key].memory
  execution_role_arn       = aws_iam_role.ecs_execution.arn
  task_role_arn            = each.key == "vikram" ? aws_iam_role.ecs_task_vikram.arn : aws_iam_role.ecs_task.arn

  container_definitions = jsonencode([{
    name      = each.key
    image     = "${var.ecr_repository_url}:agent-${var.agent_image_tag}"
    essential = true

    environment = [
      { name = "AGENT_NAME",                        value = each.key },
      { name = "WORKSPACE",                         value = "/workspace" },
      { name = "S3_WORKSPACE",                      value = aws_s3_bucket.workspace.bucket },
      { name = "AWS_REGION",                        value = var.aws_region },
      { name = "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS", value = "1" },
      { name = "CLAUDE_MODEL", value = each.key == "arjun" ? "claude-opus-4-5" : "claude-sonnet-4-5" },
    ]

    secrets = [{
      name      = "ANTHROPIC_API_KEY"
      valueFrom = "arn:aws:ssm:${var.aws_region}:*:parameter${var.anthropic_api_key_ssm_path}"
    }]

    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = aws_cloudwatch_log_group.agents[each.key].name
        "awslogs-region"        = var.aws_region
        "awslogs-stream-prefix" = each.key
      }
    }

    healthCheck = {
      command     = ["CMD-SHELL", "node -e \"const fs=require('fs');process.exit(0)\" || exit 1"]
      interval    = 30
      timeout     = 10
      retries     = 3
      startPeriod = 120
    }
  }])

  tags = {
    Name  = "${local.name_prefix}-${each.key}"
    Agent = each.key
  }
}

# ── Agent ECS Services ────────────────────────────────────────────────────────
resource "aws_ecs_service" "agents" {
  # Keerthi is deployed on-demand, not as a persistent service
  for_each = toset([for a in local.agents : a if a != "keerthi"])

  name            = "${local.name_prefix}-${each.key}"
  cluster         = aws_ecs_cluster.panchayat.id
  task_definition = aws_ecs_task_definition.agents[each.key].arn
  desired_count   = 1
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = var.private_subnet_ids
    security_groups  = [aws_security_group.agent_task.id]
    assign_public_ip = false
  }

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  # Agents depend on the dashboard being healthy
  depends_on = [aws_ecs_service.dashboard]

  tags = {
    Name  = "${local.name_prefix}-${each.key}"
    Agent = each.key
  }
}

# ── ECR Lifecycle Policies ────────────────────────────────────────────────────
resource "aws_ecr_lifecycle_policy" "agent" {
  repository = split("/", var.ecr_repository_url)[1]

  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Keep last 10 agent images"
      selection = {
        tagStatus   = "any"
        countType   = "imageCountMoreThan"
        countNumber = 10
      }
      action = { type = "expire" }
    }]
  })
}
