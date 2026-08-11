terraform {
  required_version = ">= 1.5"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

variable "aws_region" {
  type    = string
  default = "ap-south-2"
}

variable "ssh_key_name" {
  type = string
}

variable "db_password" {
  type      = string
  sensitive = true
}

module "staging" {
  source = "../../modules/task-manager-env"

  environment       = "staging"
  aws_region        = var.aws_region
  ssh_key_name      = var.ssh_key_name
  db_password       = var.db_password
  instance_type     = "t3.micro"
  db_instance_class = "db.t4g.micro"
}

output "public_ip" {
  value = module.staging.public_ip
}

output "nip_io_domain" {
  value = module.staging.nip_io_domain
}

output "db_endpoint" {
  value = module.staging.db_endpoint
}
