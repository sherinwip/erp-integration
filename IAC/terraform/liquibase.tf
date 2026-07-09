resource "aws_ecr_repository" "liquibase_runner" {
  name                 = "${var.project_name}-liquibase-runner"
  image_tag_mutability = "MUTABLE"
}

resource "aws_security_group" "liquibase_task" {
  name        = "${var.project_name}-liquibase-sg"
  description = "One-off task that migrates RDS via Liquibase"
  vpc_id      = data.aws_vpc.default.id

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_security_group_rule" "rds_from_liquibase_task" {
  type                     = "ingress"
  from_port                = 5432
  to_port                  = 5432
  protocol                 = "tcp"
  security_group_id        = aws_security_group.rds.id
  source_security_group_id = aws_security_group.liquibase_task.id
}

resource "aws_cloudwatch_log_group" "liquibase" {
  name              = "/ecs/${var.project_name}-liquibase"
  retention_in_days = 14
}

resource "aws_ecs_task_definition" "liquibase" {
  family                   = "${var.project_name}-liquibase"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = "256"
  memory                   = "512"
  execution_role_arn       = aws_iam_role.ecs_execution.arn

  container_definitions = jsonencode([
    {
      name      = "liquibase-runner"
      image     = "${aws_ecr_repository.liquibase_runner.repository_url}:latest"
      essential = true
      environment = [
        { name = "LB_URL", value = "jdbc:postgresql://${aws_db_instance.config_db.address}:${aws_db_instance.config_db.port}/${var.db_name}" }
      ]
      secrets = [
        { name = "LB_USERNAME", valueFrom = "${aws_secretsmanager_secret.db_credentials.arn}:username::" },
        { name = "LB_PASSWORD", valueFrom = "${aws_secretsmanager_secret.db_credentials.arn}:password::" },
      ]
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.liquibase.name
          "awslogs-region"        = var.aws_region
          "awslogs-stream-prefix" = "ecs"
        }
      }
    }
  ])
}
