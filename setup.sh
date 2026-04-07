#!/bin/bash
# NestBook — Production Setup Script
# Run as root on a fresh Ubuntu 24.04 server:
#   curl -fsSL https://raw.githubusercontent.com/JohnCRiley/nestbook/main/setup.sh | bash

set -e  # exit on any error

LOG=/root/DEPLOY_STATUS.txt
echo "NESTBOOK DEPLOYMENT LOG"            > $LOG
echo "==============================="   >> $LOG
echo "Started: $(date '+%Y-%m-%d %H:%M:%S')" >> $LOG
echo ""                                  >> $LOG

log() { echo "[$(date '+%H:%M:%S')] $1" | tee -a $LOG; }

log "STEP 1/8 — Updating system packages..."
DEBIAN_FRONTEND=noninteractive apt-get update -y
DEBIAN_FRONTEND=noninteractive apt-get upgrade -y \
  -o Dpkg::Options::="--force-confdef" \
  -o Dpkg::Options::="--force-confold"
log "System packages updated."

log "STEP 2/8 — Installing Node.js 24..."
curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
DEBIAN_FRONTEND=noninteractive apt-get install -y nodejs
log "Node.js $(node --version) / npm $(npm --version) installed."

log "STEP 3/8 — Installing nginx, git, certbot, PM2..."
DEBIAN_FRONTEND=noninteractive apt-get install -y nginx git certbot python3-certbot-nginx ufw
npm install -g pm2
log "nginx, git, certbot, PM2 $(pm2 --version) installed."

log "STEP 4/8 — Cloning NestBook repository..."
git clone https://github.com/JohnCRiley/nestbook.git /opt/nestbook
log "Repository cloned to /opt/nestbook."

log "STEP 5/8 — Creating production .env..."
cat > /opt/nestbook/server/.env << 'EOF'
PORT=3001
JWT_SECRET=CHANGE_THIS_TO_A_RANDOM_64_CHARACTER_HEX_STRING
SUPER_ADMIN_PASSWORD=CHANGE_THIS_BEFORE_GOING_LIVE
STRIPE_SECRET_KEY=sk_live_CHANGE_THIS_TO_YOUR_STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET=whsec_CHANGE_THIS_TO_YOUR_STRIPE_WEBHOOK_SECRET
EOF
chmod 600 /opt/nestbook/server/.env
log ".env created at /opt/nestbook/server/.env — edit before going live."

log "STEP 6/8 — Installing dependencies and building frontend..."
cd /opt/nestbook && npm install
cd /opt/nestbook/client && npm run build
log "Frontend built to client/dist/."

log "STEP 7/8 — Initialising database..."
cd /opt/nestbook/server
node --no-warnings=ExperimentalWarning db/seed.js
node --no-warnings=ExperimentalWarning db/migrate.js
log "Database initialised."

log "STEP 8/8 — Starting NestBook with PM2..."
pm2 start "node --no-warnings=ExperimentalWarning --env-file=.env index.js" \
  --name nestbook-api \
  --cwd /opt/nestbook/server
pm2 save
pm2 startup systemd -u root --hp /root | tail -1 | bash
log "PM2 started and registered with systemd."

log "Configuring nginx..."
cp /opt/nestbook/server/nginx.conf /etc/nginx/sites-available/nestbook
ln -sf /etc/nginx/sites-available/nestbook /etc/nginx/sites-enabled/nestbook
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl restart nginx
systemctl enable nginx
log "nginx configured and restarted."

log "Configuring firewall..."
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp    comment 'SSH'
ufw allow 80/tcp    comment 'HTTP'
ufw allow 443/tcp   comment 'HTTPS'
ufw allow 8022/tcp  comment 'Alt SSH'
ufw --force enable
log "Firewall enabled (ports 22, 80, 443, 8022 open)."

echo ""                                                        >> $LOG
echo "==============================="                         >> $LOG
echo "NESTBOOK DEPLOYED"                                       >> $LOG
echo "Completed: $(date '+%Y-%m-%d %H:%M:%S')"                >> $LOG
echo "==============================="                         >> $LOG
echo ""                                                        >> $LOG
echo "NEXT STEPS:"                                             >> $LOG
echo "  1. Edit /opt/nestbook/server/.env with real secrets"   >> $LOG
echo "  2. pm2 restart nestbook-api"                           >> $LOG
echo "  3. certbot --nginx -d yourdomain.com  (after DNS)"     >> $LOG
echo ""                                                        >> $LOG
echo "Demo login: demo@nestbook.io / demo1234"                 >> $LOG

echo ""
echo "==============================="
echo "NESTBOOK DEPLOYED"
echo "==============================="
echo ""
echo "Now edit your secrets:"
echo "  nano /opt/nestbook/server/.env"
echo "  pm2 restart nestbook-api"
