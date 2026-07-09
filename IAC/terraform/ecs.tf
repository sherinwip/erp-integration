resource "aws_ecs_cluster" "main" {
  name = "${var.project_name}-cluster"
}

resource "aws_security_group" "ecs_tasks" {
  name        = "${var.project_name}-ecs-sg"
  description = "Allow traffic from ALB to the config-api container"
  vpc_id      = data.aws_vpc.default.id

  ingress {
    from_port       = var.container_port
    to_port         = var.container_port
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_security_group_rule" "rds_from_ecs_tasks" {
  type                     = "ingress"
  from_port                = 5432
  to_port                  = 5432
  protocol                 = "tcp"
  security_group_id        = aws_security_group.rds.id
  source_security_group_id = aws_security_group.ecs_tasks.id
}

resource "aws_cloudwatch_log_group" "config_api" {
  name              = "/ecs/${var.project_name}"
  retention_in_days = 14
}

resource "aws_ecs_task_definition" "config_api" {
  family                   = var.project_name
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = "256"
  memory                   = "512"
  execution_role_arn       = aws_iam_role.ecs_execution.arn
  task_role_arn             = aws_iam_role.ecs_task.arn

  container_definitions = jsonencode([
    {
      name      = var.project_name
      image     = "${aws_ecr_repository.config_api.repository_url}:latest"
      essential = true
      portMappings = [
        { containerPort = var.container_port, protocol = "tcp" }
      ]
      secrets = [
        { name = "DB_HOST", valueFrom = "${aws_secretsmanager_secret.db_credentials.arn}:host::" },
        { name = "DB_PORT", valueFrom = "${aws_secretsmanager_secret.db_credentials.arn}:port::" },
        { name = "DB_NAME", valueFrom = "${aws_secretsmanager_secret.db_credentials.arn}:dbname::" },
        { name = "DB_USER", valueFrom = "${aws_secretsmanager_secret.db_credentials.arn}:username::" },
        { name = "DB_PASSWORD", valueFrom = "${aws_secretsmanager_secret.db_credentials.arn}:password::" },
      ]
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.config_api.name
          "awslogs-region"        = var.aws_region
          "awslogs-stream-prefix" = "ecs"
        }
      }
    }
  ])
}

resource "aws_ecs_service" "config_api" {
  name            = var.project_name
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.config_api.arn
  desired_count   = 1
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = data.aws_subnets.default.ids
    security_groups  = [aws_security_group.ecs_tasks.id]
    assign_public_ip = true
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.config_api.arn
    container_name    = var.project_name
    container_port    = var.container_port
  }

  depends_on = [aws_lb_listener.config_api]
}
