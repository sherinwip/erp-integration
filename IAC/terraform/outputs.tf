output "rds_endpoint" {
  value = aws_db_instance.config_db.address
}

output "db_credentials_secret_arn" {
  value = aws_secretsmanager_secret.db_credentials.arn
}

output "default_vpc_id" {
  value = data.aws_vpc.default.id
}

output "ecr_repository_url" {
  value = aws_ecr_repository.config_api.repository_url
}

output "alb_dns_name" {
  value = aws_lb.config_api.dns_name
}

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
