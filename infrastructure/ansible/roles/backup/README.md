# Role `backup` (issue 013)

Backups of the production database and configuration, plus a weekly
encrypted snapshot of the Infisical `prod` environment. Everything runs as
**root** from systemd timers. The deploy user `germinal` has no docker and
no sudo beyond the deploy runner (issue 017), and this role gives it none.

| What | When | Where in the bucket |
| --- | --- | --- |
| `germinal-backup`: `pg_dump -Fc` of the prod database | daily 03:00 Paris | `<tier>/db/germinal_prod_<UTC>.dump` |
| `germinal-backup`: config archive (allowlist, see below) | same run | `<tier>/config/germinal_config_<UTC>.tar.gz` |
| `germinal-snapshot`: Infisical `prod`, `age`-encrypted | Sunday 04:00 Paris | `weekly/infisical/germinal_prod_secrets_<UTC>.json.age` |
| `germinal-restore-test`: restore the newest dump into a throwaway container | by hand | — |

`<tier>` is `monthly` on the 1st, `weekly` on Sundays and `daily` otherwise.
The bucket's lifecycle rules (`infrastructure/terraform/backups.tf`) expire
each tier by its top-level prefix. Nothing on the server deletes backups.
The newest dump also stays on the server as `/opt/germinal/backups/latest.dump`
(root 0600), for a quick restore after a mistake.

How long each tier is kept (the lifecycle rules; `backup_retention_days` is 90):

| Tier | Storage class | Deleted after |
| --- | --- | --- |
| `daily/` | Standard, then Standard-IA from day 30 | 90 days |
| `weekly/` (database and Infisical snapshot) | Glacier from day 60 | 180 days |
| `monthly/` | Glacier from day 90 | 365 days |

So personal data deleted from the site stays in backups for **at most one
year**. The privacy page (`legal/privacy`) states that limit; change them
together. Backups are not the 10-year accounting archive: the e-invoicing
platform keeps the accounting records.

## Where the credentials come from

- **S3:** `BACKUP_AWS_ACCESS_KEY_ID`, `BACKUP_AWS_SECRET_ACCESS_KEY`,
  `BACKUP_S3_BUCKET` and `BACKUP_S3_REGION` come from Infisical `prod`
  `/backup`. `POSTGRES_USER` and `POSTGRES_DB` come from `/db`. All of them
  reach the job through the Agent-rendered `/opt/germinal/env/backup.env`,
  which is read fresh on every run. Ansible never sees them.
- **AWS CLI:** it is not packaged for Ubuntu 24.04, so it runs from the
  pinned `amazon/aws-cli` image. The credentials are passed to the container
  by name, so they never appear in a command line.
- **The snapshot** uses the Infisical Agent's own access token
  (`/etc/infisical-agent/credentials/token-sink.json`), so the server needs
  no second Infisical credential.
- **The `age` public key** is `backup_age_recipient` in
  `defaults/main.yml`. It is not a secret. The private key exists **only**
  in the operator's password manager, so the server can write snapshots but
  never read them.

## The config archive never contains a secret

The archive is an **allowlist** (`backup_config_paths`): the two compose
files, the Caddyfile directory, the Agent's `config.yaml` and its
templates, plus a `manifest.txt` with the image tags (deployed SHAs) of the
app containers. No `env/` file, no Agent credential and no TLS key can get
in. As a second check, the job refuses to upload an archive that lists a
secret-looking path. Every secret is in Infisical, and the encrypted
snapshot covers losing Infisical itself.

## Everyday commands (on the server, as root)

```bash
systemctl list-timers 'germinal-*'          # next runs
systemctl start germinal-backup             # back up now (or: germinal-backup weekly)
systemctl start germinal-snapshot           # snapshot now
journalctl -u germinal-backup -u germinal-snapshot --since -2d
germinal-restore-test                       # newest dump; or: germinal-restore-test daily/db/<file>.dump
```

`germinal-restore-test` downloads the dump and restores it into a
`postgres:16-alpine` container with no network. It passes only if every
table in the dump is restored and the Drizzle migrations table is not
empty, and it prints the row count of each table. The container and its data
are removed at the end. Production is never touched.

## Recovery

### A. Restore the production database (server still there)

1. **Pick the dump.** `/opt/germinal/backups/latest.dump` is the newest. To
   get an older one from the bucket:

   ```bash
   bash -c '. /usr/local/lib/germinal-backup.sh; backup_init; aws s3 ls "$bucket/" --recursive' | grep /db/
   bash -c '. /usr/local/lib/germinal-backup.sh; backup_init; aws s3 cp "$bucket/daily/db/<file>.dump" -' > /root/restore.dump
   ```

   A `weekly/` dump older than 60 days or a `monthly/` dump older than 90
   days is in Glacier: restore it in the S3 console first (Actions → Initiate
   restore; a few hours with the Standard tier), then download it.
