# erp-config-api on AWS

Architecture reference for the `erp-config-api` AWS deployment: FastAPI CRUD
service for the pipeline routing/config schema, running on ECS Fargate
behind an ALB, backed by RDS Postgres. Deployed via Terraform
(`IAC/terraform/`) into a single AWS account/region.

- Account: `295933007447`
- Region: `us-east-1`
- VPC: default (`vpc-0bed6b9cd08ef8a8f`)
- Branch: `feature/aws-deploy-config-api`

Visual version (diagram + styled reference cards):
https://claude.ai/code/artifact/c86fa3fe-5f89-4bc8-a3db-8771ffeb3bb9

## Architecture

Public HTTP entry through the ALB; the service and one-off migration task
share the RDS security group boundary but reach it independently. No HTTPS
in this pass — flagged as a known gap.

```
Client / Postman
      │  public internet, HTTP :80
      ▼
Application Load Balancer         (aws_lb.config_api)
      │  :8010, target group
      ▼
ECS Fargate Service                (aws_ecs_service.config_api)
  ├─ pulls image  ───────► ECR · erp-config-api
  ├─ reads creds  ───────► Secrets Manager
  └─ ships logs   ───────► CloudWatch Logs
      │  :5432
      ▼
RDS Postgres 16                    (aws_db_instance.config_db)
      ▲  also written by, one-off
      │
ECS Task · Liquibase Runner        (aws_ecs_task_definition.liquibase)
  └─ pulls image  ───────► ECR · liquibase-runner
```

## Services used, and their job

Nine AWS services, each doing exactly one thing in this deployment. Ordered
by where a request or deploy actually touches them.

### Application Load Balancer
`aws_lb.config_api`

Single public entry point. Terminates HTTP on port 80 and forwards to the
Fargate task's container port.

- Type: application, internet-facing
- Listener: HTTP :80 → target group
- Health check: `/docs`, 200, every 30s
- Subnets: 6 default-VPC public subnets

**How it's used:** every API call goes DNS → ALB → target group → whichever
task is registered healthy. No path-based or host-based routing — one
listener, one target group, one service.

### ECS Fargate — service
`aws_ecs_service.config_api` / `aws_ecs_task_definition.config_api`

Runs the FastAPI container continuously. No EC2 to patch — Fargate owns the
underlying compute.

- CPU / Memory: 256 / 512
- Platform: ARM64 / Linux
- Desired count: 1
- Network mode: awsvpc, public IP assigned

**How it's used:** task definition pulls `erp-config-api:latest` from ECR,
injects five DB env vars from Secrets Manager, and streams stdout/stderr to
CloudWatch. ARM64 was chosen to match images built on Apple Silicon dev
machines and the Graviton-based RDS instance class — an amd64 image will
fail at runtime with `exec format error`.

### ECS Fargate — one-off task
`aws_ecs_task_definition.liquibase`

Runs the Liquibase changelog against RDS. Not a service — invoked manually
via `aws ecs run-task`, runs once, exits.

- CPU / Memory: 256 / 512
- Platform: ARM64 / Linux
- Trigger: manual CLI, no schedule

**How it's used:** pulls a purpose-built `liquibase-runner` image (Java +
Liquibase only, no embedded Postgres — the repo's existing local-dev image
bundles its own DB and can't target RDS). Builds its JDBC URL from the live
RDS endpoint at Terraform apply time and reads its DB username/password
from the same Secrets Manager secret as the service.

### RDS for PostgreSQL
`aws_db_instance.config_db`

Managed Postgres holding the client/target/step/pipeline/field-mapping
schema. Mirrors the local `postgres:16` Docker image used in dev.

- Engine: Postgres 16.13
- Instance class: db.t4g.micro
- Storage: 20 GB gp3
- Availability: single-AZ
- Public access: disabled

**How it's used:** only reachable from inside its security group boundary —
the ECS service's SG and the Liquibase task's SG, each on port 5432. No
bastion, no public endpoint; there is currently no direct query path from
outside AWS, by design.

### Secrets Manager
`aws_secretsmanager_secret.db_credentials`

Single source of truth for DB credentials. Nothing in the deployed
environment reads a `.env` file or hardcoded password.

- Value: JSON — host, port, dbname, username, password
- Password source: `random_password`, 24 chars

