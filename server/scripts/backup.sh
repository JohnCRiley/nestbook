#!/usr/bin/env bash
# =============================================================================
# NestBook — SQLite database backup script
#
# Database location: /opt/nestbook/server/db/nestbook.db
#
# This script is intended to be run by cron (see setup-backups.sh).
# It can also be run manually at any time:
#   bash /opt/nestbook/server/scripts/backup.sh
#
# Backups are stored in:    /root/backups/nestbook/
# Log file:                 /var/log/nestbook-backup.log
# Retention:                last 30 backups (older ones deleted automatically)
# =============================================================================

set -euo pipefail

# ── Config ────────────────────────────────────────────────────────────────────
DB_FILE="/opt/nestbook/server/db/nestbook.db"
BACKUP_DIR="/root/backups/nestbook"
LOG_FILE="/var/log/nestbook-backup.log"
KEEP_LAST=30

TIMESTAMP="$(date '+%Y-%m-%d-%H-%M')"
BACKUP_FILE="${BACKUP_DIR}/nestbook-backup-${TIMESTAMP}.db"

# ── Logging helper ─────────────────────────────────────────────────────────────
log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"
}

# ── Pre-flight checks ──────────────────────────────────────────────────────────
if [[ ! -f "$DB_FILE" ]]; then
  log "ERROR: Database file not found: $DB_FILE"
  exit 1
fi

if [[ ! -d "$BACKUP_DIR" ]]; then
  log "ERROR: Backup directory does not exist: $BACKUP_DIR (run setup-backups.sh first)"
  exit 1
fi

# ── Perform backup ─────────────────────────────────────────────────────────────
# Use SQLite's backup API via the sqlite3 CLI if available, otherwise cp.
# The .backup command does a safe hot-copy — consistent even if the app is running.
if command -v sqlite3 &>/dev/null; then
  if sqlite3 "$DB_FILE" ".backup '${BACKUP_FILE}'"; then
    log "OK: Backup created via sqlite3 hot-copy: ${BACKUP_FILE}"
  else
    log "ERROR: sqlite3 backup failed for ${DB_FILE}"
    exit 1
  fi
else
  # Fallback: plain copy (safe when the app is idle; fine for SQLite in WAL mode)
  if cp "$DB_FILE" "$BACKUP_FILE"; then
    log "OK: Backup created via cp (sqlite3 not installed): ${BACKUP_FILE}"
  else
    log "ERROR: cp backup failed for ${DB_FILE}"
    exit 1
  fi
fi

# ── Verify backup is non-empty ─────────────────────────────────────────────────
BACKUP_SIZE="$(stat -c%s "$BACKUP_FILE" 2>/dev/null || echo 0)"
if [[ "$BACKUP_SIZE" -lt 4096 ]]; then
  log "ERROR: Backup file is suspiciously small (${BACKUP_SIZE} bytes) — something may be wrong"
  rm -f "$BACKUP_FILE"
  exit 1
fi

log "INFO: Backup size: ${BACKUP_SIZE} bytes"

# ── Prune old backups (keep last $KEEP_LAST) ──────────────────────────────────
BACKUP_COUNT="$(find "$BACKUP_DIR" -maxdepth 1 -name 'nestbook-backup-*.db' | wc -l)"

if [[ "$BACKUP_COUNT" -gt "$KEEP_LAST" ]]; then
  DELETE_COUNT=$(( BACKUP_COUNT - KEEP_LAST ))
  log "INFO: ${BACKUP_COUNT} backups found — pruning ${DELETE_COUNT} oldest"
  find "$BACKUP_DIR" -maxdepth 1 -name 'nestbook-backup-*.db' \
    | sort \
    | head -n "$DELETE_COUNT" \
    | while read -r OLD_FILE; do
        rm -f "$OLD_FILE"
        log "INFO: Deleted old backup: ${OLD_FILE}"
      done
else
  log "INFO: ${BACKUP_COUNT} backups on disk (limit: ${KEEP_LAST}) — no pruning needed"
fi

log "OK: Backup complete"
