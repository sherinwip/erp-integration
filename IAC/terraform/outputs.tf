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
