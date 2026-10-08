# Setup checklist

From zero to a working server, from **any** operator computer. Nothing here
depends on a file that exists on only one machine: the state is in S3, every
value is in Infisical, and each computer has its own SSH key.

How the result works: [README.md](README.md). Where each value goes:
[environment.md](environment.md).

## 1. Accounts (once)

- [ ] **Infisical** (`https://secrets.henga.dev`): an account with **2FA on**.
  Save the **2FA recovery codes in your password manager**. Without them, a
  lost phone means a lost account.
- [ ] Membership of both projects, `germinal` and `germinal-infra`.
- [ ] Access to Hetzner, Cloudflare, AWS, Stripe, Twilio, Docker Hub and the
  GitHub repository, for the rare manual steps below.

## 2. Each operator computer

- [ ] Tools: the Infisical CLI, Terraform ≥ 1.7, Ansible
  (`ansible-galaxy collection install community.docker community.general`),
  `age`, `jq`, and Docker if you also develop locally.
- [ ] `infisical login`, picking the team's instance.
- [ ] **Its own SSH key**, never copied to another computer:
  `ssh-keygen -t ed25519 -f ~/.ssh/germinal-$(hostname) -C germinal-$(hostname)`.
- [ ] **The keys file**, `~/germinal-deploy-keys.yml`. Every computer has the
  same content: public keys only, so it can be copied freely. List every
  operator computer's public key, plus the CI key:

  ```yaml
  deploy_ssh_public_keys:        # root and the deploy user, unrestricted
    - "ssh-ed25519 AAAA… germinal-<computer 1>"
    - "ssh-ed25519 AAAA… germinal-<computer 2>"
  deploy_ci_ssh_public_keys:     # forced to the deploy gate
    - "ssh-ed25519 AAAA… germinal-ci"
  ```

- [ ] `~/.ssh/config`, so `ssh` and Ansible pick this key without an agent:

  ```
  Host germinal 46.225.65.239
      HostName 46.225.65.239
      User root
      IdentityFile ~/.ssh/germinal-<this computer>
      IdentitiesOnly yes
  ```

  If the key has a passphrase, load it once per terminal before running
  Ansible: `eval "$(ssh-agent -s)" && ssh-add ~/.ssh/germinal-<this computer>`.

**Adding a computer later:** put its public key in the keys file and run
`make setup` (step 6) from a computer that already has access. The new
computer then reaches root with its own key. Removing a key from the file
removes that access on the next run.

## 3. Infisical (once; already done for Germinal)

- [ ] Project `germinal` with environments `dev`, `staging` and `prod`, and the
  folders and keys from [environment.md](environment.md).
  `prod/app MAINTENANCE_MODE=true` until the site opens.
