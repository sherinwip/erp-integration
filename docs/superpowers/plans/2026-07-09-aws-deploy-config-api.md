# erp-config-api AWS Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deploy `erp-config-api` to AWS (ECS Fargate + RDS Postgres + ALB) via Terraform, with the Liquibase changelog applied to RDS via a one-off ECS task, on branch `feature/aws-deploy-config-api`.

**Architecture:** Terraform provisions RDS Postgres 16, an ECR repo, an ECS Fargate cluster/service/task for `erp-config-api`, a one-off Fargate task definition for Liquibase, an internet-facing ALB, security groups, IAM roles, and a Secrets Manager secret holding DB credentials. Two new Dockerfiles are added: one for `erp-config-api` (FastAPI/uvicorn), one for a liquibase-only runner (no embedded Postgres, unlike the existing `database/dockerfile`). Images are built and pushed to ECR outside Terraform (documented CLI steps). Liquibase is applied by running the one-off task once via `aws ecs run-task` before relying on the service.

**Tech Stack:** Terraform (AWS provider), Docker, ECS Fargate, RDS Postgres 16, ALB, ECR, Secrets Manager, Liquibase 5.0.3, FastAPI/uvicorn.

## Global Constraints

- Region: `us-east-1`.
- Network: default VPC, its existing public subnets (no new VPC).
- RDS: Postgres 16, `db.t4g.micro`, single-AZ, 20GB gp3, not publicly accessible, DB name `erp_integration` (matches `IAC/docker-compose.yml`).
- DB master credentials: Terraform `random_password`, stored in AWS Secrets Manager — never hardcoded, never in a `.env` committed to git.
- Compute: ECS Fargate, desired count 1, container port 8010 for `erp-config-api`.
- ALB: HTTP only (port 80), internet-facing. No HTTPS/ACM in this pass.
- Security groups: ALB SG (0.0.0.0/0 → 80) → ECS SG (ALB SG → 8010) → RDS SG (ECS SG + Liquibase task SG → 5432).
- All AWS resources tagged `Project=erp-integration`, `ManagedBy=terraform`.
- No CI/CD — `terraform apply` and `aws ecs run-task` are manual CLI steps.
- Do not modify `IAC/docker-compose.yml`, `erp-config-api/.env`, or any local dev workflow.
- Do not push the branch to remote unless explicitly asked.
- Spec: `docs/superpowers/specs/2026-07-09-aws-deploy-config-api-design.md`.

---

### Task 1: erp-config-api Dockerfile

**Files:**
- Create: `erp-config-api/Dockerfile`
- Create: `erp-config-api/.dockerignore`

**Interfaces:**
- Produces: a Docker image, run as `docker run -p 8010:8010 erp-config-api`, that serves the existing `app.main:app` FastAPI app on `0.0.0.0:8010`. Reads `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` from the process environment (already how `app/core/config.py` reads config — no code change needed).

- [ ] **Step 1: Write the Dockerfile**

```dockerfile
FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app

EXPOSE 8010

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8010"]
```

- [ ] **Step 2: Write .dockerignore**

```
.venv
__pycache__
*.pyc
.env
tests
postman
.pytest_cache
```

- [ ] **Step 3: Build the image locally**

Run: `cd erp-config-api && docker build -t erp-config-api:local .`
Expected: build completes, final line `Successfully tagged erp-config-api:local` (or buildkit equivalent "naming to docker.io/library/erp-config-api:local done").

- [ ] **Step 4: Run it against the local docker-compose Postgres and smoke test**

Run:
```bash
docker run --rm -d --name erp-config-api-test \
  --network host \
  -e DB_HOST=localhost -e DB_PORT=5432 -e DB_NAME=erp_integration \
  -e DB_USER=root -e DB_PASSWORD=root \
  erp-config-api:local
sleep 3
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8010/docs
curl -s http://localhost:8010/api/v1/clients
docker stop erp-config-api-test
```
Expected: `200` from `/docs`, and a JSON array of clients from `/api/v1/clients` (same data seen in the earlier local smoke test — `Avalon Test Client`, `Akima Test Client`, etc). If port 8010 is already in use by the locally-running uvicorn instance from earlier in this session, stop that process first (`kill <PID>` for the `uvicorn app.main:app --port 8010` process) or use a different host port mapping for this test only.

