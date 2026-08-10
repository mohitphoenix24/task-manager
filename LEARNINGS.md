# Key Takeaways for the Next Project

This is the distilled, reusable lesson set from deploying this app — not specific to Task Manager, meant to be front-loaded on the *next* AWS/Docker/CI-CD deployment instead of rediscovered the hard way.

**The pattern behind almost every issue we hit:** an AWS or tool default that's scoped for "a human clicking through a tutorial" rather than "a real automated pipeline," discovered mid-deploy instead of decided upfront. The fix each time was cheap — the only cost was discovering it reactively. Front-load these instead.

---

## Infrastructure — decide these at instance launch, not after a failure

1. **Size the EC2 disk for Docker from day one.** The default 8GB root volume runs out mid-`docker build` once you add a build toolchain (gcc/python for native npm modules) plus duplicated `node_modules` across multi-stage layers. Launch with 20GB+ if you'll build images on the instance.
2. **Add swap immediately after boot if RAM ≤2GB.** `npm ci` / `tsc` / `vite build` can OOM on a 1GB instance otherwise. Two commands, done before the first build:
   ```bash
   sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
   echo '/swapfile swap swap defaults 0 0' | sudo tee -a /etc/fstab
   ```
3. **Open SSH (22) to `0.0.0.0/0` from the start if CI/CD is planned.** GitHub Actions runners have no fixed IP range to allowlist. The SSH *key* is the real access control, not source IP — scoping to "My IP" and reopening it later is pure churn with no security benefit.
4. **Open port 443 alongside 80 up front**, even before HTTPS is configured. Saves a round trip to the console later.

## RDS — skip past the wrong defaults

5. **Go straight to "Full configuration" + engine type PostgreSQL.** The quick/express-create path defaults to Aurora Serverless, which is a different engine entirely and not what you want for a simple Postgres database.
6. **Use "Connect to an EC2 compute resource" during creation.** It auto-creates the security group rule allowing just that instance to reach the DB — one less manual security-group edit.

## Git & GitHub — set identity before the first commit

7. **Check `git config --local user.email` against the target GitHub account before committing**, especially with multiple GitHub accounts on different SSH aliases. Global git config may default to the wrong identity; discovering the mismatch *after* pushing means rewriting history and force-pushing to fix it.
8. **Generate a repo-dedicated SSH deploy key for CI.** Never reuse a server's admin key for automated deploys — one less thing to rotate if it ever leaks, and a much smaller blast radius if it does.
9. **Never paste a private key directly into a chat/AI tool transcript.** Write it to a local file and reference the path instead — anything typed into a transcript should be treated as potentially persisted/logged.

## CI/CD — build the safety net in from day one

10. **Structure the pipeline as a `build` job gating a `deploy` job from the start.** Type-check/compile on the CI runner first; only deploy if that passes. Trivial to include upfront (a few extra YAML lines), annoying to retrofit after a broken commit has already reached production.

## Application/Docker-level

11. **Any CLI tool a container needs at runtime belongs in `dependencies`, not `devDependencies`.** (E.g. `prisma` — needed in the running container to execute `prisma migrate deploy`, not just at build time.)
12. **Decide the Docker log rotation policy in the initial `docker-compose.yml`.** Unbounded `json-file` logs will eventually contribute to the same disk-space problem as #1 — cap it from the start:
    ```yaml
    x-logging: &default-logging
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"
    ```

---

## The one-sentence version

**Decide disk size, swap, security group scope, RDS engine, git identity, deploy-key ownership, and the CI build gate *before* you start building — every one of them is a two-minute decision upfront and an hour of debugging if left to default.**
