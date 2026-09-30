# Funciones y configuración comunes de ops/deploy.sh y ops/rollback.sh (se carga con `source`).

HOST="${DEPLOY_HOST:-rodrigo@100.101.243.74}"
REMOTE_DIR="${DEPLOY_DIR:-crm-prod}"                 # relativo al HOME remoto
PUBLIC_URL="${DEPLOY_PUBLIC_URL:-https://rocco.arbolaureo.org}"
HEALTH_TIMEOUT="${DEPLOY_HEALTH_TIMEOUT:-60}"        # segundos
COMPOSE="docker compose -f docker-compose.prod.yml"

# Rutas que se despliegan y exclusiones que --delete nunca debe tocar en producción
DEPLOY_PATHS=(server web Dockerfile docker-compose.prod.yml .dockerignore)
EXCLUDES=(node_modules .env web/dist .git '*.log' .claude .gstack '*.tsbuildinfo')

c_red=$'\e[31m'; c_grn=$'\e[32m'; c_ylw=$'\e[33m'; c_bld=$'\e[1m'; c_off=$'\e[0m'
[[ -t 1 ]] || { c_red=; c_grn=; c_ylw=; c_bld=; c_off=; }
paso() { printf '\n%s▶ %s%s\n' "$c_bld" "$*" "$c_off"; }
ok()   { printf '%s  ✔ %s%s\n' "$c_grn" "$*" "$c_off"; }
aviso(){ printf '%s  ⚠ %s%s\n' "$c_ylw" "$*" "$c_off" >&2; }
morir(){ printf '%s✘ %s%s\n' "$c_red" "$*" "$c_off" >&2; exit 1; }

# SSH con una sola conexión reutilizada durante todo el script
SSH_CTL_DIR="$(mktemp -d)"
SSH_OPTS=(-o BatchMode=yes -o ConnectTimeout=10 -o ControlMaster=auto
          -o "ControlPath=$SSH_CTL_DIR/%C" -o ControlPersist=120)
cerrar_ssh() { ssh "${SSH_OPTS[@]}" -O exit "$HOST" 2>/dev/null || true; rm -rf "$SSH_CTL_DIR"; }

# rssh CMD ARGS...: ejecuta en el directorio de producción; los argumentos van citados con %q
rssh() { ssh "${SSH_OPTS[@]}" "$HOST" "cd $(printf %q "$REMOTE_DIR") && $(printf '%q ' "$@")"; }

# Envía un aviso a Telegram vía ALERT_WEBHOOK_URL del .env de producción (la URL nunca sale del servidor)
notificar() {
  printf '%s' "$1" | rssh bash -c '
    url=$(grep -m1 "^ALERT_WEBHOOK_URL=" .env | cut -d= -f2- | tr -d "\"'\''\r")
    [ -n "$url" ] || { echo "sin ALERT_WEBHOOK_URL" >&2; exit 1; }
    jq -Rs "{text: .}" | curl -fsS -m 10 -o /dev/null -H "Content-Type: application/json" -d @- "$url"
  ' || aviso "No se pudo enviar el aviso a Telegram"
}

# Estado del WhatsApp de VFS en Evolution (open/close/connecting…); la API key no se imprime
estado_whatsapp() {
  rssh bash -c '
    k=$(docker exec evolution-api printenv AUTHENTICATION_API_KEY 2>/dev/null) || { echo "sin-evolution"; exit 0; }
    s=$(curl -s -m 10 -H "apikey: $k" http://127.0.0.1:8080/instance/connectionState/crm \
      | jq -r ".instance.state // .state // empty" 2>/dev/null)
    echo "${s:-desconocido}"
  ' 2>/dev/null || echo "desconocido"
}

# Restaura archivos (.deploy-prev) e imagen (rocco-crm:previous) y levanta solo el servicio app
restaurar_version_anterior() {
  rssh bash -c '
    set -e
    docker image inspect rocco-crm:previous >/dev/null 2>&1 || { echo "No existe la imagen rocco-crm:previous" >&2; exit 1; }
    if [ -d .deploy-prev ]; then
      rsync -a --delete "${@/#/--exclude=}" .deploy-prev/server .deploy-prev/web .deploy-prev/Dockerfile \
        .deploy-prev/docker-compose.prod.yml ./
      [ -f .deploy-prev/.dockerignore ] && cp -p .deploy-prev/.dockerignore .
      if [ -f .deploy-prev/.deployed-commit ]; then cp -p .deploy-prev/.deployed-commit .; else rm -f .deployed-commit; fi
    else
      echo "Aviso: no hay .deploy-prev; solo se restaura la imagen" >&2
    fi
    docker tag rocco-crm:previous rocco-crm:latest
    '"$COMPOSE"' up -d --no-build --no-deps app
  ' _ "${EXCLUDES[@]}"
}