- [ ] **Step 5: Commit**

```bash
cd /Users/sherinmathew/repo/erp-integration
git add erp-config-api/Dockerfile erp-config-api/.dockerignore
git commit -m "Add Dockerfile for erp-config-api"
```

---

### Task 2: Liquibase-only runner Dockerfile (for RDS migration)

**Files:**
- Create: `database/Dockerfile.liquibase-runner`

**Interfaces:**
- Consumes: `database/drivers/postgresql-42.7.11.jar`, `database/liquibase/changelog/` (existing).
- Produces: a Docker image that, when run with env vars `LB_URL`, `LB_USERNAME`, `LB_PASSWORD`, executes `liquibase update` against that URL and exits (no embedded Postgres, unlike `database/dockerfile` which starts its own local Postgres server and is unsuitable for pointing at RDS).

- [ ] **Step 1: Write the Dockerfile**

```dockerfile
FROM eclipse-temurin:21-jre-jammy

RUN apt-get update && \
    apt-get install -y wget unzip && \
    rm -rf /var/lib/apt/lists/*

ENV LIQUIBASE_VERSION=5.0.3

RUN wget https://github.com/liquibase/liquibase/releases/download/v${LIQUIBASE_VERSION}/liquibase-${LIQUIBASE_VERSION}.zip \
    && unzip liquibase-${LIQUIBASE_VERSION}.zip -d /opt/liquibase \
    && rm liquibase-${LIQUIBASE_VERSION}.zip

ENV PATH="/opt/liquibase:${PATH}"

COPY drivers/postgresql-42.7.11.jar /opt/liquibase/lib/
COPY liquibase/changelog /opt/liquibase/migrations/changelog

WORKDIR /opt/liquibase/migrations

ENTRYPOINT liquibase \
  --changeLogFile=changelog/db.changelog-master.xml \
  --url="${LB_URL}" \
  --username="${LB_USERNAME}" \
  --password="${LB_PASSWORD}" \
  --driver=org.postgresql.Driver \
  update
```

- [ ] **Step 2: Build the image locally**

Run: `cd database && docker build -f Dockerfile.liquibase-runner -t liquibase-runner:local .`
Expected: build completes successfully.

- [ ] **Step 3: Test it against the local docker-compose Postgres**

Run:
```bash
docker run --rm --network host \
  -e LB_URL=jdbc:postgresql://localhost:5432/erp_integration \
  -e LB_USERNAME=root \
  -e LB_PASSWORD=root \
  liquibase-runner:local
```
Expected: output ends with `Liquibase: Update has been successful.` (or `UPDATE SUMMARY` with 0 changesets if already applied — confirms connectivity + changelog parsing work, since the local DB is already migrated).

- [ ] **Step 4: Commit**

```bash
cd /Users/sherinmathew/repo/erp-integration
git add database/Dockerfile.liquibase-runner
git commit -m "Add standalone Liquibase runner image for RDS migrations"
```

---

### Task 3: Terraform — providers, RDS, Secrets Manager

**Files:**
- Create: `IAC/terraform/versions.tf`
- Create: `IAC/terraform/variables.tf`
- Create: `IAC/terraform/network.tf`
- Create: `IAC/terraform/rds.tf`
- Create: `IAC/terraform/outputs.tf`

**Interfaces:**
- Produces: `aws_db_instance.config_db` (RDS endpoint), `aws_secretsmanager_secret.db_credentials` (ARN + JSON containing `host`, `port`, `dbname`, `username`, `password`), `data.aws_vpc.default`, `data.aws_subnets.default_public` — consumed by Task 4 (ECS/ECR) and Task 5 (ALB/SGs).

