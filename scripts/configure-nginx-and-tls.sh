#!/bin/bash
# Run this ON the EC2 instance (via SSH), after `terraform apply` has given
# you the Elastic IP. It installs the Nginx reverse-proxy config and issues a
# Let's Encrypt cert via certbot, both keyed off a single hostname argument.
#
# Usage (on the instance, as a sudo-capable user):
#   ./configure-nginx-and-tls.sh 16-112-9-111.nip.io
# or, once you have a real domain pointed at the Elastic IP:
#   ./configure-nginx-and-tls.sh app.example.com
set -euo pipefail

DOMAIN="${1:?Usage: $0 <domain>  (e.g. a nip.io host derived from the Elastic IP, or a real domain)}"

sudo sed "s/DOMAIN_PLACEHOLDER/${DOMAIN}/g" "$(dirname "$0")/nginx-taskmanager.conf.template" \
  | sudo tee /etc/nginx/sites-available/taskmanager > /dev/null
sudo ln -sf /etc/nginx/sites-available/taskmanager /etc/nginx/sites-enabled/taskmanager
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx

sudo certbot --nginx -d "${DOMAIN}" --non-interactive --agree-tos \
  --register-unsafely-without-email --redirect

echo "Done. Site should be live at https://${DOMAIN}"
echo "Remember to also set, in ~/taskmanager/.env on this instance:"
echo "  ALLOWED_ORIGIN=https://${DOMAIN}"
echo "and the matching VITE_API_URL/STAGING_VITE_API_URL GitHub secret to https://${DOMAIN}/api"