**How it's used:** both ECS task definitions reference individual JSON keys
via `valueFrom` in their `secrets` block, so ECS injects `DB_HOST` /
`DB_PORT` / `DB_NAME` / `DB_USER` / `DB_PASSWORD` (or `LB_USERNAME` /
`LB_PASSWORD` for the migration task) at container start — the value never
appears in the task definition itself or in application code.

### Elastic Container Registry
`aws_ecr_repository.config_api` / `.liquibase_runner`

Hosts both container images this deployment runs. Two repos, one per
image.

- Scan on push: enabled (config-api repo)
- Tag mutability: mutable, tag `:latest`

**How it's used:** `docker build` + `docker push` are manual steps outside
Terraform — Terraform only creates the repos. ECS task definitions
reference `{repository_url}:latest`, so a new push requires a
`force-new-deployment` or a fresh `run-task` to actually roll out.

### IAM
`aws_iam_role.ecs_execution` / `.ecs_task`

Two roles, least-privilege. One lets ECS pull images and read the one DB
secret; the other is the app's own runtime identity, currently unused for
any AWS API call.

- Execution role: ECR pull + CloudWatch logs + one secret ARN
- Task role: assumable, no policies attached yet

**How it's used:** the Secrets Manager read policy is scoped to the exact
secret ARN, not `secretsmanager:*` — the execution role cannot read any
other secret in the account.

### CloudWatch Logs
`aws_cloudwatch_log_group.config_api` / `.liquibase`

Destination for both containers' stdout/stderr — the only place to see a
Liquibase migration failure or an app stack trace.

- Retention: 14 days, both groups
- Driver: awslogs

**How it's used:** this is where the `step_pk=17` foreign-key failure was
actually diagnosed — `aws logs get-log-events` against
`/ecs/erp-config-api-liquibase` showed the exact Postgres exception before
the fix was made.

### EC2 — security groups & default VPC
`aws_security_group.alb` / `.ecs_tasks` / `.rds` / `.liquibase_task`

No new VPC — the default VPC's existing public subnets are reused. Four
security groups form the only network boundary.

- VPC: default, 6 public subnets
- Chain: ALB → ECS → RDS, each scoped by SG-of-origin

**How it's used:** RDS ingress isn't a CIDR block — it names the ECS task
SG and the Liquibase task SG explicitly, so only traffic actually
originating from those task groups can reach port 5432, regardless of what
subnet they land in.

## Request path, step by step

What happens between a client hitting the ALB DNS name and a response
coming back.

1. **Client resolves and connects** — DNS for
   `erp-config-api-alb-*.us-east-1.elb.amazonaws.com` resolves to the ALB's
   public IPs; client opens a TCP connection on port 80.
2. **ALB forwards to a healthy target** — the listener's default action
   forwards to the target group on port 8010 — the only registered target
   is the single running Fargate task's ENI.
3. **Container serves the request** — Uvicorn inside the task handles the
   route; SQLAlchemy opens a connection to RDS using the env vars ECS
   injected from Secrets Manager at task start.
4. **RDS query executes over the private path** — traffic never leaves the
   VPC's private address space to reach the DB — the ECS task's security
   group is the only thing RDS's security group trusts on port 5432.
5. **Response returns, logs land in CloudWatch** — the JSON response
   traces back through the ALB to the client; application logs and any
   stack trace are simultaneously shipped to `/ecs/erp-config-api`.

## Deploy path (image → running task)

Terraform provisions infrastructure; getting a new image running is three
separate manual steps, by design (no CI/CD in this pass).

| Step | Command | Effect |
|---|---|---|
| 1. Provision | `terraform apply` | Creates/updates all 26 AWS resources — does not touch image contents. |
| 2. Build & push | `docker build && docker push` | New image lands in ECR tagged `:latest`. ECS does not know yet. |
| 3. Roll service | `aws ecs update-service --force-new-deployment` | ECS stops the old task, starts a new one pulling the fresh `:latest`. |
| 4. Migrate (if changelog changed) | `aws ecs run-task` (liquibase task def) | One-off task applies new changesets to RDS, then exits. |

## Known gaps

- **No HTTPS** — the ALB listener is HTTP-only on port 80. No ACM
  certificate, no TLS termination. Scoped out of this pass in the original
  design spec.
- **Single-AZ, no CI/CD** — RDS has no standby, and image build/push/rollout
  is manual CLI, not a pipeline. Reasonable for a first deployment, not yet
  production-hardened.
