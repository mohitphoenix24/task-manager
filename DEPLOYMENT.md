# Deployment Runbook

Step-by-step commands to take this app from local code to a running production deployment on AWS EC2 + RDS, with Nginx, HTTPS, and GitHub Actions CI/CD. This documents the exact path used for this project's deployment at **https://18-60-149-127.nip.io**.

Replace placeholders like `<EC2_PUBLIC_IP>`, `<YOUR_KEY>.pem`, `<STRONG_PASSWORD>` with your own values. Never commit real secrets — generate them with `openssl rand -hex 32`.

---

## Phase 0 — Prerequisites

- Docker + Docker Compose installed locally
- An AWS account
- A GitHub account and an empty repo created for this project

---

## Phase 1 — Dockerize the backend

`server/Dockerfile` — multi-stage build (build tools + `prisma generate` + `tsc` in one stage, slim runtime in the next):

```dockerfile
FROM node:24-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ openssl \
    && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
RUN npm ci
COPY . .
RUN npx prisma generate
RUN npm run build

FROM node:24-slim AS production
WORKDIR /app
ENV NODE_ENV=production
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/node_modules/@prisma ./node_modules/@prisma
COPY prisma ./prisma
COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

EXPOSE 4000
ENTRYPOINT ["./docker-entrypoint.sh"]
```

`server/docker-entrypoint.sh` — runs pending migrations before starting the app on every container start:

```sh
#!/bin/sh
set -e

npx prisma migrate deploy

exec node dist/index.js
```

`server/.dockerignore`:

```
node_modules
dist
.env
npm-debug.log
Dockerfile
.dockerignore
```

Note: `prisma` (the CLI) must be in `dependencies`, not `devDependencies` — it's needed at runtime to run `prisma migrate deploy` in the entrypoint script.

---

## Phase 2 — Dockerize the frontend

`client/Dockerfile` — build the static bundle, then serve it with Nginx:

```dockerfile
FROM node:24-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

FROM nginx:alpine AS production
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
```

`client/nginx.conf` — SPA fallback so client-side routing works on refresh:

```nginx
server {
    listen 80;
    server_name _;
    root /usr/share/nginx/html;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

`client/.dockerignore`:

```
node_modules
dist
.env
Dockerfile
.dockerignore
```

Note: `VITE_API_URL` is baked into the JS bundle **at build time** (Vite), not read at runtime — it must be passed as a Docker build arg, and the image rebuilt any time it changes.

---

## Phase 3 — docker-compose.yml

At the repo root:

```yaml
x-logging: &default-logging
  driver: json-file
  options:
    max-size: "10m"
    max-file: "3"

services:
  server:
    build:
      context: ./server
    restart: unless-stopped
    logging: *default-logging
    environment:
      DATABASE_URL: ${DATABASE_URL}
      JWT_SECRET: ${JWT_SECRET}
      ALLOWED_ORIGIN: ${ALLOWED_ORIGIN}
      NODE_ENV: production
      PORT: 4000
    ports:
      - "127.0.0.1:4000:4000"

  client:
    build:
      context: ./client
      args:
        VITE_API_URL: ${VITE_API_URL}
    restart: unless-stopped
    logging: *default-logging
    depends_on:
      - server
    ports:
      - "127.0.0.1:8080:80"
