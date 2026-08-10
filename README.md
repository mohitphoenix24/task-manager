# Task Manager

A full-stack task management app (React + Express + PostgreSQL) with projects and tasks, JWT auth, containerized with Docker and deployed to AWS EC2 with an automated CI/CD pipeline.

**Live app:** https://18-60-149-127.nip.io
**Repo:** https://github.com/mohitphoenix24/task-manager

---

## Stack

| Layer | Tech |
|---|---|
| Frontend | React 19, TypeScript, Vite, React Router |
| Backend | Node.js, Express 5, TypeScript, Prisma ORM |
| Database | PostgreSQL 16 (AWS RDS in production) |
| Auth | JWT (jsonwebtoken + bcrypt) |
| Containerization | Docker, multi-stage builds, Docker Compose |
| Reverse proxy | Nginx (host-level, on the EC2 instance) |
| TLS | Let's Encrypt (certbot), auto-renewing |
| CI/CD | GitHub Actions (build gate → SSH deploy) |
| Hosting | AWS EC2 (Ubuntu 24.04) + AWS RDS |

---

## What's been done

This app started out fully built and working *locally only* — no containers, no server, no deployment pipeline. It was taken through a complete, incremental path to production:

1. **Dockerized** both the client (multi-stage: Vite build → served by Nginx in an `nginx:alpine` image) and the server (multi-stage: `tsc` + `prisma generate` in a build stage → a slim runtime image that runs `prisma migrate deploy` on startup before starting the app).
2. **`docker-compose.yml`** wires the whole stack together and was verified working end-to-end locally before ever touching a cloud server.
3. **Deployed to AWS EC2** (Ubuntu 24.04, t3.micro) — Docker and Docker Compose installed, the app running as containers on the instance.
4. **Nginx** installed directly on the EC2 host as a reverse proxy: it's the only public entry point (port 80/443), routing `/` to the frontend container and `/api` + `/health` to the backend container. Both containers are bound to `127.0.0.1` only — unreachable directly from the internet.
5. **HTTPS** via Let's Encrypt (`certbot --nginx`), using a free `nip.io` wildcard-DNS hostname (`18-60-149-127.nip.io`) since no custom domain was purchased. HTTP redirects to HTTPS; the cert auto-renews via a systemd timer.
6. **Production secrets** (JWT secret, DB password) generated fresh with `openssl rand`, stored only in a `chmod 600` `.env` file on the server — never committed to git. CORS locked down from wildcard to the app's real origin.
7. **Database moved to AWS RDS** (PostgreSQL 16, Single-AZ, free tier) — not publicly accessible, reachable only from the EC2 instance via an auto-created security group rule. The app server is now fully stateless.
8. **CI/CD via GitHub Actions**: every push to `master` first runs a `build` job (type-checks and builds both client and server on GitHub's runners) — only if that passes does a `deploy` job sync the code to EC2 over SSH (using a dedicated, restricted deploy key, not the account's admin key) and rebuild/restart the containers.
9. **Basic logging**: HTTP request logging (`morgan`) on the API server, and Docker container logs capped at 10MB × 3 files per container so logs can't silently fill the disk. Nginx's own access/error logs already rotate daily via the OS's default `logrotate` config.

---

## Challenges faced

Real problems hit during this build, and how they were resolved:

