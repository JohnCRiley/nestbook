#!/usr/bin/env bash
# =============================================================================
# NestBook — Backup system installer
#
# Run once on your server to set up automated daily database backups:
#   bash /opt/nestbook/server/scripts/setup-backups.sh
#
# What this script does:
#   1. Creates the backup directory (/root/backups/nestbook/)
#   2. Installs backup.sh to the correct location
#   3. Adds a cron job to run the backup every day at 2:00am
#   4. Runs an immediate first backup to confirm everything works
#
# Database location: /opt/nestbook/server/db/nestbook.db
# Backups stored at: /root/backups/nestbook/
# Cron schedule:     Daily at 02:00 (server local time)
# Retention:         Last 30 backups
# =============================================================================

set -euo pipefail

# ── Config ────────────────────────────────────────────────────────────────────
BACKUP_DIR="/root/backups/nestbook"
SCRIPT_SOURCE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/backup.sh"
SCRIPT_DEST="/opt/nestbook/server/scripts/backup.sh"
LOG_FILE="/var/log/nestbook-backup.log"
CRON_SCHEDULE="0 2 * * *"
CRON_CMD="${CRON_SCHEDULE} /usr/bin/env bash ${SCRIPT_DEST} >> ${LOG_FILE} 2>&1"
CRON_MARKER="# nestbook-backup"

# ── Helpers ───────────────────────────────────────────────────────────────────
info()    { echo -e "\033[0;32m[setup]\033[0m $*"; }
warning() { echo -e "\033[0;33m[setup]\033[0m $*"; }
error()   { echo -e "\033[0;31m[setup]\033[0m $*" >&2; }

require_root() {
  if [[ "$EUID" -ne 0 ]]; then
    error "This script must be run as root (or with sudo)"
    exit 1
  fi
}

# ── Main ──────────────────────────────────────────────────────────────────────
require_root

# 1. Create backup directory
info "Creating backup directory: ${BACKUP_DIR}"
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"
info "Done — ${BACKUP_DIR} exists and is root-only (chmod 700)"

# 2. Ensure the backup script is in place and executable
if [[ ! -f "$SCRIPT_DEST" ]]; then
  if [[ -f "$SCRIPT_SOURCE" ]]; then
    info "Copying backup.sh to ${SCRIPT_DEST}"
    cp "$SCRIPT_SOURCE" "$SCRIPT_DEST"
  else
    error "backup.sh not found at ${SCRIPT_SOURCE}"
    error "Make sure both setup-backups.sh and backup.sh are in the same directory"
    exit 1
  fi
else
  info "backup.sh already exists at ${SCRIPT_DEST}"
fi

chmod +x "$SCRIPT_DEST"
info "backup.sh is executable"

# 3. Create log file if it doesn't exist
touch "$LOG_FILE"
chmod 640 "$LOG_FILE"
info "Log file ready: ${LOG_FILE}"

# 4. Install cron job (idempotent — won't add duplicates)
info "Checking cron job..."
CURRENT_CRON="$(crontab -l 2>/dev/null || true)"

if echo "$CURRENT_CRON" | grep -qF "$CRON_MARKER"; then
  warning "Cron job already installed — skipping (remove the '$CRON_MARKER' line from crontab to reinstall)"
else
  # Append the new job to whatever cron entries already exist
  NEW_CRON="${CURRENT_CRON}
${CRON_CMD} ${CRON_MARKER}
"
  echo "$NEW_CRON" | crontab -
  info "Cron job installed: ${CRON_SCHEDULE} daily at 02:00"
fi

# Show the installed cron entry for confirmation
echo ""
info "Current crontab entries containing 'nestbook':"
crontab -l 2>/dev/null | grep nestbook || echo "  (none found — check crontab -l manually)"

# 5. Run an immediate backup to confirm everything works
echo ""
info "Running first backup now to confirm the setup works..."
echo ""

if bash "$SCRIPT_DEST"; then
  echo ""
  info "✓ First backup succeeded"
  echo ""
  info "Backup files in ${BACKUP_DIR}:"
  ls -lh "$BACKUP_DIR"
  echo ""
  info "Last log entries:"
  tail -5 "$LOG_FILE"
else
  echo ""
  error "First backup failed — check the output above and ${LOG_FILE}"
  exit 1
fi

echo ""
info "======================================================================"
info "Backup system installed successfully"
info ""
info "  Backup directory : ${BACKUP_DIR}"
info "  Script           : ${SCRIPT_DEST}"
info "  Log file         : ${LOG_FILE}"
info "  Schedule         : Daily at 02:00 (server local time)"
info "  Retention        : Last 30 backups"
info ""
info "Useful commands:"
info "  Run backup now   : bash ${SCRIPT_DEST}"
info "  View log         : tail -f ${LOG_FILE}"
info "  List backups     : ls -lh ${BACKUP_DIR}"
info "  View cron job    : crontab -l"
info "======================================================================"
