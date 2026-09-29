# Infisical is the sole source of configuration; Ansible Vault is retired

Germinal is deployed from more than one machine, so no secret or environment value may live only on one of them. Every value — app runtime config and infrastructure consumers (Postgres bootstrap, Caddy's Cloudflare token, backup credentials, host notification email) — lives in one Infisical project with `dev`, `staging` and `prod` environments, each holding the same component folders (`/app`, `/admin`, `/db`, `/redis`, `/stripe`, `/s3`, `/smtp`, `/twilio`, `/sentry`, `/caddy`, `/backup`, `/host`). Terraform's secret inputs (Hetzner, Cloudflare, Twilio, AWS) live in a separate `germinal-infra` project, so the VPS's own identity can never read credentials capable of destroying the VPS, its backups or its DNS; Terraform writes the credentials it creates (IAM keys, Twilio API keys) straight into the app project via the Infisical provider. Non-secret Terraform inputs are committed. On the VPS, Infisical Agent runs as a systemd service and renders one env file per consumer (`app.env`, `postgres.env`, `caddy.env`, `backup.env`, and `admin.env` for the one-off admin bootstrap only) which Compose loads via `env_file:`; composite values such as `DATABASE_URL` are assembled by the Agent's templates rather than stored, so each atom exists exactly once. The only secret outside Infisical is the Agent's own machine-identity credential on the host, placed by Ansible from the operator's Infisical login.

## Considered Options

- **Ansible Vault for infra values, Infisical for app values** (the previous split) — rejected: the vault file lives on one workstation, which is the problem being solved.
- **Containers fetch from Infisical at boot** (the Swarm-branch design) — rejected along with Swarm (ADR 0003): it needs a credential and a fetch wrapper inside every container, and cannot pick up changes without a restart anyway.
- **One shared `.env`** — rejected: every container, including the internet-facing Caddy, would receive every secret.

## Consequences

- Changing a value in Infisical reaches `app`/`caddy` within the Agent's polling interval by recreating the container (`docker compose up -d <svc>`); `restart` does not reload `env_file`.
- `postgres.env` changes are never applied automatically: `POSTGRES_PASSWORD` only takes effect at first init, so rotating it requires a manual `ALTER USER` before updating Infisical.
- A bad value edited in `prod` goes live without passing through staging.
