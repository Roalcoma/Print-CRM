#!/usr/bin/env bash
# Prueba de restauración: baja de Drive el último backup del CRM, lo descifra, lo restaura en
# un Postgres temporal y compara el número de filas con la BD de producción.
set -Eeuo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
WORK="$(mktemp -d)"; trap 'docker rm -f crm_restore_test >/dev/null 2>&1 || true; rm -rf "$WORK"' EXIT

rclone() { docker run --rm --user "$(id -u):$(id -g)" -v "$DIR/rclone:/config/rclone" -v "$WORK:/data" rclone/rclone:latest "$@"; }

LAST="$(rclone lsf gdrive:rocco-backups --include 'crm_*.dump.gpg' | sort | tail -1)"
[ -n "$LAST" ] || { echo "No hay backups en Drive"; exit 1; }
echo "Último backup en Drive: $LAST"
rclone copy "gdrive:rocco-backups/$LAST" /data
gpg --batch --quiet --pinentry-mode loopback --passphrase-file "$DIR/.passphrase" -d "$WORK/$LAST" > "$WORK/crm.dump"

docker run -d --name crm_restore_test -e POSTGRES_PASSWORD=test -e POSTGRES_USER=crm -e POSTGRES_DB=crm postgres:17-alpine >/dev/null
until docker exec crm_restore_test pg_isready -U crm -d crm >/dev/null 2>&1; do sleep 1; done
sleep 2
docker cp "$WORK/crm.dump" crm_restore_test:/tmp/crm.dump
docker exec crm_restore_test pg_restore -U crm -d crm --no-owner /tmp/crm.dump

Q="SELECT 'organizations', count(*) FROM organizations UNION ALL SELECT 'users', count(*) FROM users
   UNION ALL SELECT 'contacts', count(*) FROM contacts UNION ALL SELECT 'opportunities', count(*) FROM opportunities
   UNION ALL SELECT 'conversations', count(*) FROM conversations UNION ALL SELECT 'conv_messages', count(*) FROM conv_messages
   UNION ALL SELECT 'appointments', count(*) FROM appointments"
echo "tabla | restaurado | producción"
join -t'|' <(docker exec crm_restore_test psql -U crm -d crm -tA -c "$Q" | sort) \
           <(docker exec crm_db psql -U crm -d crm -tA -c "$Q" | sort)