- **EC2's default disk was too small.** The default 8GB root volume ran out of space mid-`docker compose build` — the build toolchain (gcc/python for the `bcrypt` native module) plus duplicated `node_modules` across multi-stage layers exceeded it. Fixed by resizing the EBS volume to 20GB in the AWS console, then growing the partition and filesystem live with `growpart` + `resize2fs` (no reboot needed).
- **Low RAM risked OOM during builds.** The t3.micro only has ~1GB RAM. Added a 2GB swapfile proactively before the first build.
- **GitHub Actions couldn't reach EC2 over SSH.** The EC2 security group's SSH rule was scoped to "My IP" (the developer's own laptop) — GitHub's hosted runners come from different, non-fixed IPs and couldn't even open a TCP connection. Fixed by opening port 22 to `0.0.0.0/0`; the dedicated SSH deploy key (not source IP) is what actually gates access.
- **Git commit signing blocked the very first commit.** The global git config signed commits with a passphrase-locked SSH key, and there was no interactive terminal available to unlock it. Resolved by disabling commit signing for this repo only (`git config --local commit.gpgsign false`), leaving global config untouched.
- **Wrong git identity on pushed commits.** Commits initially went out under an unrelated (work) git identity/email, so GitHub attributed them to the wrong account instead of this repo's owner. Fixed by rewriting the commit history with corrected author/committer identity and force-pushing (safe here — solo repo, no collaborators).
- **A deploy key got exposed in chat and was rotated immediately** — generated a fresh SSH keypair, removed the old public key from the server's `authorized_keys`, added the new one, and updated the GitHub secret.
- **First CI/CD version had no safety net.** It rebuilt directly on the EC2 box with zero pre-verification — a broken commit would only be discovered on the production server. Added a separate `build` job that type-checks/builds both apps on GitHub's infrastructure first; `deploy` only runs if that passes.
- **RDS creation defaulted to the wrong thing.** The "Create database" wizard's Express/quick-create path defaults to Aurora Serverless, not plain PostgreSQL — had to explicitly pick PostgreSQL as the engine and "Full configuration" mode.

---

## How to run the application

### Option A — plain local dev (no Docker)

Requires a local PostgreSQL instance running.

```bash
# server
cd server
cp .env.example .env   # fill in DATABASE_URL, JWT_SECRET
npm install
npm run dev             # http://localhost:4000

# client (separate terminal)
cd client
cp .env.example .env    # VITE_API_URL=http://localhost:4000/api
npm install
npm run dev              # http://localhost:5173
```

### Option B — Docker Compose (mirrors production shape)

Requires Docker and Docker Compose. Also requires a reachable PostgreSQL instance (local container, or RDS) — `docker-compose.yml` no longer runs its own database container.

```bash
cp .env.example .env    # fill in DATABASE_URL, JWT_SECRET, VITE_API_URL, ALLOWED_ORIGIN
docker compose up -d --build
```

- Backend: http://localhost:4000
- Frontend: http://localhost:8080

(Both are bound to `127.0.0.1` only, by design — see the security notes above.)

### Production

Don't deploy manually. Push to `master` on GitHub — `.github/workflows/deploy.yml` builds, verifies, and deploys automatically. Manual fallback, if ever needed:

```bash
ssh ubuntu@<ec2-host>
cd ~/taskmanager
docker compose up -d --build --remove-orphans
```

---

## How to check the app's health

| What | How |
|---|---|
| App is up and can reach the DB | `curl https://18-60-149-127.nip.io/health` → `{"status":"ok"}` |
| Frontend is serving | `curl -I https://18-60-149-127.nip.io/` → `200` |
| Container status on EC2 | `ssh` in, then `cd ~/taskmanager && docker compose ps` |
| Server request logs | `docker compose logs -f server` (method/path/status per request, via `morgan`) |
| Client logs | `docker compose logs -f client` |
| Nginx status | `sudo systemctl status nginx` |
| Nginx access/error logs | `/var/log/nginx/access.log`, `/var/log/nginx/error.log` |
| HTTPS cert status/expiry | `sudo certbot certificates` |
| Cert auto-renewal timer | `systemctl list-timers | grep certbot` |
| Database reachability | From the EC2 instance: `psql "host=<rds-endpoint> ... sslmode=require" -c "select 1;"` |
| CI/CD pipeline status | Repo's [Actions tab](https://github.com/mohitphoenix24/task-manager/actions) |
| Latest deployed commit | `ssh` in, then `docker compose images` or check the timestamp on `docker compose ps` |

---

## Environment variables

See `.env.example` (root, for Docker Compose), `server/.env.example`, and `client/.env.example`. Never commit a real `.env` file — all of them are gitignored.

| Variable | Where | Purpose |
|---|---|---|
| `DATABASE_URL` | server | PostgreSQL connection string |
| `JWT_SECRET` | server | Signs/verifies auth tokens |
| `ALLOWED_ORIGIN` | server | Locks CORS to the real frontend origin in production (unset = allow all, for local dev) |
| `PORT` | server | API port (default 4000) |
| `VITE_API_URL` | client (build-time) | Baked into the JS bundle at build time — the API base URL the frontend calls |
