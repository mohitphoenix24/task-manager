# Task Manager

A full-stack task management app (React + Express + PostgreSQL) — projects, tasks with priority/due dates, a drag-and-drop Kanban board, and comment threads — with JWT auth, containerized with Docker and deployed to AWS EC2 through a tested CI/CD pipeline.

**Live app:** https://16-112-9-111.nip.io
**Repo:** https://github.com/mohitphoenix24/task-manager

---

## Stack

| Layer | Tech |
|---|---|
| Frontend | React 19, TypeScript, Vite, React Router |
| Backend | Node.js, Express 5, TypeScript, Prisma ORM |
| Database | PostgreSQL 16 (AWS RDS in production) |
| Auth | JWT (jsonwebtoken + bcrypt) |
| Testing | Vitest + Supertest (API/integration), Playwright (E2E) |
| Containerization | Docker, multi-stage builds, Docker Compose |
| Reverse proxy | Nginx (host-level, on the EC2 instance) |
| TLS | Let's Encrypt (certbot), auto-renewing |
| CI/CD | GitHub Actions — build → test → push images to GHCR → deploy |
| Hosting | AWS EC2 (Ubuntu 24.04, Elastic IP) + AWS RDS |
| Infrastructure as code | Terraform (`terraform/`) |

---

## What's been done

This app started out fully built and working *locally only* — no containers, no server, no deployment pipeline. It was taken through a complete, incremental path to production:

