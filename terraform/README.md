# Infrastructure as code

Terraform describing the EC2 + security group + RDS setup used by this
project. One module (`modules/task-manager-env`), instantiated twice
(`environments/production`, `environments/staging`) with different variable
values.

## Status: not yet applied anywhere

Nothing here has been run against real AWS yet — there's no AWS credentials
available in the environment this was written in. Both environment configs
are ready to `terraform plan`/`apply` once you have credentials, but:

- **staging** is safe to apply as-is — nothing exists there yet, so this
  will just create a fresh environment.
- **production** needs `terraform import` first (see below) — running
  `apply` without importing will create a *second*, separate set of
  resources rather than adopting the hand-configured instance that's
  already live. Read the warning comment at the top of
  `environments/production/main.tf` before touching it.

## Setting up staging (the safe, immediate option)

```bash
cd terraform/environments/staging
cp terraform.tfvars.example terraform.tfvars   # fill in ssh_key_name
export TF_VAR_db_password='generate-one-with-openssl-rand'
terraform init
terraform plan   # review before applying anything that costs money
terraform apply
```

Then, using the `public_ip` output:

1. SSH in, `cd` to `~/taskmanager`, create a `.env` with `DATABASE_URL`
   (use the `db_connection_string_template` output), `JWT_SECRET`
   (`openssl rand -hex 32`), and `ALLOWED_ORIGIN` (fill in after step 2).
2. From the repo root, run `scripts/configure-nginx-and-tls.sh <nip_io_domain
   output>` on the instance to wire up Nginx and get a TLS cert.
3. Set `ALLOWED_ORIGIN=https://<that domain>` in the instance's `.env`.
4. In the GitHub repo, add secrets: `STAGING_EC2_HOST` (the `public_ip`
   output), `STAGING_EC2_USER` (`ubuntu`), `STAGING_VITE_API_URL`
   (`https://<domain>/api`). `EC2_SSH_KEY` is reused from production's deploy
   key — see root README for how that key was generated.
5. Push to `develop` — `.github/workflows/ci-cd.yml` will pick up from there.

## Importing the existing production instance

Not done yet, on purpose — it's an attended task, not something to run
unsupervised. Once you're ready:

1. Fill in `environments/production/main.tf`'s resource arguments (instance
   type, AMI, etc.) to match the real instance's actual current
   configuration (`aws ec2 describe-instances`, `aws rds
   describe-db-instances`, etc. — check every field, not just the obvious
   ones like instance type).
2. `terraform import module.production.aws_instance.app <instance-id>`, and
   similarly for the security group, EIP, and RDS resources.
3. `terraform plan` and confirm it shows **no changes**. If it wants to
   change/replace anything, stop and fix the config to match reality first —
   don't apply a plan that would touch the live instance until the diff is
   empty.

## Why one module, two environments

Keeps prod and staging structurally identical (same security group rules,
same instance sizing, same swap setup) so staging is actually representative
of prod, while letting each environment have its own state file, RDS
instance, and lifecycle — destroying staging to save cost between testing
sessions doesn't touch production's state at all.
