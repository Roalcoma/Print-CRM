#!/usr/bin/env bash
# Rollback manual: vuelve a la versión anterior al último deploy (imagen rocco-crm:previous
# + archivos de .deploy-prev). La base de datos NO se revierte.
set -Eeuo pipefail
source "$(dirname "$0")/lib.sh"
trap cerrar_ssh EXIT

[[ ${1:-} == -y ]] || {
  echo "Esto restaura en $HOST la versión anterior al último deploy de Rocco CRM."
  echo "Actual: $(rssh cat .deployed-commit 2>/dev/null || echo desconocido)  →  Anterior: $(rssh cat .deploy-prev/.deployed-commit 2>/dev/null || echo desconocido)"
  read -rp "¿Continuar? [s/N] " r; [[ $r == [sS] ]] || exit 1
}

paso "Restaurando versión anterior"
restaurar_version_anterior
sleep 10
logs="$(rssh docker logs --since 30s crm_app 2>&1 || true)"
[[ $logs == *"API en"* ]] && ok "La API arrancó" || aviso "No aparece 'API en' en los logs aún: revisar 'docker logs crm_app'"
aviso "Si el deploy revertido traía migraciones, siguen aplicadas en la BD"
notificar "↩️ Rollback manual de Rocco CRM a $(rssh cat .deployed-commit 2>/dev/null | cut -c1-7 || echo 'la versión anterior')"
ok "Rollback terminado"
