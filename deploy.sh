#!/usr/bin/env bash
# Despliega el CRM al servidor de producción.
# Uso: ./deploy.sh
# Requiere: rsync, ssh con acceso al servidor.

set -euo pipefail

SERVER_USER="rodrigo"
SERVER_HOST="192.168.0.123"
SERVER_PASS="4n4m3r25.."
REMOTE_DIR="/home/rodrigo/crm-prod"

# Usar sshpass si está disponible, si no intentar con clave SSH
SSH_CMD="ssh"
SCP_CMD="rsync"
if command -v sshpass &> /dev/null; then
  SSH_CMD="sshpass -p '${SERVER_PASS}' ssh -o StrictHostKeyChecking=no"
  SCP_CMD="sshpass -p '${SERVER_PASS}' rsync"
fi

echo "▶ Sincronizando código al servidor ${SERVER_HOST}…"
eval "${SCP_CMD}" -az --delete \
  --exclude 'node_modules' \
  --exclude '.env' \
  --exclude 'server/.env' \
  --exclude 'web/dist' \
  --exclude '.git' \
  --exclude '*.log' \
  . "${SERVER_USER}@${SERVER_HOST}:${REMOTE_DIR}"

echo "▶ Construyendo y levantando contenedores en el servidor…"
eval "${SSH_CMD}" "${SERVER_USER}@${SERVER_HOST}" "
  cd ${REMOTE_DIR}

  # Crear .env si no existe (primera vez)
  if [ ! -f .env ]; then
    cp .env.prod.example .env
    echo ''
    echo '⚠️  PRIMERA VEZ: edita ${REMOTE_DIR}/.env con los valores reales antes de continuar.'
    echo '   Luego vuelve a ejecutar ./deploy.sh'
    exit 1
  fi

  docker compose -f docker-compose.prod.yml pull --quiet
  docker compose -f docker-compose.prod.yml up --build -d
  docker compose -f docker-compose.prod.yml ps
"

echo ""
echo "✅ Deploy completado. CRM disponible en http://${SERVER_HOST}:3100"