- [ ] **Step 1: Write versions.tf**

```hcl
terraform {
  required_version = ">= 1.5.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project   = "erp-integration"
      ManagedBy = "terraform"
    }
  }
}
```

- [ ] **Step 2: Write variables.tf**

```hcl
variable "aws_region" {
  type    = string
  default = "us-east-1"
}

variable "db_name" {
  type    = string
  default = "erp_integration"
}

variable "db_master_username" {
  type    = string
  default = "root"
}

variable "container_port" {
  type    = number
  default = 8010
}

variable "project_name" {
  type    = string
  default = "erp-config-api"
}
```

- [ ] **Step 3: Write network.tf (default VPC lookup)**

```hcl
data "aws_vpc" "default" {
  default = true
}

data "aws_subnets" "default" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.default.id]
  }
}
```

- [ ] **Step 4: Write rds.tf**

```hcl
resource "random_password" "db_master" {
  length  = 24
  special = false
}

resource "aws_db_subnet_group" "config_db" {
  name       = "${var.project_name}-db-subnets"
  subnet_ids = data.aws_subnets.default.ids
}

resource "aws_security_group" "rds" {
  name        = "${var.project_name}-rds-sg"
  description = "Allow Postgres from ECS tasks and the Liquibase runner task"
  vpc_id      = data.aws_vpc.default.id

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_db_instance" "config_db" {
  identifier             = "${var.project_name}-db"
  engine                 = "postgres"
  engine_version         = "16"
  instance_class         = "db.t4g.micro"
  allocated_storage      = 20
  storage_type           = "gp3"
  db_name                = var.db_name
  username               = var.db_master_username
  password               = random_password.db_master.result
  db_subnet_group_name   = aws_db_subnet_group.config_db.name
  vpc_security_group_ids = [aws_security_group.rds.id]
  publicly_accessible    = false
  multi_az               = false
  skip_final_snapshot    = true
}

resource "aws_secretsmanager_secret" "db_credentials" {
  name = "${var.project_name}-db-credentials"
}

resource "aws_secretsmanager_secret_version" "db_credentials" {
  secret_id = aws_secretsmanager_secret.db_credentials.id
  secret_string = jsonencode({
    host     = aws_db_instance.config_db.address
    port     = aws_db_instance.config_db.port
    dbname   = var.db_name
    username = var.db_master_username
    password = random_password.db_master.result
  })
}
```

- [ ] **Step 5: Write outputs.tf**

```hcl
output "rds_endpoint" {
  value = aws_db_instance.config_db.address
}

output "db_credentials_secret_arn" {
  value = aws_secretsmanager_secret.db_credentials.arn
}

output "default_vpc_id" {
  value = data.aws_vpc.default.id
}
```

- [ ] **Step 6: Init and validate**

Run:
```bash
cd IAC/terraform
terraform init
terraform validate
```
Expected: `terraform init` succeeds (downloads `aws` and `random` providers), `terraform validate` prints `Success! The configuration is valid.`

- [ ] **Step 7: Commit**

```bash
cd /Users/sherinmathew/repo/erp-integration
git add IAC/terraform/versions.tf IAC/terraform/variables.tf IAC/terraform/network.tf IAC/terraform/rds.tf IAC/terraform/outputs.tf
git commit -m "Add Terraform: RDS Postgres + Secrets Manager for erp-config-api"
```

---

### Task 4: Terraform — ECR repo

**Files:**
- Create: `IAC/terraform/ecr.tf`
- Modify: `IAC/terraform/outputs.tf`

**Interfaces:**
- Consumes: `var.project_name` (Task 3).
- Produces: `aws_ecr_repository.config_api.repository_url` — consumed by Task 5 (ECS task definition image reference) and by the manual `docker push` step.

- [ ] **Step 1: Write ecr.tf**

