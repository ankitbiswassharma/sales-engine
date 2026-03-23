#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════
# MUSK-IT SALES ENGINE — VPS Setup Script
# Tested on: Ubuntu 22.04 LTS (Hostinger KVM2)
# Run as root: sudo bash setup.sh
# ═══════════════════════════════════════════════════════════════════════

set -e
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'

echo -e "${BLUE}══════════════════════════════════════════${NC}"
echo -e "${BLUE}  Musk-IT Sales Engine — VPS Setup        ${NC}"
echo -e "${BLUE}══════════════════════════════════════════${NC}"

# 1. Update system
echo -e "\n${YELLOW}[1/8] Updating system...${NC}"
apt-get update -qq && apt-get upgrade -y -qq

# 2. Install Node.js 20 LTS
echo -e "${YELLOW}[2/8] Installing Node.js 20...${NC}"
curl -fsSL https://deb.nodesource.com/setup_20.x | bash - -qq
apt-get install -y nodejs -qq
echo -e "${GREEN}✓ Node $(node -v)${NC}"

# 3. Install PM2 (process manager)
echo -e "${YELLOW}[3/8] Installing PM2...${NC}"
npm install -g pm2 -q
echo -e "${GREEN}✓ PM2 installed${NC}"

# 4. Install Nginx
echo -e "${YELLOW}[4/8] Installing Nginx...${NC}"
apt-get install -y nginx -qq
echo -e "${GREEN}✓ Nginx installed${NC}"

# 5. Install Certbot (SSL)
echo -e "${YELLOW}[5/8] Installing Certbot...${NC}"
apt-get install -y certbot python3-certbot-nginx -qq
echo -e "${GREEN}✓ Certbot installed${NC}"

# 6. Create app directory
echo -e "${YELLOW}[6/8] Creating app directory...${NC}"
mkdir -p /var/www/sales-engine/data
echo -e "${GREEN}✓ /var/www/sales-engine created${NC}"

# 7. Create Nginx config
echo -e "${YELLOW}[7/8] Configuring Nginx...${NC}"
cat > /etc/nginx/sites-available/sales.muskit.in << 'NGINX'
server {
    listen 80;
    server_name sales.muskit.in;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 60s;
    }
}
NGINX

ln -sf /etc/nginx/sites-available/sales.muskit.in /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
echo -e "${GREEN}✓ Nginx configured${NC}"

# 8. PM2 startup
echo -e "${YELLOW}[8/8] Setting up PM2 startup...${NC}"
pm2 startup ubuntu -u root --hp /root | tail -1 | bash
echo -e "${GREEN}✓ PM2 startup configured${NC}"

echo ""
echo -e "${GREEN}══════════════════════════════════════════${NC}"
echo -e "${GREEN}  System setup complete!                  ${NC}"
echo -e "${GREEN}══════════════════════════════════════════${NC}"
echo ""
echo -e "Next steps:"
echo -e "  1. ${YELLOW}cd /var/www/sales-engine${NC}"
echo -e "  2. ${YELLOW}# Copy your sales-engine files here${NC}"
echo -e "  3. ${YELLOW}cp .env.example .env && nano .env${NC}  ← fill in your keys"
echo -e "  4. ${YELLOW}cd backend && npm install${NC}"
echo -e "  5. ${YELLOW}pm2 start backend/server.js --name muskit-sales${NC}"
echo -e "  6. ${YELLOW}pm2 save${NC}"
echo -e "  7. ${YELLOW}certbot --nginx -d sales.muskit.in${NC}  ← free SSL"
echo ""
echo -e "Dashboard will be at: ${BLUE}https://sales.muskit.in/admin/dashboard.html${NC}"