```

Root `.env` (gitignored — copy from `.env.example`):

```
DATABASE_URL="postgresql://user:password@host:5432/taskmanager"
JWT_SECRET=<openssl rand -hex 32>
VITE_API_URL=http://localhost:4000/api
ALLOWED_ORIGIN=
```

Test locally before touching any cloud infrastructure:

```bash
docker compose up -d --build
curl http://localhost:4000/health
curl -I http://localhost:8080/
```

---

## Phase 4 — Launch the EC2 instance

In the AWS Console → EC2 → Launch Instance:

- AMI: **Ubuntu Server 24.04 LTS**
- Instance type: whichever is tagged **Free tier eligible** (e.g. `t3.micro`)
- Key pair: create new (`.pem`), download it
- Security group inbound rules:
  - SSH (22) — source: your IP for now (opened to `0.0.0.0/0` later for CI/CD)
  - HTTP (80) — source: Anywhere
  - HTTPS (443) — source: Anywhere
- Storage: **20 GiB** (the default 8 GiB is too small — it *will* run out of space mid-`docker build` once you add the build toolchain and duplicated `node_modules` across multi-stage layers)

```bash
chmod 400 <YOUR_KEY>.pem
ssh -i <YOUR_KEY>.pem ubuntu@<EC2_PUBLIC_IP>
```

If you didn't set 20 GiB at launch, resize it later without downtime:
1. Console → EC2 → Volumes → select the volume → Actions → Modify volume → set size → Modify
2. On the instance, extend the partition and filesystem to actually use the new space:
   ```bash
   lsblk   # confirm the disk grew but the partition hasn't yet
   sudo growpart /dev/nvme0n1 1
   sudo resize2fs /dev/nvme0n1p1
   df -h /
   ```

---

## Phase 5 — Install Docker on EC2

```bash
sudo apt-get update -y
sudo apt-get install -y ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update -y
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker ubuntu   # lets you run `docker` without sudo (needs a fresh SSH session to take effect)
```

Add swap if the instance has ≤1GB RAM (build steps like `tsc`/`npm ci` can OOM otherwise):

```bash
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile swap swap defaults 0 0' | sudo tee -a /etc/fstab
```

---

## Phase 6 — Ship the code and bring up the stack

From your local machine:

```bash
rsync -avz -e "ssh -i <YOUR_KEY>.pem" \
  --exclude 'node_modules' --exclude 'dist' --exclude '.git' --exclude '.env' \
  client server docker-compose.yml \
  ubuntu@<EC2_PUBLIC_IP>:~/taskmanager/
