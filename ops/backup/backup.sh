#!/usr/bin/env bash
# Backup diario del CRM: pg_dump de la BD del CRM y de Evolution API, cifrado con GPG
# (AES-256, clave en .passphrase) y subido a Google Drive con rclone. Avisa por Telegram si falla.
# Instalación: ~/crm-backups/{backup.sh,.passphrase,.env,rclone/rclone.conf}; cron 07:00 UTC.
set -Eeuo pipefail
umask 077

DIR="$(cd "$(dirname "$0")" && pwd)"
OUT="$DIR/local"
REMOTE="gdrive:rocco-backups"
KEEP_LOCAL_DAYS=7
KEEP_REMOTE_DAYS=30
TS="$(date -u +%Y-%m-%d_%H%M)"
mkdir -p "$OUT"
# shellcheck disable=SC1091
source "$DIR/.env"   # ALERT_WEBHOOK_URL (n8n) o TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID

notify() {
  if [ -n "${ALERT_WEBHOOK_URL:-}" ]; then
    curl -s -m 15 -X POST "$ALERT_WEBHOOK_URL" -H 'Content-Type: application/json' \
      -d "$(jq -n --arg t "$1" '{text: $t}')" >/dev/null || true
  elif [ -n "${TELEGRAM_BOT_TOKEN:-}" ]; then
    curl -s -m 15 "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
      --data-urlencode chat_id="$TELEGRAM_CHAT_ID" --data-urlencode text="$1" >/dev/null || true
  fi
}
trap 'notify "❌ Backup del CRM FALLÓ ($TS) en la línea $LINENO: $BASH_COMMAND"; exit 1' ERR

rclone() {
  docker run --rm --user "$(id -u):$(id -g)" \
    -v "$DIR/rclone:/config/rclone" -v "$OUT:/data" rclone/rclone:latest "$@"
}

# pg_dump (formato custom, comprimido) → gpg simétrico AES-256
dump() { # contenedor base usuario prefijo
  docker exec "$1" pg_dump -U "$3" -Fc "$2" \
    | gpg --batch --yes --pinentry-mode loopback --passphrase-file "$DIR/.passphrase" \
          --symmetric --cipher-algo AES256 -o "$OUT/$4_$TS.dump.gpg"
  [ -s "$OUT/$4_$TS.dump.gpg" ]
}

dump crm_db crm crm crm
EVO_USER="$(docker exec n8n-db printenv POSTGRES_USER)"
dump n8n-db evolution_db "$EVO_USER" evolution

rclone copy /data "$REMOTE" --include "*_$TS.dump.gpg"
rclone delete "$REMOTE" --min-age "${KEEP_REMOTE_DAYS}d"
find "$OUT" -name '*.dump.gpg' -mtime +"$KEEP_LOCAL_DAYS" -delete

SIZE="$(du -ch "$OUT"/*_"$TS".dump.gpg | tail -1 | cut -f1)"
echo "$(date -u +%FT%TZ) OK $TS $SIZE" >> "$DIR/backup.log"
# Resumen semanal (domingos) para saber que sigue vivo
if [ "$(date -u +%u)" = "7" ]; then
  notify "✅ Backups del CRM al día. Último: $TS ($SIZE). En Drive: $(rclone lsf "$REMOTE" | wc -l) archivos."
fi