```hcl
resource "aws_ecr_repository" "config_api" {
  name                 = var.project_name
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }
}
```

- [ ] **Step 2: Add output**

Append to `IAC/terraform/outputs.tf`:

```hcl
output "ecr_repository_url" {
  value = aws_ecr_repository.config_api.repository_url
}
```

- [ ] **Step 3: Validate**

Run: `cd IAC/terraform && terraform validate`
Expected: `Success! The configuration is valid.`

- [ ] **Step 4: Commit**

```bash
cd /Users/sherinmathew/repo/erp-integration
git add IAC/terraform/ecr.tf IAC/terraform/outputs.tf
git commit -m "Add Terraform: ECR repository for erp-config-api"
```

---

### Task 5: Terraform — ECS cluster, IAM roles, ALB, security groups, service

**Files:**
- Create: `IAC/terraform/ecs.tf`
- Create: `IAC/terraform/alb.tf`
- Create: `IAC/terraform/iam.tf`
- Modify: `IAC/terraform/outputs.tf`

**Interfaces:**
- Consumes: `aws_db_instance.config_db`, `aws_secretsmanager_secret.db_credentials` (Task 3), `aws_ecr_repository.config_api.repository_url` (Task 4), `data.aws_vpc.default`, `data.aws_subnets.default` (Task 3), `var.container_port`, `var.project_name` (Task 3).
- Produces: `aws_lb.config_api.dns_name` — the URL used in Task 7's live verification. `aws_ecs_cluster.main.arn` and `aws_security_group.ecs_tasks.id` — consumed by Task 6 (Liquibase one-off task definition, which reuses the same cluster and needs its own SG rule into RDS).

- [ ] **Step 1: Write iam.tf**

```hcl
data "aws_iam_policy_document" "ecs_task_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "ecs_execution" {
  name               = "${var.project_name}-ecs-execution"
  assume_role_policy = data.aws_iam_policy_document.ecs_task_assume.json
}

resource "aws_iam_role_policy_attachment" "ecs_execution_managed" {
  role       = aws_iam_role.ecs_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

data "aws_iam_policy_document" "read_db_secret" {
  statement {
    actions   = ["secretsmanager:GetSecretValue"]
    resources = [aws_secretsmanager_secret.db_credentials.arn]
  }
}

resource "aws_iam_role_policy" "ecs_execution_read_secret" {
  name   = "${var.project_name}-read-db-secret"
  role   = aws_iam_role.ecs_execution.id
  policy = data.aws_iam_policy_document.read_db_secret.json
}

resource "aws_iam_role" "ecs_task" {
  name               = "${var.project_name}-ecs-task"
  assume_role_policy = data.aws_iam_policy_document.ecs_task_assume.json
}
```

- [ ] **Step 2: Write alb.tf**

```hcl
resource "aws_security_group" "alb" {
  name        = "${var.project_name}-alb-sg"
  description = "Allow HTTP from the internet"
  vpc_id      = data.aws_vpc.default.id

  ingress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_lb" "config_api" {
  name               = "${var.project_name}-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = data.aws_subnets.default.ids
}

resource "aws_lb_target_group" "config_api" {
  name        = "${var.project_name}-tg"
  port        = var.container_port
  protocol    = "HTTP"
  vpc_id      = data.aws_vpc.default.id
  target_type = "ip"

  health_check {
    path                = "/docs"
    healthy_threshold   = 2
    unhealthy_threshold = 5
    interval            = 30
    timeout             = 10
    matcher             = "200"
  }
}

resource "aws_lb_listener" "config_api" {
  load_balancer_arn = aws_lb.config_api.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.config_api.arn
  }
}
```

- [ ] **Step 3: Write ecs.tf**

```hcl
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
```

- [ ] **Step 4: Add output**

Append to `IAC/terraform/outputs.tf`:

```hcl
output "alb_dns_name" {
  value = aws_lb.config_api.dns_name
}
```