1. **Dockerized** both the client (multi-stage: Vite build → served by Nginx in an `nginx:alpine` image) and the server (multi-stage: `tsc` + `prisma generate` in a build stage → a slim runtime image that runs `prisma migrate deploy` on startup before starting the app).
2. **`docker-compose.yml`** wires the whole stack together and was verified working end-to-end locally before ever touching a cloud server.
3. **Deployed to AWS EC2** (Ubuntu 24.04, t3.micro) — Docker and Docker Compose installed, the app running as containers on the instance.
4. **Nginx** installed directly on the EC2 host as a reverse proxy: it's the only public entry point (port 80/443), routing `/` to the frontend container and `/api` + `/health` to the backend container. Both containers are bound to `127.0.0.1` only — unreachable directly from the internet.
5. **HTTPS** via Let's Encrypt (`certbot --nginx`), using a free `nip.io` wildcard-DNS hostname derived from the instance's IP, since no custom domain was purchased. HTTP redirects to HTTPS; the cert auto-renews via a systemd timer. (The hostname has changed once already, when the instance's IP changed — see the Elastic IP item below.)
6. **Production secrets** (JWT secret, DB password) generated fresh with `openssl rand`, stored only in a `chmod 600` `.env` file on the server — never committed to git. CORS locked down from wildcard to the app's real origin.
7. **Database moved to AWS RDS** (PostgreSQL 16, Single-AZ, free tier) — not publicly accessible, reachable only from the EC2 instance via an auto-created security group rule. The app server is now fully stateless.
8. **CI/CD via GitHub Actions**, reworked twice since the first version — see [CI/CD pipeline](#cicd-pipeline) below for the current shape (build → test → push images to a registry → deploy).
9. **Basic logging**: HTTP request logging (`morgan`) on the API server, and Docker container logs capped at 10MB × 3 files per container so logs can't silently fill the disk. Nginx's own access/error logs already rotate daily via the OS's default `logrotate` config.
10. **Elastic IP** — the instance originally had a plain (ephemeral) public IP, which changed on every stop/start and broke the domain, TLS cert, CORS origin, and the client's baked-in API URL all at once. Now pinned to an Elastic IP that survives stop/start.
11. **Feature work**: a drag-and-drop Kanban board (TODO/IN PROGRESS/DONE columns, with ordering persisted server-side), task priority and due dates, and a comment thread per task.
12. **Automated tests** — a backend integration suite (Vitest + Supertest, real Postgres, no mocks) covering auth, project ownership, task CRUD, and specifically the reorder endpoint's order-renumbering transaction; plus Playwright E2E tests driving a real browser through the Kanban board, task details, and comments. Both are required CI checks before anything builds or deploys.
13. **A staging environment path and IaC** (`terraform/`) — see below. The staging *pipeline* is wired up; the staging *infrastructure* itself is written as code but not yet provisioned (needs someone with AWS console access to run `terraform apply` once).

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
- **EC2 was doing the Docker build on every deploy** — the original CI/CD `rsync`'d source to the instance and ran `docker compose up --build` there, which is *why* the disk/swap workarounds above were needed in the first place. Reworked so GitHub Actions builds both images and pushes them to GHCR (GitHub Container Registry); the instance now only `docker compose pull`s and restarts, no build toolchain needed on the box at all.
- **A GitHub Actions secret silently resolved to `undefined`.** The client's build-time `VITE_API_URL` was added under the repo's **Secrets** tab, but the workflow referenced `${{ vars.VITE_API_URL }}` (Variables tab) — no error, just an empty value baked into the bundle, so every API call went to `/undefined/...` instead of `/api/...`. The page loaded fine; only API calls silently failed. Fixed by reading `secrets.VITE_API_URL` instead.
- **Stopping/restarting the EC2 instance broke everything at once**, cascading from the ephemeral-IP issue above: the nip.io domain, Nginx's `server_name`, the TLS cert, the server's CORS allow-list, and the client's baked-in API URL all pointed at the old IP simultaneously. Fixed piece by piece (new cert via certbot, updated `.env`, rebuilt client with the new URL) and then fixed at the root with an Elastic IP so it can't recur.
- **Drag-and-drop worked in every automated Chrome test, then didn't work for a real user in any browser.** Two separate, genuine bugs, both invisible to synthetic-event-based testing because neither goes through a real native browser drag session: (1) the dragged card was being unmounted from the DOM on the first `dragover`-triggered re-render, and browsers silently abort a native HTML5 drag if its source node disappears mid-gesture; (2) dropping into an *empty* column swapped its "No tasks." placeholder for a much shorter drop-indicator line, shrinking the column under the cursor — the eventual drop point (fixed at drag-enter time) then landed outside the column's new bounds, so no `drop` event ever fired. Both root-caused by re-testing with Playwright's real mouse-drag simulation (`dragTo()`) instead of dispatched synthetic events, and fixed by keeping the dragged card mounted (dimmed, not removed) and keeping the empty-state placeholder in place instead of swapping it out.

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

Don't deploy manually. Push to `master` on GitHub — `.github/workflows/ci-cd.yml` builds, tests, pushes images, and deploys automatically (see [CI/CD pipeline](#cicd-pipeline)). Manual fallback, if ever needed — note this pulls pre-built images, it does not build on the instance:

```bash
ssh ubuntu@<ec2-host>
cd ~/taskmanager
docker compose pull
docker compose up -d --remove-orphans
```

---

## Testing

```bash
# backend — integration tests against a real Postgres, no mocks
cd server
docker exec taskmanager-db psql -U taskmanager -c "CREATE DATABASE taskmanager_test"  # once
DATABASE_URL="postgresql://taskmanager:devpassword@localhost:5433/taskmanager_test" npx prisma migrate deploy
npm test   # npm test itself picks up .env.test automatically, via tests/setup.ts

# frontend — Playwright E2E, needs the server (above) and client dev servers running
cd client
npm run test:e2e
# if you don't have `playwright install --with-deps` permissions (no sudo),
# point at your system Chrome instead:
PW_LOCAL_CHROME=1 npm run test:e2e
```

What's covered:

- **`server/tests/`** — auth (register/login/duplicate email), project ownership isolation (one user can't see/delete another's projects), task CRUD, and specifically the `/reorder` endpoint's transaction: reordering within a column, moving across columns, and dropping into an empty column all get their `order` fields renumbered correctly and verified via a fresh `GET /api/projects` read.
- **`client/e2e/kanban.spec.ts`** — dragging a task between columns and confirming it survives a page reload (server-persisted, not just optimistic UI state); reordering within a column; editing a task's priority/due date/description and adding a comment, both confirmed to persist after reload.

Both suites are required CI checks — see below.

---

## CI/CD pipeline

`.github/workflows/ci-cd.yml`, triggered on push to `master` or `develop`:

```
build (typecheck/compile) ─┬─→ test-backend ─┐
                            └─→ test-e2e ─────┴─→ push-server ─┐
                                                                ├─→ deploy-production  (master only, gated — see below)
                              push-client-production ──────────┤
                              push-client-staging ──────────────┴─→ deploy-staging     (develop only, needs staging provisioned)
```

- **`build`** — fast type-check/compile gate on both client and server.
- **`test-backend`** / **`test-e2e`** — the two suites described above, each against their own throwaway Postgres service container in the runner. Nothing downstream runs unless both pass.
- **`push-server`** — builds and pushes the server image to GHCR (`ghcr.io/mohitphoenix24/task-manager-server`), tagged `:latest` and `:<git-sha>`. One image, shared by both environments — the server doesn't bake anything environment-specific at build time.
- **`push-client-production`** / **`push-client-staging`** — the client *does* bake `VITE_API_URL` in at build time (see Environment variables below), so staging and production need genuinely separate image builds, not just separate deploy targets. Tagged `prod-<sha>`/`prod-latest` and `staging-<sha>`/`staging-latest` respectively.
- **`deploy-production`** — SSHes to the EC2 instance, pulls `docker-compose.prod.yml`'s images pinned to the current commit's `:<sha>` tag, restarts. Runs under a GitHub **environment** called `production` — see the manual step below.
- **`deploy-staging`** — same shape, targets `docker-compose.staging.yml` and a separate EC2 instance. Only runs if `STAGING_EC2_HOST` is set as a repo secret; otherwise the job for it is skipped (not failed) with a warning annotation, since staging isn't provisioned yet — see `terraform/README.md`.

### Required manual setup (not doable from a workflow file)

**Gate production behind manual approval.** Right now `environment: production` is set on `deploy-production`, but an *environment* only actually blocks anything once you configure protection rules for it — that part is a GitHub repo setting, not expressible in YAML, and needs someone with a browser + admin access:

1. Repo → **Settings → Environments → New environment** → name it exactly `production`.
2. Check **Required reviewers**, add yourself (or whoever should approve prod deploys).
3. Save.

Until this is done, `deploy-production` behaves exactly like before — push to `master` deploys immediately. After it's done, every `master` push builds/tests/pushes images automatically, then *pauses* waiting for approval in the Actions tab before actually touching the production instance. This directly closes the gap where the drag-and-drop and CI-flake bugs earlier in this project were first discovered live, on the real site, instead of on a review-gated environment.

**Provision staging.** See `terraform/README.md` — `terraform apply` in `terraform/environments/staging` (needs AWS credentials this environment didn't have), then add the resulting `STAGING_EC2_HOST`, `STAGING_EC2_USER`, `STAGING_VITE_API_URL` repo secrets.

### GitHub Actions secrets/variables reference

| Name | Type | Used by | Purpose |
|---|---|---|---|
| `EC2_HOST` | Secret | `deploy-production` | Production instance's Elastic IP |
| `EC2_USER` | Secret | `deploy-production` | SSH user (`ubuntu`) |
| `EC2_SSH_KEY` | Secret | both deploy jobs | Dedicated deploy key, not the admin `.pem` |
| `VITE_API_URL` | Secret | `push-client-production` | Baked into the prod client bundle at build time |
| `STAGING_EC2_HOST` | Secret | `deploy-staging` | Staging instance's Elastic IP — absence gates the whole staging path off |
| `STAGING_EC2_USER` | Secret | `deploy-staging` | SSH user (`ubuntu`) |
| `STAGING_VITE_API_URL` | Secret | `push-client-staging` | Baked into the staging client bundle |
| `GITHUB_TOKEN` | Automatic | GHCR push/pull | No setup needed — provided by Actions itself |

All of these live under **Secrets**, not **Variables** — the workflow reads `secrets.*` throughout, on purpose, after the `VITE_API_URL` incident described above.

---

## How to check the app's health

| What | How |
|---|---|
| App is up and can reach the DB | `curl https://16-112-9-111.nip.io/health` → `{"status":"ok"}` |
| Frontend is serving | `curl -I https://16-112-9-111.nip.io/` → `200` |
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
| `VITE_API_URL` | client (build-time) | Baked into the JS bundle at build time — the API base URL the frontend calls. This is *why* staging needs its own client image build, not just its own deploy target: it's not a runtime env var. |
| `IMAGE_TAG` | `docker-compose.prod.yml` / `docker-compose.staging.yml` | Which image tag to pull — CI sets this to the current commit's `<sha>` on every deploy, so `docker compose pull` always fetches an exact, traceable build rather than a floating `:latest` that two branches could race on. Defaults to `latest`/`prod-latest`/`staging-latest` if unset, for manual local testing. |

For tests specifically: `server/.env.test` (committed — contains only local-only dummy values, safe to share) and `client/e2e/` tests read `E2E_BASE_URL` / `PW_LOCAL_CHROME` as described in [Testing](#testing).
