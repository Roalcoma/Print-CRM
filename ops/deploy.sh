#!/usr/bin/env bash
# Despliegue de Rocco CRM a producción con un solo comando. Uso: ops/deploy.sh --help
set -Eeuo pipefail

uso() {
  cat <<'EOF'
Uso: ops/deploy.sh [opciones]

  --dry-run      Hace todas las comprobaciones locales y muestra qué se sincronizaría,
                 sin escribir nada en producción.
  --skip-tests   No corre los tests (el typecheck sí se hace siempre).
  --force        Continúa aunque producción tenga cambios que no vienen del último deploy.
  --base COMMIT  Commit que está desplegado en producción (si falta .deployed-commit).
  -h, --help     Muestra esta ayuda.

Variables: DEPLOY_HOST, DEPLOY_DIR, DEPLOY_PUBLIC_URL, DEPLOY_HEALTH_TIMEOUT, TEST_BASE_URL.
EOF
}

DRY=0; SKIP_TESTS=0; FORCE=0; BASE=""
while (($#)); do
  case "$1" in
    --dry-run) DRY=1 ;;
    --skip-tests) SKIP_TESTS=1 ;;
    --force) FORCE=1 ;;
    --base) BASE="${2:?--base necesita un commit}"; shift ;;
    -h|--help) uso; exit 0 ;;
    *) uso >&2; exit 2 ;;
  esac
  shift
done

source "$(dirname "$0")/lib.sh"
ROOT="$(git -C "$(dirname "$0")" rev-parse --show-toplevel)"
cd "$ROOT"
TMP="$(mktemp -d)"
FASE="local"          # local → sincronizado → finalizado (para saber si hay que revertir)
trap 'cerrar_ssh; rm -rf "$TMP"' EXIT
trap 'al_fallar $LINENO' ERR

al_fallar() {
  trap - ERR
  printf '%s✘ Error inesperado en la línea %s (fase: %s)%s\n' "$c_red" "$1" "$FASE" "$c_off" >&2
  if [[ $FASE == sincronizado ]]; then revertir "error inesperado en la línea $1"; fi
  exit 1
}

revertir() {
  FASE="revirtiendo"
  paso "Rollback automático: $1"
  if restaurar_version_anterior; then
    ok "Versión anterior restaurada (imagen rocco-crm:previous + archivos de .deploy-prev)"
  else
    aviso "El rollback automático también falló: revisar a mano con ops/rollback.sh"
  fi
  if [[ -n ${MIGRACIONES_NUEVAS:-} ]]; then
    aviso "Se ejecutaron migraciones nuevas; la BD NO se revierte. Revisar compatibilidad:"
    printf '     %s\n' $MIGRACIONES_NUEVAS >&2
  fi
  notificar "❌ Deploy de Rocco CRM FALLIDO (${SHORT}): $1. Rollback a la versión anterior.${MIGRACIONES_NUEVAS:+ Ojo: hubo migraciones nuevas (la BD no se revierte).}"
  exit 1
}

# ── 1. Comprobaciones locales ────────────────────────────────────────────────
paso "Comprobaciones locales"
SUCIO="$(git status --porcelain --untracked-files=all -- "${DEPLOY_PATHS[@]}")"
[[ -z $SUCIO ]] || morir "Hay cambios sin commitear en rutas que se despliegan:
$SUCIO"
COMMIT="$(git rev-parse HEAD)"; SHORT="$(git rev-parse --short HEAD)"
ok "Árbol limpio en $SHORT ($(git log -1 --format=%s))"

for d in server web; do
  [[ -d $d/node_modules ]] || morir "Falta $d/node_modules: ejecuta 'npm ci' en $d/"
done
(cd server && npx --no-install tsc --noEmit) || morir "Typecheck del server falló"
ok "Typecheck server"
(cd web && npx --no-install vue-tsc --noEmit) || morir "Typecheck de web falló"
ok "Typecheck web"

if ((SKIP_TESTS)); then
  aviso "Tests omitidos (--skip-tests)"
else
  TEST_BASE_URL="${TEST_BASE_URL:-http://localhost:3199}"
  [[ $TEST_BASE_URL != *rocco.arbolaureo.org* ]] || morir "TEST_BASE_URL no puede apuntar a producción"
  curl -s -m 5 -o /dev/null "$TEST_BASE_URL/api/auth/signup" \
    || morir "No hay servidor de pruebas en $TEST_BASE_URL (levántalo o usa --skip-tests)"
  scripts="$(cd server && node -p "Object.keys(require('./package.json').scripts||{}).join(' ')")"
  for s in test:isolation test test:flows; do
    [[ " $scripts " == *" $s "* ]] || continue
    (cd server && TEST_BASE_URL="$TEST_BASE_URL" npm run --silent "$s") || morir "Falló 'npm run $s'"
    ok "Tests: $s"
  done