- [ ] **Step 5: Validate**

Run: `cd IAC/terraform && terraform validate`
Expected: `Success! The configuration is valid.`

- [ ] **Step 6: Commit**

```bash
cd /Users/sherinmathew/repo/erp-integration
git add IAC/terraform/ecs.tf IAC/terraform/alb.tf IAC/terraform/iam.tf IAC/terraform/outputs.tf
git commit -m "Add Terraform: ECS Fargate service, ALB, IAM roles for erp-config-api"
```

---

### Task 6: Terraform — one-off Liquibase ECS task definition

**Files:**
- Create: `IAC/terraform/liquibase.tf`
- Modify: `IAC/terraform/outputs.tf`

**Interfaces:**
- Consumes: `aws_ecs_cluster.main` (Task 5), `aws_iam_role.ecs_execution`, `data.aws_subnets.default`, `aws_security_group.rds` (Task 3), `aws_secretsmanager_secret.db_credentials` (Task 3).
- Produces: `aws_ecs_task_definition.liquibase.arn` and a security group `aws_security_group.liquibase_task` — used in Task 7's manual `aws ecs run-task` command.

Note: this task definition references an image tag (`liquibase-runner:latest`) that must exist in a new ECR repo created here, pushed manually in Task 7 — same pattern as the config-api image.

- [ ] **Step 1: Write liquibase.tf**

```hcl
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
```

- [ ] **Step 2: Add outputs**

Append to `IAC/terraform/outputs.tf`:

```hcl
output "liquibase_ecr_repository_url" {
  value = aws_ecr_repository.liquibase_runner.repository_url
}

output "liquibase_task_definition_arn" {
  value = aws_ecs_task_definition.liquibase.arn
}

output "ecs_cluster_arn" {
  value = aws_ecs_cluster.main.arn
}

output "ecs_public_subnets" {
  value = data.aws_subnets.default.ids
}

output "liquibase_security_group_id" {
  value = aws_security_group.liquibase_task.id
}
```

- [ ] **Step 3: Validate**

Run: `cd IAC/terraform && terraform validate`
Expected: `Success! The configuration is valid.`

- [ ] **Step 4: Commit**

```bash
cd /Users/sherinmathew/repo/erp-integration
git add IAC/terraform/liquibase.tf IAC/terraform/outputs.tf
git commit -m "Add Terraform: one-off ECS task definition for Liquibase RDS migration"
```

---

### Task 7: Apply, push images, migrate, and verify end-to-end

This task has no source files to write — it is the deployment execution
itself, run interactively (`terraform apply` requires typing `yes`; this
step needs explicit user confirmation before running, since it creates
real billable AWS resources).

**Files:** none (execution only).

**Interfaces:** N/A — this is the final verification task tying together outputs from Tasks 1–6.

- [ ] **Step 1: terraform plan and review**

Run:
```bash
cd IAC/terraform
terraform plan -out=tfplan
```
Expected: a plan listing ~20-25 resources to add (RDS instance, subnet group, security groups x3, ECS cluster, ECS task definitions x2, ECS service, ALB, target group, listener, ECR repos x2, IAM roles/policies, Secrets Manager secret + version, CloudWatch log groups x2, random_password). Review it with the user before proceeding — **stop and confirm with the user before running apply**, since this creates real AWS resources with real cost.

- [ ] **Step 2: terraform apply**

Run: `terraform apply tfplan`
Expected: `Apply complete! Resources: N added, 0 changed, 0 destroyed.` followed by the outputs (`alb_dns_name`, `ecr_repository_url`, `liquibase_ecr_repository_url`, `rds_endpoint`, etc). This takes several minutes — RDS provisioning alone is typically 5-10 minutes.

- [ ] **Step 3: Build and push the erp-config-api image to ECR**