```

Create the production `.env` directly on the server (never sync your local one — generate fresh secrets):

```bash
ssh -i <YOUR_KEY>.pem ubuntu@<EC2_PUBLIC_IP>
cd ~/taskmanager
cat > .env <<'EOF'
DATABASE_URL="postgresql://<db_user>:<db_password>@<db_host>:5432/<db_name>"
JWT_SECRET=<openssl rand -hex 32>
VITE_API_URL=http://<EC2_PUBLIC_IP>/api
ALLOWED_ORIGIN=http://<EC2_PUBLIC_IP>
EOF
chmod 600 .env   # owner-only — this file holds real secrets
```

Bring the stack up:

```bash
docker compose up -d --build
docker compose ps
curl http://localhost:4000/health
```

---

## Phase 7 — Nginx reverse proxy

Why: the app currently exposes two raw ports (80 for the frontend container, 4000 for the API) directly to the internet with no TLS. Nginx becomes the single public entry point.

Lock the containers down to `127.0.0.1` only in `docker-compose.yml` (already reflected in Phase 3 above), then install Nginx on the host:

```bash
sudo apt-get install -y nginx
```

`/etc/nginx/sites-available/taskmanager`:

```nginx
server {
    listen 80;
    server_name <EC2_PUBLIC_IP_OR_DOMAIN>;

    location /api/ {
        proxy_pass http://127.0.0.1:4000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /health {
        proxy_pass http://127.0.0.1:4000/health;
    }

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

```bash
sudo ln -sf /etc/nginx/sites-available/taskmanager /etc/nginx/sites-enabled/taskmanager
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl start nginx
sudo systemctl enable nginx
```

Then rebuild/restart the containers so port 80 is freed from Docker and picked up by Nginx:

```bash
docker compose up -d --build
```

---

## Phase 8 — HTTPS with Let's Encrypt

If you don't have a real domain yet, `nip.io` gives you a free one that resolves to your server's IP automatically — e.g. `18-60-149-127.nip.io` resolves to `18.60.149.127`, no signup needed. Swap in a real domain later by re-running certbot against it.

```bash
sudo sed -i 's/server_name .*/server_name <your-domain-or-nip.io-host>;/' /etc/nginx/sites-available/taskmanager
sudo nginx -t && sudo systemctl reload nginx

sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d <your-domain-or-nip.io-host> --non-interactive --agree-tos -m <your-email> --redirect
```

Certbot edits the Nginx config to add a `443` server block and an HTTP→HTTPS redirect, and installs a systemd timer for auto-renewal — no cron job needed.

Open port 443 in the EC2 security group (Console → Security Groups → edit inbound rules → add HTTPS, source Anywhere).

Update `VITE_API_URL` and `ALLOWED_ORIGIN` in `.env` to the `https://` URL and rebuild the client:

```bash
sed -i 's|VITE_API_URL=.*|VITE_API_URL=https://<your-domain>/api|' .env
sed -i 's|ALLOWED_ORIGIN=.*|ALLOWED_ORIGIN=https://<your-domain>|' .env
docker compose up -d --build client server
```

Verify:

```bash
curl -I http://<your-domain>/    # expect a 301 to https
curl https://<your-domain>/health
```

---

## Phase 9 — Move PostgreSQL to RDS

Why: Postgres running as a container on the same instance as your app means no backups, no managed failover, and DB load competing with the app for RAM.

In the AWS Console → RDS → Create database → **Full configuration** → Engine type **PostgreSQL** (not Aurora):

- Engine version: 16.x
- Templates: Free tier
- Deployment: Single-AZ DB instance
- DB instance identifier: `taskmanager-db`
- Master username/password: self-managed, set your own strong password
- Instance class: whichever is tagged Free tier eligible
- Connectivity → Compute resource: **Connect to an EC2 compute resource** → select your instance (this auto-creates the security group rule allowing only that instance to reach the DB)
- Public access: **No**
- Additional configuration → Initial database name: `taskmanager` (without this, RDS won't create an actual database)
- Database Insights: Standard (Advanced has extra charges)
- Deletion protection: off (so it can be torn down easily later if needed)

Once status is "Available," grab the endpoint from the instance's Connectivity tab, then test connectivity from the EC2 instance:

```bash
sudo apt-get install -y postgresql-client
PGPASSWORD=<db_password> psql "host=<rds-endpoint> port=5432 dbname=taskmanager user=<db_user> sslmode=require" -c "select version();"
```

Update `.env` on the server:

```bash
sed -i 's|^DATABASE_URL=.*|DATABASE_URL=postgresql://<db_user>:<db_password>@<rds-endpoint>:5432/taskmanager?sslmode=require|' .env
```

Remove the local `db` service from `docker-compose.yml` entirely (no longer needed), then:

```bash
docker compose up -d --build --remove-orphans   # --remove-orphans stops/removes the now-undefined local db container
```

---

## Phase 10 — GitHub Actions CI/CD

Why: manual SSH deploys are error-prone (easy to forget a step) and leave no audit trail. This automates it.

1. Push the code to GitHub (repo already created):
   ```bash
   git init   # if not already a repo
   git add -A
   git commit -m "Initial commit"
   git remote add origin git@github.com:<you>/<repo>.git
   git push -u origin master
   ```

2. Generate a **dedicated** deploy key (don't reuse your EC2 admin `.pem`):
   ```bash
   ssh-keygen -t ed25519 -f ./gha_deploy_key -N "" -C "github-actions-deploy"
   ```

3. Add the public key to the server:
   ```bash
   ssh -i <YOUR_KEY>.pem ubuntu@<EC2_PUBLIC_IP> \
     "echo '$(cat gha_deploy_key.pub)' >> ~/.ssh/authorized_keys"
   ```

4. On GitHub: repo → Settings → Secrets and variables → Actions → add:
   - `EC2_HOST` = your EC2 public IP
   - `EC2_USER` = `ubuntu`
   - `EC2_SSH_KEY` = contents of `gha_deploy_key` (the private key)

   Then delete the local private key file — it only needs to exist on GitHub and in the server's `authorized_keys` now.

5. Open SSH (22) to `0.0.0.0/0` in the EC2 security group — GitHub Actions runners have no fixed IP range to allowlist; the deploy key is the real access control from here on.

6. `.github/workflows/deploy.yml`:

   ```yaml
   name: Deploy

   on:
     push:
       branches: [master]

   jobs:
     build:
       runs-on: ubuntu-latest
       steps:
         - uses: actions/checkout@v4
         - uses: actions/setup-node@v4
           with:
             node-version: 24

         - name: Build server
           working-directory: server
           run: |
             npm ci
             npx prisma generate
             npm run build

         - name: Build client
           working-directory: client
           run: |
             npm ci
             npm run build

     deploy:
       needs: build
       runs-on: ubuntu-latest
       steps:
         - uses: actions/checkout@v4

         - name: Set up SSH
           run: |
             mkdir -p ~/.ssh
             echo "${{ secrets.EC2_SSH_KEY }}" > ~/.ssh/deploy_key
             chmod 600 ~/.ssh/deploy_key
             ssh-keyscan -H "${{ secrets.EC2_HOST }}" >> ~/.ssh/known_hosts

         - name: Sync code to EC2
           run: |
             rsync -avz --delete \
               --exclude 'node_modules' --exclude 'dist' --exclude '.git' --exclude '.env' \
               -e "ssh -i ~/.ssh/deploy_key" \
               client server docker-compose.yml \
               "${{ secrets.EC2_USER }}@${{ secrets.EC2_HOST }}:~/taskmanager/"

         - name: Rebuild and restart containers
           run: |
             ssh -i ~/.ssh/deploy_key "${{ secrets.EC2_USER }}@${{ secrets.EC2_HOST }}" \
               'cd ~/taskmanager && docker compose up -d --build --remove-orphans'
   ```

   The `build` job type-checks/builds both apps on GitHub's runners first — `deploy` only runs if that succeeds, so a broken commit never reaches the server.

7. Push, then watch it run at `https://github.com/<you>/<repo>/actions`.

From here on: **deploying is just `git push origin master`.**

---

## Phase 11 — Basic logging

Add HTTP request logging to the Express server (`morgan`):

```bash
cd server
npm install morgan
npm install -D @types/morgan
```

```ts
// server/src/index.ts
import morgan from "morgan";
app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));
```

Cap Docker container logs so they can't fill the disk (already in the `docker-compose.yml` above via the `x-logging` anchor):

```yaml
x-logging: &default-logging
  driver: json-file
  options:
    max-size: "10m"
    max-file: "3"
```

Nginx's own access/error logs already rotate daily via Ubuntu's default `/etc/logrotate.d/nginx` — nothing to configure there.

---

## Cheat sheet — commands you'll actually reuse

```bash
# Deploy (normal path)
git push origin master

# Deploy manually (fallback only)
ssh -i <YOUR_KEY>.pem ubuntu@<EC2_PUBLIC_IP> \
  'cd ~/taskmanager && docker compose up -d --build --remove-orphans'

# Check container status
ssh -i <YOUR_KEY>.pem ubuntu@<EC2_PUBLIC_IP> 'cd ~/taskmanager && docker compose ps'

# Tail logs
ssh -i <YOUR_KEY>.pem ubuntu@<EC2_PUBLIC_IP> 'cd ~/taskmanager && docker compose logs -f server'

# Health check
curl https://<your-domain>/health

# Check TLS cert expiry
ssh -i <YOUR_KEY>.pem ubuntu@<EC2_PUBLIC_IP> 'sudo certbot certificates'
```
