terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

data "aws_vpc" "default" {
  default = true
}

data "aws_subnets" "default" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.default.id]
  }
}

data "aws_ami" "ubuntu" {
  most_recent = true
  owners      = ["099720109477"] # Canonical

  filter {
    name   = "name"
    values = ["ubuntu/images/hvm-ssd-gp3/ubuntu-noble-24.04-amd64-server-*"]
  }
  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
}

# --- Security group: only 22, 80, 443 reach the instance from the internet.
# The app containers bind to 127.0.0.1 only (see docker-compose.*.yml), so
# Nginx is the sole public entry point even though the SG doesn't say so
# directly. ---
resource "aws_security_group" "app" {
  name        = "task-manager-${var.environment}"
  description = "task-manager ${var.environment} EC2 instance"
  vpc_id      = data.aws_vpc.default.id

  ingress {
    description = "SSH (admin key + CI deploy key both use this port)"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = [var.ssh_admin_cidr]
  }

  ingress {
    description = "HTTP (redirects to HTTPS once certbot is configured)"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "HTTPS"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "task-manager-${var.environment}", Environment = var.environment }
}

resource "aws_instance" "app" {
  ami                    = data.aws_ami.ubuntu.id
  instance_type          = var.instance_type
  key_name               = var.ssh_key_name
  subnet_id              = data.aws_subnets.default.ids[0]
  vpc_security_group_ids = [aws_security_group.app.id]

  root_block_device {
    volume_size = var.root_volume_size_gb
    volume_type = "gp3"
  }

  user_data = templatefile("${path.module}/user-data.sh.tpl", {
    swap_size_gb = var.swap_size_gb
  })

  tags = { Name = "task-manager-${var.environment}", Environment = var.environment }
}

resource "aws_eip" "app" {
  instance = aws_instance.app.id
  domain   = "vpc"
  tags     = { Name = "task-manager-${var.environment}" }
}

# --- RDS (optional) ---
resource "aws_security_group" "db" {
  count       = var.create_database ? 1 : 0
  name        = "task-manager-${var.environment}-db"
  description = "task-manager ${var.environment} RDS — only reachable from the app instance"
  vpc_id      = data.aws_vpc.default.id

  ingress {
    description     = "Postgres from the app instance only"
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.app.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "task-manager-${var.environment}-db", Environment = var.environment }
}

resource "aws_db_subnet_group" "app" {
  count      = var.create_database ? 1 : 0
  name       = "task-manager-${var.environment}"
  subnet_ids = data.aws_subnets.default.ids
  tags       = { Name = "task-manager-${var.environment}" }
}

resource "aws_db_instance" "app" {
  count      = var.create_database ? 1 : 0
  identifier = "task-manager-${var.environment}"

  engine         = "postgres"
  engine_version = "16"
  instance_class = var.db_instance_class

  allocated_storage = 20
  storage_type      = "gp3"

  db_name  = var.db_name
  username = var.db_username
  password = var.db_password

  db_subnet_group_name   = aws_db_subnet_group.app[0].name
  vpc_security_group_ids = [aws_security_group.db[0].id]
  publicly_accessible    = false
  multi_az               = false

  skip_final_snapshot = var.environment != "production"
  deletion_protection = var.environment == "production"

  tags = { Name = "task-manager-${var.environment}", Environment = var.environment }
}
