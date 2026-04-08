#!/bin/bash
# NestBook — Deployment Update Script
# Run on the server to pull the latest code and redeploy:
#   bash /opt/nestbook/update.sh

set -e

LOG=/root/UPDATE_STATUS.txt
echo "NESTBOOK UPDATE LOG"                         > $LOG
echo "==============================="            >> $LOG
echo "Started: $(date '+%Y-%m-%d %H:%M:%S')"     >> $LOG
echo ""                                           >> $LOG

log() { echo "[$(date '+%H:%M:%S')] $1" | tee -a $LOG; }

cd /opt/nestbook

log "Pulling latest code from GitHub..."
git pull origin main
log "Code updated."

log "Installing dependencies..."
npm install
log "Dependencies installed."

log "Building React frontend..."
cd /opt/nestbook/client && npm run build
log "Frontend built to client/dist/."

log "Syncing shared assets to server/public/..."
cp /opt/nestbook/client/public/icon.svg     /opt/nestbook/server/public/icon.svg
cp /opt/nestbook/client/public/manifest.json /opt/nestbook/server/public/manifest.json
log "Shared assets synced."

log "Updating nginx config..."
cp /opt/nestbook/server/nginx.conf /etc/nginx/sites-available/nestbook
nginx -t
systemctl reload nginx
log "nginx reloaded."

log "Restarting app..."
pm2 restart nestbook-api
log "App restarted."

echo ""                                                      >> $LOG
echo "==============================="                       >> $LOG
echo "UPDATE COMPLETE"                                       >> $LOG
echo "Completed: $(date '+%Y-%m-%d %H:%M:%S')"              >> $LOG
echo "==============================="                       >> $LOG

echo ""
echo "==============================="
echo "UPDATE COMPLETE"
echo "==============================="
pm2 status
