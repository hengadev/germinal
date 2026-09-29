# Docker Compose, not Swarm, on the single VPS

Germinal runs on one VPS and is not expected to need a second. We considered moving the app tier to Docker Swarm (for start-first rolling updates, automatic rollback and Swarm secrets) and fully implemented it on `feature/arch-upgrade-swarm-infisical`, but decided against adopting it: on one node those benefits don't outweigh running two orchestrators side by side (Swarm for the app, Compose for Postgres/Redis/Caddy), the overlay-network conversion, the Caddy service-DNS fallback, and the verification scripts that hybrid required. Everything stays on Docker Compose, and runtime configuration reaches containers through an `.env` file rendered by Infisical Agent and consumed natively via `env_file`, instead of Swarm secrets plus an in-container Infisical fetch at boot.

## Consequences

- The image no longer needs the Infisical CLI, `docker/entrypoint.sh` or `scripts/boot-with-infisical.js`; containers hold no Infisical credentials.
- The `.env` exists in plaintext on the host; its permissions and location are part of the security posture.
- A deploy recreates the app container, so there is a brief gap unless a rolling-restart mechanism is added deliberately.
