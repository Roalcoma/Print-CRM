# ops/

## Deploy a producción

```bash
ops/deploy.sh --dry-run      # todo lo local + qué se sincronizaría; no toca producción
ops/deploy.sh                # deploy real (typecheck + tests + sync + build + salud)
ops/deploy.sh --skip-tests   # sin tests (el typecheck se hace igual)
```

Pasos: árbol limpio en `server/ web/ Dockerfile docker-compose.prod.yml .dockerignore` → typecheck
server y web → tests (`test:isolation`, y `test`/`test:flows` si existen; necesitan un servidor de
pruebas en `TEST_BASE_URL`, por defecto `http://localhost:3199`) → comparar producción con el
commit de `~/crm-prod/.deployed-commit` → respaldo (`.deploy-prev/` + imagen `rocco-crm:previous`)
→ `rsync` del commit (no del árbol de trabajo) → `up --build -d --no-deps app` → salud (logs
"API en", `/api/auth/signup` 200 JSON, WhatsApp de VFS `open`) → registrar commit → aviso a Telegram.

Si la salud falla, hace rollback automático. Las migraciones **no** se revierten: el script avisa.

Flags extra: `--force` (sobrescribir cambios hechos a mano en producción), `--base COMMIT` (commit
desplegado si falta `.deployed-commit`). Variables: `DEPLOY_HOST`, `DEPLOY_DIR`,
`DEPLOY_PUBLIC_URL`, `DEPLOY_HEALTH_TIMEOUT`.

Solo toca el servicio `app` (`crm_app`): no para `crm_db`, `evolution-api`, `landing/`, ni
contenedores `docker compose run` como `vfs_zoom_campaign`.

## Rollback manual

```bash
ops/rollback.sh       # pide confirmación; -y para no preguntar
```

Vuelve a la imagen `rocco-crm:previous` y a los archivos de `.deploy-prev/` (solo hay un nivel de
respaldo: el estado previo al último deploy).

## Backups

`ops/backup/backup.sh` y `ops/backup/restore-test.sh`.