2. **Test it first:** `germinal-restore-test daily/db/<file>.dump`.
3. **Stop the app** so nothing writes during the restore:
   `docker stop germinal_app`.
4. **Restore** into the running Postgres (the roles already exist there,
   so owners are kept):

   ```bash
   bash -c '. /usr/local/lib/germinal-backup.sh; backup_init
     docker exec -i germinal_postgres pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
       --clean --if-exists --single-transaction --exit-on-error' < /root/restore.dump
   ```

5. **Start the app** (`docker start germinal_app`), check
   `https://germinalstudio.co/api/health`, then `rm /root/restore.dump`.
6. **Re-apply the deletions (GDPR).** A dump brings back personal data
   deleted after it was taken.
   - Time-based deletions: the app's `purge-personal-data` job
     (`src/lib/server/jobs/purge-personal-data.ts`) runs every night at 04:00
     and removes them again by itself.
   - Erasure requests received since the dump: run
     `scripts/erase-guest-data.js` again for each one (usage in its header).
     The request emails are the record of who asked.

### B. The server is lost

1. Rebuild it through the normal path: Terraform (`./tf.sh`), then
   `playbooks/site.yml` with the Agent credential. The Agent renders the env
   files, and `shared_services` starts an empty Postgres with its roles.
2. Restore the newest dump as in **A** (download it from the bucket; there
   is no `latest.dump` on a new server). Before the restore, stop the app if
   it is already deployed.
3. Ship the release through **Promote to production** (the SHA is in the
   config archive's `manifest.txt` if staging no longer serves it).

### C. Infisical is lost: recover from the encrypted snapshot

Run this on the operator's computer, never on the server. You need `age`,
`jq`, the Infisical CLI and read access to the backup bucket (the
operator-only `app-germinal` key, or the AWS console).

1. **Download** the newest
   `weekly/infisical/germinal_prod_secrets_<UTC>.json.age`.
2. **Put the private key in a file only you can read and that never reaches
   the disk.** `$XDG_RUNTIME_DIR` is a per-user tmpfs. Paste the key from
   the password manager:

   ```bash
   install -m 600 /dev/null "$XDG_RUNTIME_DIR/germinal-recovery.key"
   $EDITOR "$XDG_RUNTIME_DIR/germinal-recovery.key"
   age -d -i "$XDG_RUNTIME_DIR/germinal-recovery.key" germinal_prod_secrets_<UTC>.json.age \
     > "$XDG_RUNTIME_DIR/snapshot.json"
   jq -r '.takenAt, (.secrets | length), ([.secrets[].path] | unique | join(" "))' "$XDG_RUNTIME_DIR/snapshot.json"
   ```

3. **Create the new project** in Infisical (or a new instance) with a `prod`
   environment, then re-create every folder and its values. JSON is valid
   YAML, so each folder's values go through `secrets set --file`, which
   keeps multi-line values intact:

   ```bash
   S=$XDG_RUNTIME_DIR/snapshot.json; P=<new project id>
   for path in $(jq -r '[.secrets[].path] | unique[]' "$S"); do
     [ "$path" = / ] || infisical secrets folders create --projectId "$P" --env prod \
       --path "$(dirname "$path")" --name "$(basename "$path")"
     jq --arg p "$path" '[.secrets[] | select(.path == $p) | {(.key): .value}] | add' "$S" \
       > "$XDG_RUNTIME_DIR/folder.yaml"
     infisical secrets set --projectId "$P" --env prod --path "$path" \
       --file "$XDG_RUNTIME_DIR/folder.yaml" > /dev/null
   done
   rm -f "$XDG_RUNTIME_DIR"/{snapshot.json,folder.yaml,germinal-recovery.key}
   ```

   Folders are created in sorted order, so a parent comes before its child
   only when the parent holds secrets itself. Today every folder is one level
   deep. Comments are in the snapshot (`.comment`) but are not re-applied.
4. **Point the setup at the new project.** The project ID is committed in
   `infrastructure/infisical/templates/*.tmpl` and `playbooks/site.yml`
   (`infisical_project_id`). Then re-create the `germinal-vps` machine
   identity (read access to `prod` and `staging`), re-run the Agent role
   with its new credential, and re-create `staging` and `dev` (they are
   not in the snapshot: staging has test-mode values, dev has none of
   production's).

Rehearse step C once into a scratch project, so the procedure is known to
work before it is needed.
