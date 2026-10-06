<div align="center">

<img src="docs/banner.svg" alt="Rocco CRM: el CRM para negocios que venden por WhatsApp e Instagram" width="100%">

<br>

**El CRM multi‑tenant para negocios hispanos que venden por WhatsApp e Instagram.**<br>
Leads, bandeja unificada, automatizaciones, agenda y panel de agencia en un solo lugar.

<br>

![Node.js](https://img.shields.io/badge/Node.js-22.18%2B-339933?logo=nodedotjs&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-ESM_nativo-3178C6?logo=typescript&logoColor=white)
![Express](https://img.shields.io/badge/Express-5-13243D?logo=express&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-17-4169E1?logo=postgresql&logoColor=white)
![Vue](https://img.shields.io/badge/Vue-3.5-42B883?logo=vuedotjs&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-v4-06B6D4?logo=tailwindcss&logoColor=white)
![Expo](https://img.shields.io/badge/Expo-57_·_React_Native_0.86-000020?logo=expo&logoColor=white)
<br>
![Tests](https://img.shields.io/badge/tests-100_E2E-F69008)
![Multi-tenant](https://img.shields.io/badge/multi--tenant-aislado_por_organización-13243D)
![Licencia](https://img.shields.io/badge/licencia-privado-lightgrey)

[**rocco.arbolaureo.org**](https://rocco.arbolaureo.org) · [Funciones](#-funciones) · [Arquitectura](#-arquitectura) · [Puesta en marcha](#-puesta-en-marcha-local) · [Despliegue](#-despliegue)

<br>

<img src="docs/screenshots/leads-kanban.png" alt="Tablero de leads de Rocco con etapas, valores y fuentes" width="100%">

</div>

---

## Índice

- [¿Qué es Rocco?](#-qué-es-rocco)
- [Funciones](#-funciones)
- [Arquitectura](#-arquitectura)
- [Stack](#-stack)
- [Estructura del repositorio](#-estructura-del-repositorio)
- [Puesta en marcha local](#-puesta-en-marcha-local)
- [App móvil](#-app-móvil)
- [Despliegue](#-despliegue)
- [Seguridad](#-seguridad)
- [Tests](#-tests)
- [Roadmap](#-roadmap)
- [Créditos](#-créditos)

---

## 🍊 ¿Qué es Rocco?

**Rocco** es un CRM al estilo GoHighLevel hecho por **Árbol Áureo** para negocios hispanos que
venden por chat: inmobiliarias, clínicas, consultorios, academias, tiendas y agencias de
reclutamiento. Junta en una sola pantalla lo que normalmente vive repartido entre WhatsApp, Instagram,
una hoja de cálculo y una agenda:

- **Cada mensaje es un lead.** Quien escribe por WhatsApp, Instagram o Messenger (o comenta una
  publicación) aparece en la bandeja y, si una automatización lo decide, como oportunidad en el kanban.
- **El bot hace el primer contacto.** Saluda, califica con preguntas, envía un video, espera la
  respuesta, agenda la cita y avisa al asesor; tú entras cuando el lead está caliente.
- **Una agencia, muchos clientes.** Árbol Áureo (o cualquier agencia) da de alta cuentas, aplica
  plantillas por sector, gestiona planes y pagos y entra a cualquier cuenta para dar soporte.

Todo es **multi‑tenant**: cada organización ve solo sus datos, y una batería de tests lo comprueba en
cada despliegue.

> [!NOTE]
> Las capturas de este README usan **datos 100 % ficticios** (la "Inmobiliaria Sol Caribe" y la
> "Agencia Horizonte") generados con [`server/scripts/seed-demo.ts`](server/scripts/seed-demo.ts).

---

## ✨ Funciones

### Leads y oportunidades

<table>
<tr>
<td width="50%" valign="top">

**Kanban por pipeline y etapas**

- Varios pipelines por cuenta, etapas con color, arrastrar y soltar.
- Tablero **paginado** por columna (aguanta miles de leads) y vista de lista con filtros y orden.
- Tarjetas configurables: valor, fuente (WhatsApp, Instagram, Anuncio, Referido…), responsable,
  etiquetas, próxima cita y contadores de notas y tareas.
- Totales por etapa, estados abierta / ganada / perdida.

</td>
<td width="50%" valign="top">

**Ficha de la oportunidad**

- Contacto vinculado, etapa, valor, responsable, empresa, fuente y **seguidores** que reciben avisos.
- Pestañas de **notas** y **tareas** (tipo, prioridad, recordatorio, varios asignados).
- Historial de actividad: quién creó, movió de etapa, ganó o comentó.
- **Anuncio de origen**: si el lead llegó desde un anuncio *click‑to‑WhatsApp*, se guarda el anuncio.

</td>
</tr>
<tr>
<td colspan="2"><img src="docs/screenshots/ficha-oportunidad.png" alt="Ficha de una oportunidad con datos del contacto, etapa, valor y seguidores"></td>
</tr>
</table>

### Bandeja unificada

<img src="docs/screenshots/bandeja-unificada.png" alt="Bandeja de conversaciones con un chat de WhatsApp abierto y el anuncio de origen" width="100%">

- **WhatsApp** (vía [Evolution API](https://github.com/EvolutionAPI/evolution-api), varias líneas por cuenta),
  **Instagram DM**, **Messenger** y **comentarios de páginas de Facebook** en una sola lista.
- Pestañas *Sin leer · Todas · Recientes · Guardadas*, búsqueda, adjuntos (imagen, audio, video, documentos).
- Panel lateral con el contacto, sus etiquetas, sus oportunidades y sus citas.
- Tarjeta **"Llegó desde un anuncio de Facebook/Instagram"** con el título, el texto y el ID del anuncio.
- Tiempo real por WebSocket (con ticket de un solo uso, sin token en la URL).
- Monitor de WhatsApp: si una línea se desconecta, aviso dentro de la app y por Telegram.

### Automatizaciones

<table>
<tr>
<td width="50%"><img src="docs/screenshots/editor-automatizaciones.png" alt="Editor visual de automatizaciones con disparador y pasos"></td>
<td width="50%"><img src="docs/screenshots/automatizaciones.png" alt="Listado de automatizaciones con ejecuciones y flujo"></td>
</tr>
</table>

Editor visual de flujos: un **disparador** y una lista de **pasos** que se ejecutan en orden, con
pausas que sobreviven a reinicios del servidor.

| Disparadores | Pasos |
|---|---|
| Nuevo mensaje de WhatsApp | Enviar WhatsApp (texto, **video** o **imagen** de la biblioteca de medios) |
| Contacto creado | Esperar *N* minutos · Esperar respuesta · Esperar hasta *X* antes de la cita |
| Etiqueta añadida | Crear oportunidad en un pipeline y etapa |
| Cita agendada | Notificación interna al equipo (y push al móvil) |
| Cita: no asistió | Detectar el estado de EE. UU. por el código de área |
| Comentario en Instagram (con **filtro de intención**) | Responder el comentario · Enviar DM de Instagram |

Los recordatorios de cita **se reprograman solos** si la cita se reagenda y no se envían si se cancela.
Variables como `{{contact.first_name}}`, `{{appointment.start_time}}` o `{{appointment.reschedule_link}}`.

<details>
<summary><b>🤖 Bot de comentarios de Instagram</b></summary>

<br>

El flujo estrella para captar leads desde contenido orgánico:

1. Alguien comenta una publicación o un reel (*"info"*, *"precio"*, *"me interesa"*…).
2. Un **filtro de intención** descarta los comentarios que no piden información (emojis, menciones,
   elogios) y admite palabras clave propias de cada publicación.
3. Rocco **responde el comentario** en público con mensajes rotativos (para no parecer spam).
4. Envía un **DM** (respuesta privada) con la información o el enlace de reservas.
5. Crea el contacto y la **oportunidad** en el pipeline, y la conversación aparece en la bandeja.

Funciona por webhook de Meta y, como respaldo, por sondeo periódico de comentarios.

</details>

<details>
<summary><b>🧩 Plantillas por sector</b></summary>

<br>

La agencia configura una cuenta nueva en un clic: pipelines con sus etapas, calendario con página de
reservas y automatizaciones listas, con variables (empresa, quién firma, zona horaria, teléfono del
encargado…) y vista previa antes de aplicar.

| Plantilla | Qué trae |
|---|---|
| Reclutamiento de agentes de seguros | Bot de 4 preguntas de perfil, sesión informativa por Google Meet, bot de comentarios de IG |
| Clínica estética | Evaluación gratuita en el local, recordatorios 24 h y 2 h antes, reseñas y reactivación |
| Consultorio odontológico | Motivo de consulta, primera cita con doble recordatorio, controles cada 6 meses y reseñas |
| Inmobiliaria | Calificación (operación, zona, presupuesto, plazo), asesoría, captación de propietarios |
| Tienda por WhatsApp | Catálogo al primer mensaje, pedidos en pipeline, avisos de pago, envío y entrega |
| Academia / cursos | 2 preguntas de objetivo, orientación por Google Meet, seguimiento de pago e inscripción |

</details>

### Agenda y reservas

<table>
<tr>
<td width="50%"><img src="docs/screenshots/calendario-semanal.png" alt="Calendario semanal con citas y tareas"></td>
<td width="50%"><img src="docs/screenshots/reservas-publicas.png" alt="Página pública de reservas con horarios disponibles"></td>
</tr>
<tr>
<td valign="top">

- Vistas de mes y semana, citas y tareas del día, bloqueo de horas.
- Varios calendarios por cuenta, con miembros, disponibilidad por día, duración, margen y antelación.
- **Google Calendar + Google Meet** y **Zoom**: el enlace de la reunión se crea solo.

</td>
<td valign="top">

- Página pública `/book/:slug` con zona horaria del visitante.
- Enlace para **reagendar o cancelar** sin cuenta.
- La reserva crea el contacto, la cita y dispara la automatización de *cita agendada*.

</td>
</tr>
</table>

### Panel de agencia

<table>
<tr>
<td width="50%"><img src="docs/screenshots/panel-agencia.png" alt="Panel de agencia con la lista de cuentas, planes y estados"></td>
<td width="50%"><img src="docs/screenshots/agencia-cliente.png" alt="Detalle de una cuenta cliente con plantillas aplicadas y usuarios"></td>
</tr>
</table>

- Backoffice separado (`/agency`, con su propio JWT) para dar de alta y **provisionar** cuentas.
- Planes, pagos, periodos de prueba, cortesías y estados (activo, prueba, suspendido).
- **Impersonación** auditada: entrar a la cuenta de un cliente para dar soporte.
- Plantillas aplicadas, usuarios de cada cuenta, actividad y auditoría.

### Y además

<table>
<tr>
<td width="50%"><img src="docs/screenshots/dashboard.png" alt="Dashboard con métricas de contactos, pipeline, tareas y tasa de cierre"></td>
<td width="50%"><img src="docs/screenshots/web-movil.png" alt="La web de Rocco en pantallas de móvil"></td>
</tr>
</table>

- **Dashboard** con contactos, valor en pipeline, tareas, tasa de cierre y distribución por etapa.
- **Contactos** con campos extendidos, archivos, filtros avanzados e importación / exportación CSV.
- **Facebook Lead Ads**: los formularios de anuncios entran como leads.
- **Equipo y permisos por módulo** (contactos, oportunidades, tareas, calendario, conversaciones,
  automatizaciones), roles owner / admin / miembro y usuarios en varias organizaciones.
- **Notificaciones** en la app, por WebSocket y **push (FCM)** en la app móvil.
- Web **responsive**: se usa cómoda desde el navegador del móvil.

---

## 🏗 Arquitectura

```mermaid
flowchart LR
    subgraph Clientes
        W["🖥️ Web<br/>Vue 3 + Vite"]
        M["📱 App móvil<br/>Expo / React Native"]
        P["🌐 Reservas públicas<br/>/book/:slug"]
    end

    CF["☁️ Cloudflare Tunnel<br/>HTTPS"]

    subgraph Servidor["Servidor (Docker Compose)"]
        API["⚙️ API Express 5<br/>TypeScript ESM · zod<br/>REST + WebSocket"]
        ENG["🤖 Motor de<br/>automatizaciones"]
        DB[("🐘 PostgreSQL 17<br/>multi-tenant")]
        EVO["💬 Evolution API<br/>WhatsApp"]
    end

    subgraph Externos["Servicios externos"]
        META["Meta Graph<br/>Instagram · Messenger · Lead Ads"]
        GOO["Google Calendar<br/>+ Meet"]
        ZOOM["Zoom"]
        FCM["Firebase FCM<br/>push"]
        TG["n8n / Telegram<br/>alertas"]
    end

    W & M & P --> CF --> API
    API <--> DB
    API --- ENG
    API <-->|webhooks| EVO
    API <-->|webhooks + Graph API| META
    API --> GOO
    API --> ZOOM
    API --> FCM
    API --> TG
```

- **Un solo proceso Node** sirve la API REST, el WebSocket y la web compilada; los trabajos en segundo
  plano (reanudar automatizaciones, sondeo de comentarios, monitor de WhatsApp, refresco de tokens,
  retención de medios) corren en el mismo proceso y se desactivan con `DISABLE_BACKGROUND_JOBS=true`.
- **SQL plano** con `pg` (sin ORM) y **migraciones numeradas** (`server/migrations/*.sql`) que se aplican
  solas al arrancar en producción.
- **Aislamiento por organización**: todas las consultas filtran por `organization_id` y los recursos
  ajenos responden 404.

---

## 🧰 Stack

| Capa | Tecnología |
|---|---|
| Backend | Node.js 22.18+ (TypeScript nativo, ESM) · Express 5.1 · `pg` 8.13 · zod 3.24 · helmet 8 · express-rate-limit 8 · `ws` 8 · jsonwebtoken 9 |
| Base de datos | PostgreSQL 17 |
| Web | Vue 3.5 · Vite 6 · Pinia 2.3 · Vue Router 4.5 · Tailwind CSS 4 · Chart.js 4 · Lucide |
| Móvil | Expo SDK 57 · React Native 0.86 · React 19.2 · expo-router · expo-notifications · expo-secure-store |
| WhatsApp | Evolution API (contenedor propio) |
| Infra | Docker Compose · Cloudflare Tunnel · backups GPG + rclone · alertas a Telegram |
| Identidad | Naranja `#F69008` · marino `#13243D` · lienzo `#F6F4F0` · Bricolage Grotesque |

Sin dependencias de más: contraseñas con `scrypt` y cifrado con `node:crypto`, CSV y tests con la
librería estándar (`node --test`).

---

## 🗂 Estructura del repositorio

```text
.
├── server/                    API Express + TypeScript (ESM nativo)
│   ├── migrations/            001…047 *.sql numeradas (runner propio en src/migrate.ts)
│   ├── src/
│   │   ├── auth/              scrypt, JWT, sesiones revocables, permisos por módulo
│   │   ├── routes/            auth, contacts, opportunities, pipelines, conversations,
│   │   │                      appointments, booking, calendars, automations, agency, …
│   │   ├── services/          motor de automatizaciones, Evolution, Instagram, push, alertas, …
│   │   ├── integrations/      Google Calendar, Zoom
│   │   ├── templates/         plantillas de cuenta por sector
│   │   └── index.ts           arranque: API + WebSocket + trabajos en segundo plano
│   ├── scripts/               utilidades (p. ej. seed-demo.ts)
│   └── test/                  tests E2E con servicios externos simulados
├── web/                       Vue 3 + Vite + Tailwind v4
│   ├── public/                logos e isotipo
│   └── src/                   views/, components/, layouts/, stores/, router.ts
├── mobile/                    App Expo / React Native (Android)
├── ops/                       deploy.sh, rollback.sh, backup/
├── docs/                      guías de puesta en marcha de clientes, banner y capturas
├── Dockerfile                 build de la web + imagen de la API
├── docker-compose.yml         Postgres y Evolution para desarrollo
└── docker-compose.prod.yml    app + db para producción
```

---

## 🚀 Puesta en marcha local

**Requisitos:** Docker, Node.js 22.18 o superior (recomendado 24) y npm.

```bash
git clone https://github.com/Roalcoma/ROCCO-CRM.git
cd ROCCO-CRM

# 1. Base de datos (y Evolution API si vas a probar WhatsApp)
docker compose up -d db            # Postgres en localhost:5434
# docker compose up -d evolution   # opcional

# 2. API
cd server
cp .env.example .env               # ajusta los valores (ver abajo)
npm install
npm run migrate                    # crea las tablas y los datos de ejemplo
npm run dev                        # http://localhost:3100

# 3. Web (otra terminal)
cd web
npm install
npm run dev                        # http://localhost:5175 (proxy /api → :3100)
```

Datos de demostración (opcional, **solo BD local**): crea la Inmobiliaria Sol Caribe, la Agencia
Horizonte y un admin de agencia, todo ficticio.

```bash
cd server
node --env-file=.env scripts/seed-demo.ts
# CRM:     valentina@solcaribe.example / demo-rocco-2026
# Agencia: demo@arbolaureo.example     / demo-rocco-2026   → /agency/login
```

<details>
<summary><b>⚙️ Variables de entorno de <code>server/.env</code></b></summary>

<br>

Solo `DATABASE_URL` y `JWT_SECRET` son obligatorias; lo demás activa integraciones.

```dotenv
# ── Núcleo ─────────────────────────────────────────────
DATABASE_URL=postgres://crm:crm@localhost:5434/crm
JWT_SECRET=un-secreto-largo-y-aleatorio
PORT=3100
PUBLIC_URL=http://localhost:3100        # URL pública (webhooks, enlaces de reserva)
APP_URL=http://localhost:5175           # URL de la web (redirecciones OAuth)
FRONTEND_URL=http://localhost:5175
ALLOW_PUBLIC_SIGNUP=false               # registro abierto (true solo en local/tests)
DISABLE_BACKGROUND_JOBS=false           # true para scripts y tests
SECRETS_KEY=                            # 32 bytes base64 (openssl rand -base64 32): cifra tokens en la BD
MEDIA_DIR=                              # carpeta de medios de automatizaciones

# ── WhatsApp (Evolution API) ───────────────────────────
EVOLUTION_URL=http://localhost:8080
EVOLUTION_API_KEY=

# ── Meta: Instagram, Messenger, Lead Ads ───────────────
META_APP_ID=
META_APP_SECRET=
META_WEBHOOK_VERIFY_TOKEN=
META_WEBHOOK_ENFORCE_SIGNATURE=true
INSTAGRAM_APP_ID=
INSTAGRAM_APP_SECRET=

# ── Google Calendar / Meet y Zoom ──────────────────────
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
ZOOM_CLIENT_ID=
ZOOM_CLIENT_SECRET=

# ── Push (Firebase Cloud Messaging) ────────────────────
FCM_SERVICE_ACCOUNT_FILE=               # o FCM_SERVICE_ACCOUNT_JSON

# ── Alertas operativas ─────────────────────────────────
ALERT_WEBHOOK_URL=                      # webhook de n8n, o bien:
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
```

Para producción hay una plantilla con las variables de Docker Compose en `.env.prod.example`.

</details>

<details>
<summary><b>🧪 Previsualizar como en producción</b></summary>

<br>

```bash
cd web && npm run build && npx vite preview   # http://localhost:5176, proxy /api → :3100
```

Útil para QA con navegadores headless: el servidor de desarrollo (HMR) puede recargar en bucle.

</details>

---

## 📱 App móvil

App **Android** (iOS más adelante) en `mobile/`, hecha con Expo + React Native + expo-router:

- Pestañas **Leads · Mensajes · Ajustes**, ficha del lead y chat.
- **Notificaciones push** (FCM) por canales: leads, mensajes, agenda y sistema.
- Sesión en `expo-secure-store` y desbloqueo con **huella / Face ID**.
- Servidor por defecto `https://rocco.arbolaureo.org` (mantener pulsado el logo del login permite
  cambiarlo para pruebas; la build release solo admite HTTPS).

```bash
cd mobile
npm install
bash scripts/build-apk.sh release      # → dist/rocco-release.apk (arm64-v8a)
ABIS=armeabi-v7a,arm64-v8a bash scripts/build-apk.sh release   # + móviles de 32 bits
bash scripts/build-apk.sh debug        # firmada con la clave debug
adb install -r dist/rocco-release.apk
```

Necesita JDK 17 y el SDK de Android (`scripts/android-env.sh` exporta `JAVA_HOME` y
`ANDROID_HOME`). `android/` e `ios/` no se versionan: se generan con `npx expo prebuild`. La firma
release y `google-services.json` viven fuera del repo. Más detalles en [`mobile/README.md`](mobile/README.md).

---

## 🚢 Despliegue

Producción corre en un servidor propio con Docker Compose (`app` + `db` + Evolution) publicado con
**Cloudflare Tunnel** en [rocco.arbolaureo.org](https://rocco.arbolaureo.org).

```bash
ops/deploy.sh --dry-run      # comprueba todo en local y muestra qué se sincronizaría
ops/deploy.sh                # typecheck + tests + sync + build + salud
ops/rollback.sh              # vuelve a la imagen y archivos anteriores
```

<details>
<summary><b>Qué hace <code>ops/deploy.sh</code></b></summary>

<br>

1. Exige árbol limpio en `server/ web/ Dockerfile docker-compose.prod.yml`.
2. **Typecheck** de server y web, y **tests** (se pueden saltar con `--skip-tests`).
3. Compara con el último commit desplegado y guarda un **respaldo** (archivos + imagen `:previous`).
4. Sincroniza **el commit** (no el árbol de trabajo) y reconstruye solo el servicio `app`.
5. **Chequeo de salud**: logs de arranque, API respondiendo JSON y WhatsApp conectado.
6. Si la salud falla, **rollback automático**. Registra el commit y avisa por Telegram.

Las migraciones no se revierten (el script lo advierte). Detalles en [`ops/README.md`](ops/README.md).

</details>

**Backups:** `ops/backup/backup.sh` hace cada día un `pg_dump` de la BD del CRM y de Evolution,
lo cifra con **GPG (AES‑256)** y lo sube a Google Drive con `rclone` (7 días en local, 30 en remoto).
Si falla, avisa a Telegram. `ops/backup/restore-test.sh` comprueba que los respaldos se pueden restaurar.

---

## 🔒 Seguridad

- **Aislamiento multi‑tenant** por `organization_id` en cada consulta, con tests dedicados.
- Contraseñas con **scrypt**, JWT con **sesiones revocables** (`token_version`: cerrar sesión en todos
  los dispositivos, cambio de contraseña, desactivar usuarios).
- **Secretos de terceros cifrados** en la BD con **AES‑256‑GCM** (tokens de Google, Zoom, Meta y la
  API key de Evolution).
- **Permisos por módulo** y roles; el panel de agencia usa un JWT separado y la impersonación queda auditada.
- Webhooks de Meta con **verificación de firma**; WebSocket con tickets de un solo uso.
- `helmet`, **rate limit** en login y reservas públicas, validación de entrada con **zod**.
- Retención y purga de medios, y alertas operativas a Telegram.

---

## ✅ Tests

```bash
cd server
npm test                          # ~100 tests E2E
npm test -- test/flows.test.ts    # un solo archivo
```

`npm test` levanta un servidor de pruebas en `:3202` y **simula** Evolution, Meta/Instagram, Google y
FCM con un servidor falso: no se envía nada real. Crea organizaciones propias en la BD del `.env`
local (nunca contra producción).

| Archivo | Qué cubre |
|---|---|
| `isolation` | Que una organización no pueda leer ni tocar datos de otra |
| `security` · `sessions` · `users` | Firmas de webhooks, revocación de sesiones, roles y permisos |
| `flows` | Flujos completos: WhatsApp → lead, bot de comentarios de IG, automatizaciones, reservas |
| `appointments-tz` · `appointment-lead` · `media-noshow` | Zonas horarias, citas, medios y "no asistió" |
| `dates-kanban` · `contacts-phone` · `reliability` · `push` | Kanban paginado, teléfonos, robustez y push |

---

## 🗺 Roadmap

- [x] Núcleo CRM: contactos, pipelines, oportunidades, tareas
- [x] Bandeja unificada WhatsApp + Instagram + Messenger
- [x] Automatizaciones con editor visual y bot de comentarios de Instagram
- [x] Calendario, reservas públicas, Google Meet y Zoom
- [x] Panel de agencia, planes y plantillas por sector
- [x] App móvil Android con push
- [ ] App móvil: más módulos (calendario, tareas) y versión iOS
- [ ] Más canales (correo, SMS)
- [ ] Reportes avanzados y embudos por fuente / anuncio
- [ ] Cobros en línea para las cuentas de la agencia

---

## 🧡 Créditos

<div align="center">

<img src="web/public/isotipo-mark.png" alt="Isotipo de Rocco" width="56">

**Hecho con 🍊 por [Árbol Áureo](https://rocco.arbolaureo.org)**

Repositorio privado. Todos los derechos reservados.

</div>