fi

# Copia exacta del commit (no del árbol de trabajo) para sincronizar
mkdir -p "$TMP/nuevo" "$TMP/base"
git archive HEAD "${DEPLOY_PATHS[@]}" | tar -x -C "$TMP/nuevo"

# ── 2. Cambios hechos directamente en producción ─────────────────────────────
paso "Comparando producción con el último commit desplegado"
rssh true || morir "Sin acceso SSH a $HOST"
PREV_COMMIT="$(rssh cat .deployed-commit 2>/dev/null || true)"
if [[ -n $BASE ]]; then
  BASE="$(git rev-parse --verify "$BASE^{commit}")" || morir "Commit --base desconocido"
elif [[ -n $PREV_COMMIT ]]; then
  BASE="$PREV_COMMIT"
  git cat-file -e "$BASE^{commit}" 2>/dev/null || morir "El commit desplegado $BASE no existe localmente (haz git fetch)"
else
  BASE="$COMMIT"
  aviso "Producción no tiene .deployed-commit: se compara contra HEAD (usa --base si sabes qué commit está)"
fi
echo "  Desplegado: ${PREV_COMMIT:-desconocido}  ·  Base de comparación: $(git rev-parse --short "$BASE")  ·  Nuevo: $SHORT"

git archive "$BASE" "${DEPLOY_PATHS[@]}" 2>/dev/null | tar -x -C "$TMP/base" || true
(cd "$TMP/base" && find . -type f -printf '%P\0' | sort -z | xargs -0 -r md5sum) > "$TMP/base.md5"
# Mismo listado en producción, con las mismas exclusiones que rsync
rssh bash -c '
  args=(); for e in "$@"; do if [[ $e == */* ]]; then args+=( -path "$e" -o ); else args+=( -name "$e" -o ); fi; done
  find server web Dockerfile docker-compose.prod.yml .dockerignore \
    \( "${args[@]}" -false \) -prune -o -type f -printf "%p\0" 2>/dev/null | sort -z | xargs -0 -r md5sum
' _ "${EXCLUDES[@]}" > "$TMP/prod.md5"

DERIVA="$({ diff <(sort -k2 "$TMP/base.md5") <(sort -k2 "$TMP/prod.md5") || true; } | awk '
  /^[<>]/ { f=substr($0, 37); if ($1=="<") b[f]=1; else p[f]=1 }
  END { for (f in b) print (f in p ? "  modificado en prod: " : "  borrado en prod:    ") f
        for (f in p) if (!(f in b)) print "  nuevo en prod:      " f }' | sort)"
if [[ -z $DERIVA ]]; then
  ok "Producción coincide con la base"
elif ((FORCE)); then
  aviso "Producción difiere de la base; se sobrescribirá (--force):"; echo "$DERIVA"
elif ((DRY)); then
  aviso "Producción difiere de la base (el deploy real se detendría sin --force):"; echo "$DERIVA"
else
  echo "$DERIVA"
  morir "Producción tiene cambios que no vienen del último deploy y se perderían. Pásalos al repo o usa --force."
fi

# Migraciones del commit nuevo que producción aún no tiene
MIGRACIONES_NUEVAS="$(cd "$TMP/nuevo" && find server/migrations -type f -printf '%p\n' | sort \
  | while read -r f; do grep -q "  $f\$" "$TMP/prod.md5" || echo "$f"; done)"
if [[ -n $MIGRACIONES_NUEVAS ]]; then
  aviso "Migraciones nuevas (corren al arrancar y NO se revierten en un rollback):"
  printf '     %s\n' $MIGRACIONES_NUEVAS
else
  ok "Sin migraciones nuevas"
fi

# ── 3. Sincronización ────────────────────────────────────────────────────────
# -c: compara contenido (git archive no conserva mtimes); sin -t ni -p para no tocar fechas ni permisos
RSYNC=(rsync -rlzc --delete --itemize-changes -e "ssh ${SSH_OPTS[*]}")
for e in "${EXCLUDES[@]}"; do RSYNC+=(--exclude="$e"); done
SRC=(); for p in "${DEPLOY_PATHS[@]}"; do [[ -e $TMP/nuevo/$p ]] && SRC+=("$TMP/nuevo/$p"); done

if ((DRY)); then
  paso "Archivos que se sincronizarían (rsync -n)"
  CAMBIOS="$("${RSYNC[@]}" -n "${SRC[@]}" "$HOST:$REMOTE_DIR/")"
  echo "${CAMBIOS:-  (ninguno)}"
  paso "Estado actual de producción (solo lectura)"
  code="$(curl -s -m 10 -o /dev/null -w '%{http_code}' "$PUBLIC_URL/api/auth/signup" || true)"
  echo "  $PUBLIC_URL/api/auth/signup → HTTP $code"
  echo "  Imágenes: $(rssh docker images rocco-crm --format '{{.Tag}}' | tr '\n' ' ')"
  ok "Dry-run terminado: no se tocó nada en producción"
  exit 0
fi

WA_ANTES="$(estado_whatsapp)"
paso "Respaldo de la versión actual (archivos + imagen)"
rssh bash -c '
  set -e
  mkdir -p .deploy-prev
  rsync -a --delete "${@/#/--exclude=}" server web Dockerfile docker-compose.prod.yml .deploy-prev/
  if [ -f .dockerignore ]; then cp -p .dockerignore .deploy-prev/; else rm -f .deploy-prev/.dockerignore; fi
  if [ -f .deployed-commit ]; then cp -p .deployed-commit .deploy-prev/; else rm -f .deploy-prev/.deployed-commit; fi
  docker tag rocco-crm:latest rocco-crm:previous
' _ "${EXCLUDES[@]}"
ok "Archivos en .deploy-prev/ e imagen rocco-crm:previous"

paso "Sincronizando código ($SHORT)"
FASE="sincronizado"
"${RSYNC[@]}" "${SRC[@]}" "$HOST:$REMOTE_DIR/"

# ── 4. Build y arranque (solo el servicio app; sin tocar db ni otros contenedores) ──
paso "Reconstruyendo y levantando crm_app"
DESDE="$(rssh date -u +%Y-%m-%dT%H:%M:%SZ)"
rssh bash -c "$COMPOSE up --build -d --no-deps app" || revertir "falló el build o el arranque"

# ── 5. Verificación de salud ─────────────────────────────────────────────────
paso "Verificando salud (hasta ${HEALTH_TIMEOUT}s)"
api=0; web=0; fin=$((SECONDS + HEALTH_TIMEOUT))
while ((SECONDS < fin)); do
  logs="$(rssh docker logs --since "$DESDE" crm_app 2>&1 || true)"
  if ((!api)) && [[ $logs == *"API en"* ]]; then
    api=1; ok "Logs: la API arrancó"
  fi
  if ((api)); then
    resp="$(curl -s -m 10 -w '\n%{http_code}' "$PUBLIC_URL/api/auth/signup" || true)"
    if [[ ${resp##*$'\n'} == 200 && ${resp%$'\n'*} == \{* ]]; then web=1; ok "$PUBLIC_URL/api/auth/signup → 200 JSON"; break; fi
  fi
  sleep 3
done
if ((!api || !web)); then
  echo "── Últimas líneas de crm_app ──"; rssh docker logs --since "$DESDE" --tail 30 crm_app 2>&1 || true
  revertir "la verificación de salud no pasó en ${HEALTH_TIMEOUT}s (api=$api, web=$web)"
fi
ERRORES="$(rssh docker logs --since "$DESDE" crm_app 2>&1 | grep -iE '\berror\b|fatal|exception' | grep -v '^\[alerts\]' | tail -5 || true)"
[[ -z $ERRORES ]] || { aviso "Hay errores en los logs de arranque (no bloquean):"; echo "$ERRORES"; }

WA_DESPUES="$(estado_whatsapp)"
if [[ $WA_DESPUES == open ]]; then
  ok "WhatsApp de VFS: open"
elif [[ $WA_ANTES == open ]]; then
  revertir "el WhatsApp de VFS pasó de open a '$WA_DESPUES'"
else
  aviso "WhatsApp de VFS: '$WA_DESPUES' (ya estaba '$WA_ANTES' antes del deploy)"
fi

# ── 6. Registro y aviso ──────────────────────────────────────────────────────
printf '%s\n' "$COMMIT" | rssh bash -c 'cat > .deployed-commit'
FASE="finalizado"
ok "Commit desplegado registrado en $REMOTE_DIR/.deployed-commit"
notificar "✅ Rocco CRM desplegado: ${SHORT} — $(git log -1 --format=%s)${MIGRACIONES_NUEVAS:+ (con migraciones nuevas)}"
paso "${c_grn}Deploy completado: $SHORT en $PUBLIC_URL${c_off}"
