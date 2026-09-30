# Checklist de puesta en marcha · Rocco CRM

Cliente: ______________________  Fecha: ___________  Plan: ________  Link reservas: /book/______________

Detalle de cada paso: [`puesta-en-marcha-cliente.md`](puesta-en-marcha-cliente.md).

## Antes de la sesión
- [ ] Número de WhatsApp dedicado (con historial) y teléfono disponible en la sesión
- [ ] Instagram profesional (y página de Facebook si quiere Messenger / Lead Ads), con acceso de administrador
- [ ] Cuenta de Google del calendario
- [ ] Logo, horarios, zona horaria, duración de citas
- [ ] Quién firma los mensajes y textos base (bienvenida, respuesta a comentarios, confirmación, recordatorio)
- [ ] Etapas del pipeline
- [ ] Equipo: nombres, correos y qué módulos ve cada uno
- [ ] App de Meta en modo En vivo y proyecto de Google "En producción" (verificado)

## Alta (panel de agencia)
- [ ] `/agency` → Clientes → **Nueva Cuenta** → **Crear Cuenta CRM**
- [ ] Credenciales guardadas en Vaultwarden
- [ ] Pestaña CRM: organización y usuario owner visibles
- [ ] Primer pago registrado (Facturación)
- [ ] Plantilla de sector aplicada (cuando exista)

## Configuración (con la sesión del cliente)
- [ ] Perfil del negocio (zona horaria y moneda)
- [ ] Pipeline creado con sus etapas
- [ ] WhatsApp **Conectado** (QR o código)
- [ ] Instagram conectado (**Conectar Instagram**) · Facebook si aplica
- [ ] Lead Ads configurado (si aplica)
- [ ] Google Calendar **Conectado** (Mi Perfil → Conexiones)
- [ ] Calendario creado: slug, Reserva en línea, Google Meet, disponibilidad, logo
- [ ] Festivos / fechas específicas
- [ ] Usuarios del equipo creados con rol y módulos

## Automatizaciones
- [ ] Nuevo mensaje de WhatsApp → Crear oportunidad + Notificación + Esperar + Enviar WhatsApp
- [ ] Comentario en Instagram → Responder comentario + DM + Crear oportunidad + Notificación
- [ ] Cita agendada → Notificación + confirmación + recordatorios
- [ ] Todas en **Activa**

## Prueba de punta a punta (con el cliente)
- [ ] WhatsApp desde otro número → conversación, contacto, lead, notificación, bienvenida
- [ ] Respuesta desde Mensajes llega al teléfono
- [ ] Reserva en /book/<slug> → cita en CRM y Google con Meet, correo de invitación
- [ ] Comentario en Instagram → respuesta pública, DM, lead
- [ ] Datos de prueba borrados

## Entrega
- [ ] El cliente cambió su contraseña (Mi Perfil)
- [ ] Recorrido: Mensajes, Leads, anuncio de origen, Contactos, Tareas, Calendario, campanita
- [ ] Explicadas las reglas anti-bloqueo de WhatsApp y la ventana de 24 h de Instagram
- [ ] Explicado que los recordatorios no se cancelan si la cita se cancela (limitación actual)
- [ ] Enviado por escrito: URL de acceso, link de reservas, contacto de soporte, privacidad y términos

## Primera semana
- [ ] Día 1: revisar conversaciones, leads y ejecuciones de automatizaciones
- [ ] Día 3: repetir revisión y mirar Auditoría
- [ ] Sin alertas de Telegram pendientes de este cliente
- [ ] Día 7: llamada de seguimiento y ajustes de textos/etapas
