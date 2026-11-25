# Deploying the internal Social Studio

This package is prepared for a single always-on Linux Docker server. The hosting target, public address, and server access still need to be chosen before the app can be declared online. The configuration does not buy hosting, change DNS, open third-party accounts, or publish user data.

## Service layout

- Next.js 16 + React 19 using a standalone build on Node 24, with SQLite, Sharp, fonts, FFmpeg, and FFprobe in the Dockerfile.
- The database, key, and media are stored in a data folder outside the image/container.
- A single app instance: do not run multiple scheduler replicas against the same data.
- The app port is only opened to the server's localhost; a reverse proxy handles public HTTPS.
- Owner login and editor invitations remain in effect. There is no client sign-up or Social Studio sales page.
- Production refuses to run if the HTTPS domain or the owner account is not available. Data must be migrated before the public port is served, so nobody else can claim the owner-creation page.

## Current production: Coolify (studio.vayora.id)

`https://studio.vayora.id` is managed by Coolify at `https://coolify.vayora.id`, project **Vayora → production**, application **vayora-socialstudio**.

- **Source:** `git@github.com:Masterkopet/vayora-socialstudio.git`, branch `main`, through a read-only deploy key. Dockerfile build pack (`/Dockerfile`), port 3210, single instance.
- **Auto-deploy:** a GitHub webhook (push event) to `https://coolify.vayora.id/webhooks/source/github/events/manual`. Every push to `main` builds a new image and performs a rolling update; the new container receives traffic after the Dockerfile HEALTHCHECK passes. A push does not change the data folder.
- **Data:** persistent storage bind mount `/opt/vayora-social-studio/data` → `/app/data` (database, media, `.encryption-key`). Do not switch to a new volume without moving the contents of this folder.
- **Runtime env:** `APP_ORIGIN` and `PUBLIC_BASE_URL` = `https://studio.vayora.id`, `INSTAGRAM_API_VERSION`, `HOSTNAME=0.0.0.0`. `NODE_ENV`, `PORT`, `DATA_DIR`, and `REQUIRE_EXISTING_OWNER` come from the Dockerfile; do not add `NODE_ENV` in Coolify, because the env is also available at build time.
- **Docker options:** `--init --cap-drop=ALL`. Coolify's option parser truncates `--security-opt=no-new-privileges` to `no`, which makes the container fail to start, so that option is not used.
- **Coolify healthcheck** is disabled because the image does not include curl/wget; Coolify uses the Dockerfile HEALTHCHECK.

**Rollback:** choose a previous image in the Rollback tab of the Coolify application. Emergency path without Coolify: stop the application in Coolify, then run `docker compose --env-file deploy/production.env -f compose.production.yml -f deploy/compose.traefik.yml up -d app` in `/opt/vayora-social-studio` (same data folder). Never run both at the same time.

Steps 1–5 below describe manual installation with Docker Compose, for another server or for emergencies.

## 1. Choose the host and domain

Use a VPS/Docker host with permanent storage, or container hosting that provides persistent volumes. An example subdomain is `studio.vayora.id`; the final choice is up to the domain owner. Static-only hosting cannot run this app's database, video processing, and scheduler.

If you use a VPS that already runs another website, check ports 80/443 and the existing reverse proxy first. Do not change the OS, remove services, change the main website's DNS, or run a second Caddy on a port that is already in use.

## 2. Prepare the source without private data

From PowerShell in the local project:

```powershell
& .\scripts\package-deployment.ps1
```

The source archive is placed in `deployment-packages/`. The source does not include `.env`, the database, keys, accounts, or private media files. Transfer the source to the server through SCP/SFTP or an approved private repository. Do not put the data archive in a public folder or repository.

## 3. Data snapshot for migration

Make sure live publishing is off and the queue is paused before migration, so the local computer and the new server do not publish at the same time.

```powershell
node scripts/migrate-data.mjs data deployment-private/data-migration-YYYYMMDD-HHMM
```

The destination must be a new folder. The script creates a consistent SQLite snapshot, copies the registered media and the same key, then removes temporary sessions/invitations/OAuth entries from the **copy**. User passwords and encrypted configuration are kept. The copy stays paused with publishing off. The source is not changed. If the export fails, do not use the incomplete output folder; use a new destination path for the next attempt.

The export folder contains private information and the key that unlocks it. Transfer it only over a private channel such as SSH/SFTP to the server's `data` folder, together with `.encryption-key`; never upload it through a public URL. After the transfer, the app container must be able to read/write as UID 1000. Example, after confirming the absolute location is correct:

```sh
cd /opt/vayora-social-studio
sudo chown -R 1000:1000 ./data
sudo chmod 700 ./data ./data/media
sudo chmod 600 ./data/studio.sqlite ./data/.encryption-key
```

Users need to log in again after migration. The key must not be replaced with a new one, because the existing AI/Meta connections could not be unlocked.

## 4. Server configuration

Copy `deploy/production.env.example` to `deploy/production.env`. Set `APP_DOMAIN` to the subdomain without scheme/path, `APP_PORT` to a free localhost port, and `DATA_PATH` to the migrated folder. This file is not the computer's local `.env` file; Compose sets the server's own HTTPS origin.

Validate without printing the configuration values:

```sh
docker compose --env-file deploy/production.env -f compose.production.yml config --quiet
docker compose --env-file deploy/production.env -f compose.production.yml build
```

Enter the App Secret/API keys through AI settings/Instagram after logging in, or move the encrypted configuration together with the key. Never embed keys in the Dockerfile/image/source.

