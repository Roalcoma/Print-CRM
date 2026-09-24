# Changelog — Rocco CRM

Todos los cambios notables en este proyecto se documentan aquí.
Formato basado en [Keep a Changelog](https://keepachangelog.com/es/1.0.0/).
Versioning basado en [Semantic Versioning](https://semver.org/lang/es/).

---

## [1.0.0] — 2026-09-24

Primera versión estable de Rocco CRM. Plataforma multi-tenant lista para producción.

### Núcleo de la plataforma
- Autenticación JWT con roles (Administrador, Agente) y permisos granulares por módulo
- Arquitectura multi-tenant con aislamiento por `organization_id` en todas las consultas
- Sistema de notificaciones en tiempo real vía WebSocket
- Feed de actividad por organización
- Dashboard con métricas de resumen

### Contactos y CRM
- Gestión completa de contactos (crear, editar, archivar, buscar, filtrar, etiquetar)
- Vista detalle de contacto con historial de actividad, conversaciones y citas
- Pipeline de ventas multi-etapa con drag & drop de oportunidades
- Gestión de tareas asignables con estados y fechas de vencimiento

### Calendario y citas
- Vista de calendario (día / semana / mes) con soporte de eventos
- Configuración de calendarios con disponibilidad horaria por día, duración de slots y zona horaria
- Página de reserva pública (`/book/:slug`) con confirmación automática
- Gestión de citas agendadas (reagendar, cancelar) desde enlace único
- Sincronización bidireccional con Google Calendar via OAuth
- Bloqueo de horarios para no-disponibilidad

### Conversaciones multicanal
- Inbox unificado: WhatsApp Business, Instagram Direct, Facebook Messenger
- Envío y recepción de mensajes en tiempo real
- Badge de canal diferenciado (WhatsApp, Instagram, Facebook)
- Historial completo de conversaciones por contacto

### WhatsApp
- Integración con Evolution API v2.3.7
- Soporte para múltiples instancias de WhatsApp por organización
- Configuración de webhook por instancia
- Conexión por código QR o código de emparejamiento

### Instagram y Facebook
- OAuth de Instagram (Instagram Graph API v19.0)
- Recepción de DMs de Instagram y Facebook Messenger via webhook Meta
- Soporte para múltiples cuentas de Instagram por organización
- Auto-refresh de tokens de Instagram (diario, ventana de 40 días antes de expiración)

### Automatizaciones
- Motor de automatizaciones con pasos secuenciales
- Triggers: `tag_added`, `whatsapp_new_message`, `appointment_booked`, `ig_comment_received`
- Pasos: `send_whatsapp`, `send_notification`, `wait_minutes`, `wait_before_appointment`, `detect_us_state`, `create_opportunity`, `wait_for_reply`, `ig_reply_comment`, `ig_send_dm`
- Scheduler de reanudación para esperas por tiempo (`waiting_timed`)
- Normalización automática de teléfonos EE.UU. (detección de área code, prefijo de país)
- Automatización de comentarios Instagram: mensajes rotativos + DM con calendario

### Agencia (backoffice)
- Panel de agencia con gestión de clientes (organizaciones)
- Impersonación de cuentas cliente
- Gestión de planes y pagos
- Perfil de agencia

### Legal y seguridad
- Política de Privacidad y Seguridad pública (`/privacy`)
- Términos y Condiciones de Uso (`/terms`)
- Cobertura: GDPR, CCPA, DPA, SLA 99%, limitación de responsabilidad, ley de Florida

### Infraestructura
- Docker Compose para producción (`docker-compose.prod.yml`)
- Migraciones SQL versionadas y aplicadas automáticamente al arranque
- Deploy mediante rsync + Docker build en servidor auto-hospedado (Tailscale)
- Tunnel HTTPS via Cloudflare (`rocco.arbolaureo.org`)
- Backups diarios de PostgreSQL (retención 30 días)

---

## Convenciones para versiones futuras

- **PATCH** `1.0.x` — correcciones de bugs, ajustes menores, textos
- **MINOR** `1.x.0` — nuevas funcionalidades sin romper compatibilidad
- **MAJOR** `x.0.0` — cambios de arquitectura, breaking changes en la API o DB

### Cómo publicar una nueva versión

```bash
# 1. Actualizar versión en package.json (web + server)
npm --prefix web version patch   # o minor / major
npm --prefix server version patch

# 2. Actualizar CHANGELOG.md con los cambios

# 3. Commit, tag y push
git add -A
git commit -m "chore: release vX.Y.Z"
git tag vX.Y.Z
git push origin main --tags
```