- [ ] Project `germinal-infra`, environment `prod`: `TF_VAR_hcloud_token`,
  `TF_VAR_cloudflare_token`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`
  (the `terraform-germinal` IAM user).
- [ ] Machine identity **`germinal-vps`**, Universal Auth, role **Viewer** on
  `germinal` only, **no** access to `germinal-infra`, and a short
  access-token TTL (for example 3600 s). Create a client secret. Save the
  client ID and secret in your password manager, and nowhere else: no shell
  history, no notes, no chat.
- [ ] Calendar reminder: rotate the `germinal-vps` client secret every
  3 months, on the 1st of December, March, June and September
  ([procedure](README.md#credentials-and-rotation)).

## 4. Recovery key and CI credentials (once)

- [ ] **`age` key pair** for the encrypted Infisical snapshots:
  `age-keygen -o germinal-recovery.key`. Save the **whole file's contents in
  your password manager**, then delete the file. The public key (`age1…`,
  also printed by `age-keygen -y` from the private key) goes in
  `backup_age_recipient` in `infrastructure/ansible/roles/backup/defaults/main.yml`.
- [ ] **Docker Hub** access token (read/write), saved in the password manager.
- [ ] **CI deploy key:** `ssh-keygen -t ed25519 -f germinal-ci -C germinal-ci -N ''`.
  Its public key goes in `deploy_ci_ssh_public_keys`. Its private key goes
  only into GitHub; delete the local file afterwards.
- [ ] **GitHub** → Settings → Secrets and variables → Actions:
  `DOCKERHUB_USERNAME`, `DOCKERHUB_TOKEN`, `SSH_USER` (`germinal`) and
  `SSH_PRIVATE_KEY` (the CI key). Add `SSH_HOST` and `SSH_KNOWN_HOSTS`
  after the server exists (step 7). **No Infisical credential in GitHub.**
- [ ] **GitHub** → Environments: `staging` (no rules) and `production`.
- [ ] **GitHub** → Branches: protect `main` (no force-push, no deletion,
  include administrators). Leave **secret scanning and push protection** on.

## 5. Terraform

```bash
infisical login
cd infrastructure/terraform
make init            # S3 backend + pinned providers
make plan            # an existing setup: "No changes"
```

- **New infrastructure:** `make apply`. It creates the server, DNS, buckets
  and IAM, and writes the AWS keys into Infisical `/s3` and `prod/backup`.
- **Rebuilding the server:** `./tf.sh apply -replace=hcloud_server.main`. The
  primary IP and the DNS stay the same.
- Always go through `./tf.sh` or `make`. A plain `terraform` has no
  credentials and gets a 403 from the state bucket.
- After a (re)build, forget the old host key:
  `ssh-keygen -R 46.225.65.239 && ssh-keygen -R germinalstudio.co`.

## 6. Ansible

From `infrastructure/ansible`, with the Agent credential in the environment
(zsh shown; in bash use `read -rsp "prompt: " VAR`):

```bash
read -rs "INFISICAL_AGENT_CLIENT_ID?germinal-vps client id: "; export INFISICAL_AGENT_CLIENT_ID
read -rs "INFISICAL_AGENT_CLIENT_SECRET?germinal-vps client secret: "; export INFISICAL_AGENT_CLIENT_SECRET
make setup
make setup           # the second run must report changed=0 (or 1: "Update apt cache")
```

`make setup` reads the server's IP from Terraform and the keys from
`~/germinal-deploy-keys.yml`. It hardens the host, installs Docker, the
deploy user and gate, Caddy, the Infisical Agent and the backup timers, and
starts Postgres, Redis and Caddy.

Check on the server, as root:

- [ ] `systemctl status infisical-agent` is active.
- [ ] `ls -l /opt/germinal/env /opt/germinal-staging/env`: files owned by root, mode `0600`.
- [ ] `sudo -l -U germinal` lists only `/usr/local/sbin/germinal-deploy`.
- [ ] `systemctl list-timers 'germinal-*'` shows the backup and snapshot timers.

## 7. First deploys

- [ ] GitHub secrets `SSH_HOST` = the server IP, and `SSH_KNOWN_HOSTS` = the
  output of `ssh-keyscan -t ed25519 <ip>`.
- [ ] Push to `main` (or re-run the latest CI run). CI deploys staging, and
  `https://staging.germinalstudio.co/api/health` reports the SHA.
- [ ] Actions → **Promote to production**, no input.
  `https://germinalstudio.co/api/health` reports the same SHA. The site shows
  the maintenance page while `MAINTENANCE_MODE=true`.
- [ ] Log in on `admin-staging.` and `admin.germinalstudio.co` with the accounts
  from `staging/admin` and `prod/admin`.
- [ ] As root: `systemctl start germinal-backup`, then `germinal-restore-test`.
  Both must succeed.

## Recurring

| When | What |
| --- | --- |
| Every 3 months (1 Dec, 1 Mar, 1 Jun, 1 Sep) | rotate the `germinal-vps` client secret ([procedure](README.md#credentials-and-rotation)) |
| After a large schema change | `germinal-restore-test` on the server |
| Now and then | `journalctl -u germinal-backup -u germinal-snapshot --since -8d` on the server |
| Before opening the site | `prod/sentry/SENTRY_DSN`, a backup-failure alert, one recovery rehearsal ([roles/backup](../../infrastructure/ansible/roles/backup/README.md)); then `MAINTENANCE_MODE=false` |