## 5. Choose a reverse proxy

**New server with ports 80/443 free:** point the subdomain's A/AAAA record at the right server, then:

```sh
docker compose --env-file deploy/production.env -f compose.production.yml --profile edge up -d
```

The edge profile starts Caddy for automatic HTTPS certificates. DNS and access to 80/443 must be correct. The Caddy volume stores the certificates so they are not recreated on every restart.

**Server already has a proxy:** run the app only:

```sh
docker compose --env-file deploy/production.env -f compose.production.yml up -d app
```

Connect the HTTPS subdomain on the existing proxy to `http://127.0.0.1:<APP_PORT>`, keep the public domain's Host header, and adjust the upload limit/timeouts for video. Do not enable the edge profile if its ports are already in use. On a managed container platform, use the same Dockerfile, mount a volume at `/app/data`, set APP_ORIGIN/PUBLIC_BASE_URL to the HTTPS URL provided, set HOSTNAME=0.0.0.0, and run only one replica.

## 6. Verify before the team uses it

1. HTTPS and `/health` succeed, with no certificate warning.
2. The page asks for an existing login; the setup endpoint refuses to create a second owner.
3. The old owner login works and the old content/media appear.
4. Test the local design and an image/video upload on a test draft.
5. Restart the container; accounts, media, and drafts are still there.
6. Create editor invitations only for team members the owner chooses.
7. Instagram stays off until the Meta Developer callback, public domain, and permissions are correct. Update the callback domain to the server's before connecting the account. Website measurement also needs the new Studio domain and the tracker installed.

Moving online does not automatically enable publishing, call paid AI services, or send messages to prospective customers. Local tests use separate test data, not the user's Instagram account.

## Daily automatic backup (production)

The server runs `deploy/backup.sh` every day at **02:30 WIB** through the systemd timer `vayora-studio-backup.timer` (unit files are in `deploy/systemd/`). Each backup is stored in `/opt/vayora-social-studio/backups/daily/<UTC time>/` and contains:

- `studio.sqlite`: a consistent copy of the database, taken with the SQLite backup API inside the container (the app is not shut down).
- `.encryption-key`: the key that unlocks the tokens/secrets in the database. A backup without this key cannot restore Instagram/YouTube connections.
- `media/`: uploaded files. Unchanged files are hard links to the previous backup, so a daily backup only uses space for new files.
- `manifest.txt`: the check results (`integrity`, content count, media rows, missing files, key size).

A backup is only kept if the database passes `PRAGMA integrity_check`, every media row has a file, and the key is 32 bytes. Only the 14 most recent backups are kept (`KEEP_DAYS`).

Commands on the server:

```sh
systemctl list-timers vayora-studio-backup.timer      # next run
systemctl start vayora-studio-backup.service           # back up now
journalctl -u vayora-studio-backup.service -n 20       # latest result
cat /opt/vayora-social-studio/backups/daily/*/manifest.txt
```

**Off-server copy (Google Drive).** After the local backup passes verification, `deploy/backup-offsite.sh` packs the backup folder, encrypts it with [age](https://age-encryption.org/) for the public key in `/root/.config/vayora-backup/age.pub`, uploads it with rclone to `gdrive:Vayora Social Studio Backups/vayora-studio-<time>.tar.gz.age` (Vayora's Google Owner account, `drive.file` scope: rclone only sees files it created), confirms the file size on Drive matches, then keeps the 14 most recent archives. A failed upload makes the service fail so it shows up in `journalctl`.

- The **private key** that opens the archives is **not on the server**. The owner keeps it outside the server (password manager); without it the archives on Drive cannot be opened.
- **Restoring from Drive:** `rclone copy "gdrive:Vayora Social Studio Backups/<file>.tar.gz.age" .` then `age -d -i <private-key> <file>.tar.gz.age | tar -xzf - -C restore/`, then follow the restore steps below.
- **Setting up again on a new server:** `apt-get install rclone age`, `rclone config create gdrive drive scope=drive.file` (authorize through the SSH tunnel `-L 53682:127.0.0.1:53682` and a browser on your PC), and save the public key to `/root/.config/vayora-backup/age.pub`.

**Restoring:** stop the app in Coolify; copy `studio.sqlite`, `.encryption-key`, and the contents of `media/` from the backup folder to `/opt/vayora-social-studio/data/`; delete `studio.sqlite-wal` and `studio.sqlite-shm`; run `chown -R 1000:1000 /opt/vayora-social-studio/data`; then start the app again and check login, the library, and the connection status. Users need to log in again if the sessions in the backup have expired.

## Updates and backups

Back up the entire data folder together with the key to private storage. For a plain file backup, stop the app briefly so the database/WAL is consistent, copy the full folder, then start it again. A migration snapshot turns publishing off and removes sessions on the copy, so it differs from a raw restore backup.

On Coolify production, an update is just a push to `main`; back up the data folder first if the change touches the database schema or migrations. On a manual Compose installation, back up first, update the source, then build and recreate the app service with the same Compose files. Keep the data folder and the project/volume names. Never run `down -v` in production. Test login/media and the connection status after the update. Make sure the backup can actually be restored before relying on it.

Official references: [Hostinger Docker Manager](https://www.hostinger.com/support/12040789-hostinger-docker-manager-for-vps-simplify-your-container-deployments/), [Docker Compose variables](https://docs.docker.com/compose/how-tos/environment-variables/variable-interpolation/), [Caddy HTTPS](https://caddyserver.com/docs/automatic-https), [Railway volumes](https://docs.railway.com/volumes/reference).