Run:
```bash
cd /Users/sherinmathew/repo/erp-integration
ECR_URL=$(cd IAC/terraform && terraform output -raw ecr_repository_url)
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin "${ECR_URL%/*}"
docker build -t "${ECR_URL}:latest" erp-config-api/
docker push "${ECR_URL}:latest"
```
Expected: `docker push` completes, final line shows the pushed digest.

- [ ] **Step 4: Build and push the liquibase-runner image to ECR**

Run:
```bash
LB_ECR_URL=$(cd IAC/terraform && terraform output -raw liquibase_ecr_repository_url)
docker build -f database/Dockerfile.liquibase-runner -t "${LB_ECR_URL}:latest" database/
docker push "${LB_ECR_URL}:latest"
```
Expected: `docker push` completes.

- [ ] **Step 5: Force a new ECS deployment to pick up the freshly-pushed config-api image**

Run:
```bash
aws ecs update-service --cluster erp-config-api-cluster --service erp-config-api --force-new-deployment --region us-east-1 >/dev/null
```
Expected: command succeeds (JSON output showing the service, deploymentConfiguration).

- [ ] **Step 6: Run the Liquibase migration task**

Run:
```bash
cd IAC/terraform
TASK_DEF=$(terraform output -raw liquibase_task_definition_arn)
CLUSTER=$(terraform output -raw ecs_cluster_arn)
SUBNETS=$(terraform output -json ecs_public_subnets | jq -r 'join(",")')
SG=$(terraform output -raw liquibase_security_group_id)

aws ecs run-task \
  --cluster "$CLUSTER" \
  --task-definition "$TASK_DEF" \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[$SUBNETS],securityGroups=[$SG],assignPublicIp=ENABLED}" \
  --region us-east-1
```
Expected: JSON output with `"lastStatus": "PROVISIONING"` and a `taskArn`. Poll it:
```bash
aws ecs wait tasks-stopped --cluster "$CLUSTER" --tasks <taskArn> --region us-east-1
aws ecs describe-tasks --cluster "$CLUSTER" --tasks <taskArn> --region us-east-1 --query 'tasks[0].containers[0].exitCode'
```
Expected: exit code `0`. If non-zero, check CloudWatch log group `/ecs/erp-config-api-liquibase` for the failure before proceeding.

- [ ] **Step 7: Verify the deployed service end-to-end**

Run:
```bash
cd IAC/terraform
ALB_DNS=$(terraform output -raw alb_dns_name)
sleep 60  # allow ECS service + health checks to stabilize after force-new-deployment
curl -s -o /dev/null -w '%{http_code}\n' "http://${ALB_DNS}/docs"
curl -s "http://${ALB_DNS}/api/v1/clients"
```
Expected: `200` from `/docs`, and the same client JSON data seen in local testing (`Avalon Test Client`, `Akima Test Client`) — proving the ECS-hosted config-api is talking to the Liquibase-migrated RDS instance through the ALB.

- [ ] **Step 8: Commit terraform state notes (not state itself)**

`terraform.tfstate` must NOT be committed (contains the DB password in plaintext). Confirm `.gitignore` excludes it:

```bash
cd /Users/sherinmathew/repo/erp-integration
grep -q 'terraform.tfstate' IAC/terraform/.gitignore 2>/dev/null || cat >> IAC/terraform/.gitignore <<'EOF'
*.tfstate
*.tfstate.*
.terraform/
tfplan
EOF
git add IAC/terraform/.gitignore
git commit -m "Ignore Terraform state and plan files"
```

---

## Post-deployment notes (not tasks — read before tearing down)

- To destroy all resources created here: `cd IAC/terraform && terraform destroy` (also requires explicit user confirmation — do not run without asking).
- `terraform.tfstate` after `apply` contains the RDS master password in plaintext (via `random_password` + interpolation into `aws_db_instance`). It is gitignored per Task 7 Step 8; treat the local state file itself as sensitive.
- No HTTPS: the ALB is HTTP-only. Flagged in the spec as a known gap for this pass, not addressed here.
