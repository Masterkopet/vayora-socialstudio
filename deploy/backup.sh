#!/bin/sh
# Daily backup of Vayora Social Studio production data on the Docker host.
#
# What it saves in $BACKUP_ROOT/<UTC timestamp>/:
#   studio.sqlite    consistent online copy (SQLite backup API, run inside the app container; no downtime)
#   .encryption-key  the key that decrypts saved tokens/secrets in the database (backups are useless without it)
#   media/           uploaded media; unchanged files are hard links to the previous backup, so each day costs
#                    only the new/changed files
#   manifest.txt     counts and integrity result, for a quick check
#
# A backup is only kept when the database passes PRAGMA integrity_check and every media row has its file.
# Older backups beyond KEEP_DAYS are removed. Exit code is non-zero on any failure (systemd shows it).
#
# Restore: stop the app in Coolify, copy studio.sqlite, .encryption-key and media/ from a backup folder into
# $DATA_DIR (owner UID 1000), remove studio.sqlite-wal/-shm, then start the app. See docs/DEPLOYMENT.md.
set -eu

APP_ROOT=${APP_ROOT:-/opt/vayora-social-studio}
DATA_DIR=${DATA_DIR:-$APP_ROOT/data}
BACKUP_ROOT=${BACKUP_ROOT:-$APP_ROOT/backups/daily}
KEEP_DAYS=${KEEP_DAYS:-14}
CONTAINER_PREFIX=${CONTAINER_PREFIX:-n13j1beipbakpfio81s38fhb}

log() { printf '%s %s\n' "$(date -u +%FT%TZ)" "$*"; }
fail() { log "ERROR: $*" >&2; exit 1; }

STAMP=$(date -u +%Y%m%dT%H%M%SZ)
TARGET=$BACKUP_ROOT/$STAMP
WORK=$BACKUP_ROOT/.incomplete-$STAMP
TMP_NAME=.backup-$STAMP.sqlite

umask 077
mkdir -p "$BACKUP_ROOT"
chmod 700 "$(dirname "$BACKUP_ROOT")" "$BACKUP_ROOT"
trap 'rm -rf "$WORK" "$DATA_DIR/$TMP_NAME"' EXIT

CONTAINER=$(docker ps --filter "name=^/$CONTAINER_PREFIX" --format '{{.Names}}' | head -n 1)
[ -n "$CONTAINER" ] || fail "Studio container ($CONTAINER_PREFIX*) is not running"

# 1. Consistent database copy, taken by the app's own Node runtime while the app keeps running.
docker exec "$CONTAINER" node -e "
const {DatabaseSync,backup}=require('node:sqlite');
backup(new DatabaseSync('/app/data/studio.sqlite',{readOnly:true}),'/app/data/$TMP_NAME').then(()=>process.exit(0),e=>{console.error(e.message);process.exit(1);});
" || fail "database backup failed"

mkdir -p "$WORK"
mv "$DATA_DIR/$TMP_NAME" "$WORK/studio.sqlite"
cp -p "$DATA_DIR/.encryption-key" "$WORK/.encryption-key"

# 2. Media snapshot; unchanged files are hard-linked to the newest previous backup.
PREVIOUS=$(find "$BACKUP_ROOT" -mindepth 1 -maxdepth 1 -type d -name '20*' | sort | tail -n 1)
if [ -n "$PREVIOUS" ] && [ -d "$PREVIOUS/media" ]; then
  rsync -a --link-dest="$PREVIOUS/media" "$DATA_DIR/media/" "$WORK/media/"
else
  rsync -a "$DATA_DIR/media/" "$WORK/media/"
fi

# 3. Verify before accepting the backup.
python3 - "$WORK" <<'PY' > "$WORK/manifest.txt" || fail "verification failed"
import os, sqlite3, sys
root = sys.argv[1]
db = sqlite3.connect(f"file:{os.path.join(root, 'studio.sqlite')}?mode=ro", uri=True)
integrity = db.execute("PRAGMA integrity_check").fetchone()[0]
posts = db.execute("SELECT count(*) FROM posts WHERE status<>'deleted'").fetchone()[0]
paths = [row[0] for row in db.execute("SELECT path FROM media")]
missing = [p for p in paths if not os.path.isfile(os.path.join(root, 'media', p))]
key = os.path.getsize(os.path.join(root, '.encryption-key'))
print(f"integrity={integrity}\nposts={posts}\nmedia_rows={len(paths)}\nmedia_missing={len(missing)}\nkey_bytes={key}")
if integrity != "ok" or missing or key != 32:
    sys.exit(1)
PY

mv "$WORK" "$TARGET"
log "backup ok: $TARGET ($(tr '\n' ' ' < "$TARGET/manifest.txt"))"

# 4. Retention: keep the newest KEEP_DAYS backups.
find "$BACKUP_ROOT" -mindepth 1 -maxdepth 1 -type d -name '20*' | sort | head -n "-$KEEP_DAYS" | while read -r old; do
  rm -rf "$old" && log "removed old backup $old"
done

# 5. Off-server copy (encrypted) when it is set up; a failed upload fails the run so systemd reports it.
OFFSITE=$(dirname "$0")/backup-offsite.sh
if [ -x "$OFFSITE" ] && [ -s "${AGE_RECIPIENT_FILE:-/root/.config/vayora-backup/age.pub}" ] && rclone listremotes 2>/dev/null | grep -q "^${OFFSITE_REMOTE_NAME:-gdrive}:$"; then
  "$OFFSITE" "$TARGET"
else
  log "offsite copy skipped (not configured)"
fi
