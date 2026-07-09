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
