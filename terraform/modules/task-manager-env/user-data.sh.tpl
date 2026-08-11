#!/bin/bash
set -euo pipefail

# --- swap: t3.micro has ~1GB RAM, not enough for some build/maintenance tasks without it ---
if [ ! -f /swapfile ]; then
  fallocate -l ${swap_size_gb}G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo "/swapfile none swap sw 0 0" >> /etc/fstab
fi

# --- docker + compose plugin ---
apt-get update
apt-get install -y ca-certificates curl gnupg nginx
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null
apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

usermod -aG docker ubuntu

# --- certbot (via snap, matches what's documented for the existing instance) ---
snap install core
snap refresh core
snap install --classic certbot
ln -sf /snap/bin/certbot /usr/bin/certbot

mkdir -p /home/ubuntu/taskmanager
chown ubuntu:ubuntu /home/ubuntu/taskmanager

# Nginx and certbot are intentionally NOT configured further here — the
# domain (nip.io or real) isn't known until the Elastic IP is allocated, and
# certbot needs DNS already resolving to this instance before it can issue a
# cert. Run scripts/configure-nginx-and-tls.sh (in this repo) once, by hand,
# after `terraform apply` gives you the Elastic IP. See terraform/README.md.
