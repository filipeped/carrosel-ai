#!/bin/bash
# Carrosel AI — Render Service VPS Installer
# Roda 1x na VPS (como root). Idempotente — pode rodar varias vezes.
#
# Uso:
#   bash install.sh
#
# Depois: edite /opt/carrosel-render/.env com as chaves Supabase + token,
# entao reinicie:   systemctl restart carrosel-render

set -euo pipefail

SERVICE_DIR="/opt/carrosel-render"
SERVICE_USER="root"
PORT=3030
DOMAIN="${RENDER_DOMAIN:-render.digitalpaisagismo.online}"
REPO_RAW="https://raw.githubusercontent.com/filipeped/carrosel-ai/main/vps-render-service"

echo "==> [1/7] Instalando dependencias do sistema (Chromium libs)"
apt-get update -qq
apt-get install -y -qq \
  ca-certificates fonts-liberation libasound2t64 libatk-bridge2.0-0t64 \
  libatk1.0-0t64 libc6 libcairo2 libcups2t64 libdbus-1-3 libexpat1 \
  libfontconfig1 libgbm1 libgcc-s1 libglib2.0-0t64 libgtk-3-0t64 \
  libnspr4 libnss3 libpango-1.0-0 libx11-6 libx11-xcb1 libxcb1 \
  libxcomposite1 libxdamage1 libxext6 libxfixes3 libxrandr2 libxkbcommon0 \
  xdg-utils wget curl git >/dev/null 2>&1

echo "==> [2/7] Criando diretorio $SERVICE_DIR"
mkdir -p "$SERVICE_DIR/fonts"
cd "$SERVICE_DIR"

echo "==> [3/7] Baixando server.js + package.json do GitHub"
curl -fsSL "$REPO_RAW/server.js" -o server.js
curl -fsSL "$REPO_RAW/package.json" -o package.json

echo "==> [4/7] Baixando fontes Fraunces/Archivo/JetBrainsMono"
for font in Fraunces-Light.woff2 Fraunces-Regular.woff2 Fraunces-Italic.woff2 \
            Fraunces-LightItalic.woff2 Archivo-Regular.woff2 Archivo-Medium.woff2 \
            JetBrainsMono-Regular.woff2; do
  curl -fsSL "https://raw.githubusercontent.com/filipeped/carrosel-ai/main/public/fonts/$font" \
    -o "fonts/$font"
done

echo "==> [5/7] npm install (puppeteer baixa Chromium ~180MB)"
export PUPPETEER_CACHE_DIR="$SERVICE_DIR/.cache/puppeteer"
npm install --silent --no-audit --no-fund

echo "==> [6/7] Criando .env (se nao existe) — VOCE PRECISA EDITAR DEPOIS"
if [ ! -f .env ]; then
  cat > .env <<EOF
# Edite estes valores e reinicie: systemctl restart carrosel-render
PORT=$PORT
RENDER_AUTH_TOKEN=PREENCHER_TOKEN_ALEATORIO
SUPABASE_URL=https://hnxrralhlqfsmovwmhrx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=PREENCHER_SERVICE_ROLE_KEY
BRAND_HANDLE=@DIGITALPAISAGISMO
EOF
  echo "   .env criado. EDITE antes de iniciar."
else
  echo "   .env ja existe, mantendo."
fi

echo "==> [7/7] Criando systemd service + Nginx + SSL"

cat > /etc/systemd/system/carrosel-render.service <<EOF
[Unit]
Description=Carrosel AI Render Service
After=network.target

[Service]
Type=simple
User=$SERVICE_USER
WorkingDirectory=$SERVICE_DIR
EnvironmentFile=$SERVICE_DIR/.env
Environment=PUPPETEER_CACHE_DIR=$SERVICE_DIR/.cache/puppeteer
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=5
StandardOutput=append:/var/log/carrosel-render.log
StandardError=append:/var/log/carrosel-render.log

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable carrosel-render >/dev/null 2>&1

cat > /etc/nginx/sites-available/carrosel-render <<EOF
server {
  listen 80;
  server_name $DOMAIN;

  location / {
    proxy_pass http://127.0.0.1:$PORT;
    proxy_http_version 1.1;
    proxy_set_header Host \$host;
    proxy_set_header X-Forwarded-For \$remote_addr;
    proxy_set_header X-Forwarded-Proto \$scheme;
    proxy_read_timeout 300s;
    proxy_send_timeout 300s;
    client_max_body_size 10M;
  }
}
EOF

ln -sf /etc/nginx/sites-available/carrosel-render /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx

echo ""
echo "✅ Instalacao base concluida."
echo ""
echo "PROXIMOS PASSOS MANUAIS:"
echo ""
echo "1. Edite o .env com as chaves:"
echo "   nano $SERVICE_DIR/.env"
echo ""
echo "   Preencha:"
echo "     - RENDER_AUTH_TOKEN (token aleatorio, 32+ caracteres)"
echo "     - SUPABASE_SERVICE_ROLE_KEY (pegar no dashboard Supabase)"
echo ""
echo "   Gere um token aleatorio com:"
echo "     openssl rand -hex 32"
echo ""
echo "2. Inicie o servico:"
echo "   systemctl start carrosel-render"
echo "   systemctl status carrosel-render"
echo ""
echo "3. Configure SSL com Let's Encrypt:"
echo "   certbot --nginx -d $DOMAIN --non-interactive --agree-tos -m digitalpaisagismoads@gmail.com"
echo ""
echo "4. Teste:"
echo "   curl https://$DOMAIN/health"
echo ""
echo "5. Ver logs em tempo real:"
echo "   journalctl -u carrosel-render -f"
echo ""
