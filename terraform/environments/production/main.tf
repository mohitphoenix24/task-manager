# WARNING — read before running `terraform apply` here.
#
# This describes what the *existing* production instance should look like,
# for reproducibility. It has NOT been linked to the real running instance
# via `terraform import` yet — that's a deliberate follow-up, not something
# to run unattended, since it requires matching every resource's actual
# attributes exactly or Terraform will try to "fix" (replace/destroy) real
# resources to match this config.
#
# Right now, running `terraform apply` in this directory will try to CREATE
# a brand new, second EC2 instance + security group + RDS database — it will
# NOT touch the real production box. Do not run apply here until the import
# step (see terraform/README.md) is done and `terraform plan` shows no
# changes against the real resources.

terraform {
  required_version = ">= 1.5"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
  # Local state to start. Once this is actually applied, move to a remote
  # backend (S3 + DynamoDB lock table) before more than one person touches it.
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

module "production" {
  source = "../../modules/task-manager-env"

  environment    = "production"
  aws_region     = var.aws_region
  ssh_key_name   = var.ssh_key_name
  db_password    = var.db_password
  instance_type  = "t3.micro"
  db_instance_class = "db.t4g.micro"
}

output "public_ip" {
  value = module.production.public_ip
}

output "nip_io_domain" {
  value = module.production.nip_io_domain
}

output "db_endpoint" {
  value = module.production.db_endpoint
}
