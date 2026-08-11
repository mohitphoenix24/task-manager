output "instance_id" {
  value = aws_instance.app.id
}

output "public_ip" {
  description = "Elastic IP — stable across stop/start, unlike the instance's default public IP."
  value       = aws_eip.app.public_ip
}

output "nip_io_domain" {
  description = "Convenience nip.io hostname derived from the Elastic IP, usable before a real domain is set up."
  value       = "${replace(aws_eip.app.public_ip, ".", "-")}.nip.io"
}

output "db_endpoint" {
  value = var.create_database ? aws_db_instance.app[0].endpoint : null
}

output "db_connection_string_template" {
  description = "DATABASE_URL template — fill in the password you passed via db_password."
  value       = var.create_database ? "postgresql://${var.db_username}:<password>@${aws_db_instance.app[0].address}:5432/${var.db_name}" : null
}
