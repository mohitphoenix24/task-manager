variable "environment" {
  description = "Short environment name, used in resource names/tags (e.g. \"production\", \"staging\")."
  type        = string
}

variable "aws_region" {
  description = "AWS region to deploy into."
  type        = string
  default     = "ap-south-2"
}

variable "instance_type" {
  description = "EC2 instance type."
  type        = string
  default     = "t3.micro"
}

variable "root_volume_size_gb" {
  description = "Root EBS volume size in GB. 20+ is required — the default 8GB runs out mid `docker compose build` once you add a build toolchain and multi-stage node_modules duplication."
  type        = number
  default     = 20
}

variable "ssh_key_name" {
  description = "Name of an existing EC2 key pair to attach for admin SSH access."
  type        = string
}

variable "ssh_admin_cidr" {
  description = "CIDR allowed to SSH in with the admin key pair. CI deploys use a separate deploy key over the same port 22, which stays open to 0.0.0.0/0 (see aws_security_group.app) since GitHub Actions runners have no fixed IP range."
  type        = string
  default     = "0.0.0.0/0"
}

variable "create_database" {
  description = "Whether to provision an RDS PostgreSQL instance for this environment. Set false to point the app at an existing database instead."
  type        = bool
  default     = true
}

variable "db_instance_class" {
  description = "RDS instance class."
  type        = string
  default     = "db.t4g.micro"
}

variable "db_name" {
  type    = string
  default = "taskmanager"
}

variable "db_username" {
  type    = string
  default = "taskmanager"
}

variable "db_password" {
  description = "RDS master password. Pass via TF_VAR_db_password or a .tfvars file that is not committed — never hardcode this."
  type        = string
  sensitive   = true
}

variable "swap_size_gb" {
  description = "Swapfile size created at boot. t3.micro only has ~1GB RAM, which isn't enough to complete a docker compose build without swap (deploys now build in CI instead, but swap still helps for ad-hoc work directly on the box)."
  type        = number
  default     = 2
}
