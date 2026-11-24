#!/bin/sh
# Copies one verified backup (default: the newest) to off-server storage, encrypted.
#
# The backup folder is packed (tar.gz, hard links stored as file contents) and encrypted with age for the public
# key in AGE_RECIPIENT_FILE; only the matching private key, kept OFF the server, can open it. The file is uploaded
# with rclone to OFFSITE_REMOTE, its size is checked on the remote, and only the newest OFFSITE_KEEP archives stay.
#
# Restore on any machine with the private key:
#   rclone copy "gdrive:Vayora Social Studio Backups/<file>.tar.gz.age" .
#   age -d -i vayora-studio-backup-private.key <file>.tar.gz.age | tar -xzf - -C restored/
set -eu

APP_ROOT=${APP_ROOT:-/opt/vayora-social-studio}
BACKUP_ROOT=${BACKUP_ROOT:-$APP_ROOT/backups/daily}
OFFSITE_REMOTE=${OFFSITE_REMOTE:-gdrive:Vayora Social Studio Backups}
AGE_RECIPIENT_FILE=${AGE_RECIPIENT_FILE:-/root/.config/vayora-backup/age.pub}
OFFSITE_KEEP=${OFFSITE_KEEP:-14}

log() { printf '%s %s\n' "$(date -u +%FT%TZ)" "$*"; }
fail() { log "ERROR: $*" >&2; exit 1; }

[ -s "$AGE_RECIPIENT_FILE" ] || fail "age public key missing: $AGE_RECIPIENT_FILE"
SOURCE=${1:-$(find "$BACKUP_ROOT" -mindepth 1 -maxdepth 1 -type d -name '20*' | sort | tail -n 1)}
[ -n "$SOURCE" ] && [ -f "$SOURCE/manifest.txt" ] || fail "no verified backup to upload"

NAME=vayora-studio-$(basename "$SOURCE").tar.gz.age
umask 077
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

tar -C "$SOURCE" -czf - . | age -R "$AGE_RECIPIENT_FILE" -o "$WORK/$NAME" || fail "packing or encryption failed"
LOCAL_SIZE=$(stat -c %s "$WORK/$NAME")

rclone copyto "$WORK/$NAME" "$OFFSITE_REMOTE/$NAME" --retries 3 || fail "upload failed"
REMOTE_SIZE=$(rclone lsf --format s "$OFFSITE_REMOTE/$NAME" 2>/dev/null | head -n 1)
[ "$REMOTE_SIZE" = "$LOCAL_SIZE" ] || fail "remote size $REMOTE_SIZE does not match local $LOCAL_SIZE"
log "offsite ok: $OFFSITE_REMOTE/$NAME ($LOCAL_SIZE bytes)"

rclone lsf --files-only --include 'vayora-studio-*.tar.gz.age' "$OFFSITE_REMOTE" | sort | head -n "-$OFFSITE_KEEP" | while read -r old; do
  rclone deletefile "$OFFSITE_REMOTE/$old" && log "removed old offsite backup $old"
done
