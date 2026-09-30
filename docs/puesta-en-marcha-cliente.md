# Puesta en marcha de un cliente nuevo en Rocco CRM

Procedimiento interno de Árbol Áureo para dar de alta y dejar funcionando la cuenta de un cliente, de principio a fin. Cada paso está comprobado contra el código actual (rutas, botones y textos tal como aparecen en la interfaz). Lo que el producto todavía no hace está marcado como **Pendiente**.

Checklist corto para imprimir: [`checklist-cliente.md`](checklist-cliente.md).

**Tiempo total estimado:** 2 a 3 horas, repartidas en una preparación (tú solo, unos 45 min) y una sesión con el cliente (1,5 a 2 h, en llamada o en persona).

> En esta guía, `https://<dominio>` es la URL pública de Rocco (la de `PUBLIC_URL` en producción). En el menú lateral del CRM, la configuración aparece como **Ajustes**; dentro, la página se titula **Configuración**.

---

## 0. Mapa rápido

| Qué | Dónde |
|---|---|
| Panel de agencia | `/agency` → **Clientes** (`/agency/clients`) |
| Datos del negocio | Ajustes → **Perfil del negocio** |
| Pipelines | Ajustes → **Pipelines y etapas** (`/pipelines`) |
| Equipo y permisos | Ajustes → **Mi equipo** |
| WhatsApp | Ajustes → **WhatsApp** → **Gestionar** |
| Instagram / Facebook | Ajustes → **Redes Sociales** |
| Facebook Lead Ads | Ajustes → **Lead Ads** |
| Calendarios y disponibilidad | Ajustes → **Calendario** (`/settings/calendar`) |
| Conectar Google Calendar / Zoom | Menú del usuario (avatar) → **Mi Perfil** → **Conexiones** |
| Automatizaciones | Menú lateral → **Automatizaciones** → **Nueva** |
| Página pública de reservas | `https://<dominio>/book/<slug>` |
| Privacidad / Términos | `https://<dominio>/privacy` · `https://<dominio>/terms` |

---

## 1. Antes de empezar: qué pedirle al cliente (15 min, por mensaje)

Envíale esta lista unos días antes de la sesión. Sin estos datos la puesta en marcha se queda a medias.

1. **Número de WhatsApp dedicado al negocio.**
   - Ideal: un número con historial (varios meses de uso normal). Un número recién creado que empieza a mandar muchos mensajes tiene alto riesgo de bloqueo.
   - Que el teléfono con ese WhatsApp esté **presente en la sesión** (hay que escanear un QR).
   - Si usa WhatsApp Business en el teléfono, sirve igual: Rocco se conecta como "dispositivo vinculado".
2. **Instagram y Facebook de la empresa.**
   - Cuenta de Instagram **profesional** (Empresa o Creador), no personal.
   - Si también quiere Messenger o Lead Ads: página de Facebook con la cuenta de Instagram vinculada, y que la persona que asista a la sesión sea **administradora** de la página.
   - Usuario y contraseña a mano (o el teléfono para aprobar el inicio de sesión).
3. **Cuenta de Google del calendario**: la cuenta (Gmail o Google Workspace) donde quiere ver las citas. Las citas con Google Meet se crean desde esa cuenta.
4. **Logo** (PNG cuadrado) para la página de reservas.
5. **Horarios de atención**: días, horas, zona horaria, días festivos o fechas en que no atiende.
6. **Datos de las citas**: duración (15/30/60 min), tiempo entre citas, con cuánta antelación se puede reservar y hasta cuántos días a futuro.
7. **Quién firma los mensajes automáticos** (por ejemplo "Ana, de Clínica Sol") y el tono (tú / usted).
8. **Textos base**: saludo de bienvenida de WhatsApp, respuesta a comentarios de Instagram, mensaje de confirmación y recordatorio de cita.
9. **Equipo**: nombre y correo de cada persona que usará el CRM y qué debe ver (contactos, leads, tareas).
10. **Etapas de su proceso de venta** (por ejemplo: Nuevo → Contactado → Cita agendada → Cliente → Perdido).
11. **Datos del negocio**: nombre comercial, sector, teléfono, correo, web, dirección, ciudad, país, moneda.

---

## 2. Crear la cuenta desde el panel de agencia (10 min, tú solo)

El registro público está **cerrado** (la pantalla de login dice "¿No tienes cuenta? Pide acceso a tu administrador."). Las cuentas solo se crean desde la agencia.

1. Entra a `https://<dominio>/agency/login` con tu usuario de agencia.
2. Ve a **Clientes** y pulsa **Nueva Cuenta**.
3. Rellena el formulario **Nueva Cuenta CRM**:
   - **Nombre \***: nombre de la persona dueña (será el nombre del usuario owner).
   - **Empresa**: nombre del negocio (será el nombre de la organización en el CRM; si lo dejas vacío se usa el Nombre).
   - **Email \***: el correo con el que el cliente entrará al CRM. Tiene que ser único en todo Rocco.
   - **Teléfono**, **País**.
   - **Tipo de cuenta**: **Cliente** (cuenta de un cliente externo). "Propia" es solo para pruebas o negocio propio.
   - **Plan**: Starter / Pro / Enterprise.
   - **Estado**: **Activo**, o **Trial** con **Días de trial** (o **Sin límite**).
   - **Valor mensual (USD)** y **Notas** (acuerdos, fecha de cobro, contacto de facturación).
4. Pulsa **Crear Cuenta CRM**. Esto crea el cliente, la organización y el usuario owner a la vez.
5. En la ventana **CRM provisionado** copia el **Email de acceso** y la **Contraseña temporal** (**Copiar contraseña**) y guárdalos en Vaultwarden. **No se vuelven a mostrar.**
6. Abre la ficha del cliente (clic en la fila) y comprueba en la pestaña **CRM** que aparece la **Organización** y el usuario con rol `owner`.

Notas:
- **Provisionar CRM** solo aparece si el cliente no tiene organización (por ejemplo, cuentas antiguas). **Re-provisionar** no crea nada nuevo: **genera una contraseña temporal nueva para el owner** y anula la anterior. Úsalo solo si el cliente perdió su contraseña.
- En la pestaña **Facturación** registra el primer pago con **Registrar pago** y, si aplica, las **Regalías** (usuarios extra de cortesía).
- **Acceder al CRM** te abre el CRM del cliente para darle soporte. Ojo: si tienes un usuario CRM con el mismo correo que tu cuenta de agencia, entras **con tu propio usuario** dentro de la organización del cliente (si no, entras como el owner). Por eso los pasos 5 y 6 de esta guía (conectar Google y crear calendarios) se hacen **iniciando sesión con las credenciales del cliente**, no con "Acceder al CRM": si no, el calendario y la conexión de Google quedarían a tu nombre.

### 2.1 Aplicar plantilla de sector

> **TODO (en desarrollo por otro agente):** plantillas de cuenta por sector aplicables desde el panel de agencia (pipeline, etapas, automatizaciones y textos base). Cuando exista, documentar aquí: dónde está el botón, qué crea exactamente y qué pasos de esta guía (3, 8) se vuelven opcionales.

Mientras no exista, sigue los pasos 3 y 8 a mano.

---

## 3. Configuración base del negocio (15 min, tú solo)

Entra a `https://<dominio>/login` con el email y la contraseña temporal del cliente.

### 3.1 Perfil del negocio
Ajustes → **Perfil del negocio**: Nombre del negocio, Sector / Industria, Descripción, Teléfono, Email del negocio, Sitio web, Dirección, Ciudad, País, **Zona horaria** y **Moneda principal**. Revisa bien la zona horaria.

### 3.2 Pipeline (obligatorio antes de las automatizaciones)
Una cuenta nueva **no trae ningún pipeline**, y sin pipeline las automatizaciones no pueden crear leads (el paso "Crear oportunidad" se salta sin avisar).

1. Ajustes → **Pipelines y etapas** → **Crear pipeline**.
2. **Nombre del pipeline** (por ejemplo "Ventas") y las **Etapas** que te dio el cliente, en orden. La primera etapa es donde entran los leads nuevos.
3. **Guardar**.

Si creas más de un pipeline, las automatizaciones sin pipeline elegido usan **el primero que se creó**.

### 3.3 Apariencia (opcional)
Ajustes → **Apariencia**: estilo de la barra lateral.

---

## 4. Conectar WhatsApp (15 min, con el cliente y su teléfono)

Cada cliente tiene **su propia instancia** de WhatsApp en el servidor de Evolution API. La URL y la API key las gestiona Rocco en el servidor: el cliente no configura nada técnico.

1. Ajustes → **WhatsApp**. Aparece "WhatsApp #1" (se crea sola la primera vez) en estado **Desconectado**. Se pueden tener hasta 2 números (**Agregar número**).
2. Pulsa **Gestionar** → **Conectar**.
3. En el panel **Vincular número**:
   - **Escanear QR**: en el teléfono del cliente, WhatsApp → Dispositivos vinculados → Vincular dispositivo → escanear. Si el QR caduca, **Actualizar QR**.
   - o **Vincular con código**: escribe el número en formato internacional, solo dígitos (ej. `584141234567`), pulsa **Obtener código** e introdúcelo en WhatsApp → Dispositivos vinculados → Vincular dispositivo → **Vincular con número de teléfono**. El código caduca en unos 60 segundos.
4. Espera a ver **Conectado** y el aviso **Número activo**.
5. Pide al cliente que **no cierre la sesión** de ese dispositivo vinculado en su teléfono y que abra WhatsApp en el teléfono al menos una vez cada pocos días (WhatsApp desvincula dispositivos si el teléfono principal pasa mucho tiempo sin conexión).

**Pendiente:** no se puede renombrar la instancia ("WhatsApp #1") desde la interfaz.

### Buenas prácticas para evitar bloqueos (explícaselas al cliente)
- Usar un número con historial, no uno recién activado.
- **Nada de envíos masivos** ni listas de difusión desde Rocco. Rocco está pensado para responder a quien escribe.
- Espaciar los mensajes automáticos: usa pasos **Esperar N minutos** entre mensajes y evita mandar varios seguidos.
- Mensajes personalizados (`{{contact.first_name}}`), no el mismo texto idéntico a cientos de personas.
- No escribir primero a números que nunca han escrito al negocio.
- Si los contactos reportan o bloquean mucho el número, WhatsApp lo suspende. No hay forma de recuperarlo desde Rocco.

---

## 5. Conectar Instagram y Facebook (20 min, con el cliente)

Ajustes → **Redes Sociales**. Hay dos botones:

- **Conectar Instagram** (inicio de sesión de Instagram): el recomendado para el bot de comentarios y los DMs de Instagram. Pide permisos de mensajes y comentarios.
- **Conectar Facebook**: conecta las páginas de Facebook (Messenger) y, si la página tiene una cuenta de Instagram Business vinculada, también esa cuenta. Es **obligatorio para Lead Ads**.

Pasos:
1. Pulsa el botón, inicia sesión con la cuenta del cliente y acepta **todos** los permisos (si desmarca alguno, el bot no podrá responder).
2. Al volver, la cuenta aparece en **Instagram Business** o **Facebook Pages** como **Activo**, con la fecha de "Token válido hasta…". Rocco suscribe la cuenta a los webhooks de mensajes y comentarios automáticamente.
3. El recuadro **URL del Webhook** del final es informativo: esa URL ya está registrada una sola vez en la app de Meta de Rocco. El cliente no tiene que hacer nada con ella.

**Verificar antes de la sesión:** que la app de Meta de Rocco esté en modo **En vivo** con los permisos aprobados. Si sigue en modo desarrollo, solo pueden conectarse cuentas que tengan un rol en la app (tendrías que añadir al cliente como tester en Meta Developers). Esto no se puede comprobar desde el código.

### 5.1 Bot de comentarios de Instagram
Flujo: alguien comenta en un post → Rocco responde el comentario en público → le envía un DM privado → crea el contacto (y el lead, si lo configuras).

Crea la automatización (Automatizaciones → **Nueva**):
1. **Tipo de disparador**: **Comentario en Instagram** (internamente `ig_comment_received`). Debe estar **Activa**.
2. Pasos recomendados:
   - **Responder comentario IG**: varios **Mensajes rotativos** (**+ Añadir**) cortos, por ejemplo "¡Te escribimos por DM! 📩". Rocco elige uno al azar para que las respuestas no sean idénticas.
   - **DM de Instagram** → **Mensaje directo**: el mensaje con la información y la pregunta para que responda (por ejemplo, pedir su WhatsApp).
   - **Crear oportunidad** (Título `{{contact.name}}`, Fuente "Instagram", Pipeline y Etapa).
   - **Notificación interna** para avisar al equipo.
3. **Crear automatización**.

Cómo decide Rocco a qué comentarios responder:
- **Palabra clave del post**: si el texto del post dice por ejemplo `Comenta "INFO"` o `Comenta CAMBIO si…`, Rocco toma esa palabra (entre comillas o en MAYÚSCULAS después de "comenta", "escribe", "comment"…) y responde a quien la comente. Dile al cliente que **escriba siempre la llamada a la acción así en el texto del post**.
- Además responde a comentarios que piden información ("info", "precio", "me interesa", "¿cómo funciona?", una pregunta…). Ignora felicitaciones, emojis sueltos y los comentarios de las propias cuentas conectadas.
- A una misma persona se le ejecuta el flujo como máximo **una vez por semana**, aunque comente en varios posts.
- Si alguien deja su teléfono por DM, Rocco lo guarda en el contacto, lo anota en su oportunidad y notifica al equipo ("<nombre> dejó su teléfono").

**Pendiente en la interfaz:** desactivar el filtro de intención (responder a todo comentario) o excluir usuarios concretos solo se puede hacer tocando la configuración de la regla en la base de datos (`intent_filter`, `exclude_usernames`); el constructor no lo muestra.

### 5.2 Límites de Meta que tienes que explicarle al cliente
- **Una sola respuesta privada por comentario**: el primer DM a quien solo comentó se envía como "respuesta privada" a su comentario, y Meta permite una por comentario.
- **Ventana de 24 horas**: solo se puede escribir por DM a alguien dentro de las 24 h siguientes a **su último mensaje por DM**.
- Consecuencia: **a quien solo comentó no se le puede volver a escribir por DM hasta que él escriba**. Si el equipo lo intenta desde Mensajes, Rocco muestra: "Instagram no permite escribirle todavía: solo puedes responder dentro de las 24 h siguientes a su último mensaje por DM. Si solo comentó, podrás responderle cuando te escriba." Por eso el DM automático debe terminar con una pregunta que invite a responder.

### 5.3 Facebook Lead Ads (solo si el cliente hace campañas de formulario)
Ajustes → **Lead Ads** (requiere una página conectada con **Conectar Facebook**) → **Configurar formulario**: Página de Facebook, Formulario, **Pipeline destino**, **Etapa inicial**, mapeo de campos, y activar **Crear contacto automáticamente** y **Crear oportunidad en el pipeline**.

---

## 6. Google Calendar, calendario con Meet y página de reservas (25 min, con el cliente)

Hazlo **con la sesión del cliente** (sus credenciales), no con "Acceder al CRM" (ver nota del paso 2).

### 6.1 Conectar Google
1. Menú de tu usuario (clic en tu nombre/avatar) → **Mi Perfil** → sección **Conexiones** → **Google Calendar** → **Conectar**.
2. Inicia sesión con la cuenta de Google del cliente y acepta los permisos.
3. **Aviso "Google no ha verificado esta app"**: mientras Google termina la verificación de Rocco, aparecerá. Pulsa **Configuración avanzada** → **Ir a <nombre de la app> (no seguro)** y continúa. Explícale al cliente que es normal durante la verificación y que Rocco solo pide acceso a los eventos que crea.
4. Al volver, en Mi Perfil debe verse **Conectado** junto a Google Calendar.

Si el proyecto de Google Cloud estuviera en modo **Prueba** (no "En producción"), solo podrían conectarse las cuentas añadidas como usuarios de prueba y la conexión caducaría a los 7 días. **Verifica el estado del proyecto antes de la sesión.**

Zoom se conecta igual (Mi Perfil → Conexiones → **Zoom** → **Conectar**) si el cliente prefiere Zoom.

### 6.2 Crear el calendario
1. Ajustes → **Calendario** → pestaña **Calendarios** → **Nuevo calendario**.
2. **Identidad**: **Logo**, **Nombre \***, **Color**, **Slug del link** (solo letras, números y guiones; define `/book/<slug>`), **Zona horaria**, **Descripción**.
3. **Equipo**: co-propietarios. El **Principal** es quien pone su Google Calendar para crear la reunión de Meet, así que tiene que ser la persona que conectó Google.
4. **Reserva en línea**: actívala. Configura **Duración**, **Buffer** (tiempo entre citas), **Anticipación mínima** (y si permite mismo día), **Ventana** (hasta cuántos días a futuro) y **Mensaje para tus clientes**.
5. **Tipo de reunión**: **Google Meet**. Debe aparecer "✓ Google Calendar conectado — se creará un enlace de Meet automáticamente al agendar." (Alternativas: Zoom, Teléfono o una dirección/enlace personalizado.)
6. **Horario de disponibilidad** del calendario.
7. **Crear calendario** y luego **Copiar link**.

### 6.3 Disponibilidad general
Ajustes → **Calendario** → pestaña **Disponibilidad**: **Zona horaria**, **Horario laboral** (**Guardar disponibilidad**) y **Fechas específicas** para festivos o días con horario especial (**Guardar fechas**).

### 6.4 Página de reservas
El link público es `https://<dominio>/book/<slug>`. Pásaselo al cliente para su bio de Instagram, su web, sus respuestas de WhatsApp y sus DMs. Quien reserva recibe la invitación de Google Calendar con el enlace de Meet en su correo, y la pantalla de confirmación incluye un enlace para reagendar o cancelar.

---

## 7. Equipo, roles y permisos (10 min)

Ajustes → **Mi equipo** → **Añadir usuario**:
- **Nombre completo**, **Email de acceso**, **Contraseña** (mínimo 8 caracteres).
- **Rol del usuario**:
  - **Administrador**: acceso completo, incluidos Ajustes y las automatizaciones.
  - **Miembro**: solo los **Módulos permitidos** que marques: **Contactos**, **Oportunidades**, **Tareas**.
- **Crear usuario**. Envía a cada persona su correo y contraseña por un canal privado y pídele que la cambie en **Mi Perfil → Cambiar contraseña**.

Ten en cuenta:
- Los módulos **Calendario**, **Mensajes** y **Automatizaciones** (ver) no se pueden restringir: todo miembro ve todas las conversaciones.
- Las notificaciones de leads nuevos y de las automatizaciones llegan a **todos** los usuarios de la organización.
- **Pendiente:** el límite de usuarios del plan (y las regalías de usuarios extra) **no se aplica** al crear usuarios; contrólalo tú.

---

## 8. Automatizaciones (25 min)

Menú lateral → **Automatizaciones** → **Nueva**. En cada una: **Nombre**, **Descripción (opcional)**, **Tipo de disparador**, pasos, y el interruptor **Activa**. Termina con **Crear automatización**.

Variables disponibles en los textos: Nombre completo `{{contact.name}}`, Nombre `{{contact.first_name}}`, Apellido, Email, Teléfono; y en las de citas: Fecha de cita `{{appointment.start_date}}`, Hora de cita `{{appointment.start_time}}`, Enlace reunión `{{appointment.meeting_url}}`, Reagendar `{{appointment.reschedule_link}}`.

> **Importante:** un mensaje entrante de WhatsApp **solo** crea el contacto y la conversación. El lead en el pipeline, la notificación y cualquier respuesta automática salen de estas automatizaciones. Si no las creas, no hay leads.

### 8.1 Bienvenida de WhatsApp + lead + aviso (imprescindible)
- **Disparador**: **Nuevo mensaje de WhatsApp**. Se dispara con el **primer mensaje de una conversación nueva** (no con cada mensaje).
- Pasos:
  1. **Crear oportunidad**: Título `{{contact.name}}`, Fuente "WhatsApp", Pipeline y Etapa (primera etapa).
  2. **Notificación interna**: Título "Nuevo lead de WhatsApp: {{contact.name}}", Mensaje con el teléfono.
  3. **Esperar N minutos**: 1–2 minutos (que no parezca un bot instantáneo).
  4. **Enviar WhatsApp**: saludo firmado por quien indicó el cliente, con el link de reservas si aplica. Deja **Número destino** vacío para responder al contacto.
- Opcional: **Esperar respuesta** (pausa el flujo hasta que el contacto conteste por WhatsApp) y después otro **Enviar WhatsApp** o **Notificación interna**.

### 8.2 Cita agendada: confirmación, aviso y recordatorio
- **Disparador**: **Cita agendada**. Solo se dispara con las reservas hechas en la **página pública** `/book/<slug>`, no con citas creadas a mano en el calendario del CRM.
- Pasos:
  1. **Notificación interna**: "Nueva cita: {{contact.name}} el {{appointment.start_date}} a las {{appointment.start_time}}".
  2. **Enviar WhatsApp**: confirmación con fecha, hora, `{{appointment.meeting_url}}` y `{{appointment.reschedule_link}}`.
  3. **Esperar antes de cita**: **Minutos antes de la cita** = 1440 (24 h).
  4. **Enviar WhatsApp**: recordatorio.
  5. **Esperar antes de cita**: 60.
  6. **Enviar WhatsApp**: "Nos vemos en 1 hora: {{appointment.meeting_url}}".

  WhatsApp solo se enviará si el contacto dejó su teléfono al reservar.

**Pendiente (riesgo real):** si la persona **cancela o reagenda** la cita, los recordatorios ya programados **no se cancelan** y se envían a la hora de la cita original. Avísale al cliente, o no uses recordatorios hasta que se corrija.

### 8.3 Otros disponibles
- **Etiqueta añadida**: se dispara al añadir una etiqueta concreta a un contacto (útil para seguimientos manuales: etiquetar "interesado" → mensaje + tarea).
- **Detectar estado EE.UU.**: solo tiene sentido para clientes con números de EE. UU.
- **Pendiente:** el disparador **Contacto creado** aparece en el constructor pero el servidor **no lo ejecuta nunca**. No lo uses.

---

## 9. Prueba de punta a punta con el cliente presente (20 min)

Hazla siempre, con el cliente mirando la pantalla. Usa un teléfono **distinto** al conectado.

1. **WhatsApp → lead**
   - Desde otro número, escribe al WhatsApp del negocio.
   - Comprueba: la conversación aparece en **Mensajes** en segundos; el contacto se crea en **Contactos**; en **Leads** aparece la oportunidad en la primera etapa; aparece la notificación en la campanita; llega el mensaje de bienvenida al teléfono de prueba.
   - Responde desde **Mensajes** y comprueba que llega al teléfono.
   - Si el número viene de un anuncio click-to-WhatsApp, en la conversación, en la ficha del contacto y en el lead se verá la tarjeta "Llegó desde un anuncio de …" con **Ver anuncio**.
2. **Reserva → cita con Meet**
   - Abre `https://<dominio>/book/<slug>` en el móvil, reserva con un correo y teléfono de prueba.
   - Comprueba: la cita en **Calendario** del CRM y en el Google Calendar del cliente con enlace de Meet; el correo de invitación de Google en el buzón de prueba; la notificación y el WhatsApp de confirmación (si hiciste la automatización 8.2).
   - Cancela la cita desde el enlace de gestión para dejar limpio el calendario.
3. **Comentario en Instagram**
   - Desde una cuenta de Instagram que **no** sea la del negocio, comenta la palabra clave en un post que la pida (o "info").
   - Comprueba: respuesta pública al comentario, DM recibido, contacto con etiqueta `instagram`, lead creado y la conversación en **Mensajes**.
   - Recuerda: esa misma cuenta no volverá a disparar el flujo en 7 días. Para repetir la prueba usa otra cuenta.
4. Borra los contactos y leads de prueba (o márcalos como perdidos) para que el cliente empiece limpio.

Si algo falla, ve a la sección 11.

---

## 10. Entrega al cliente (20 min)

1. **Contraseña**: que el cliente la cambie delante de ti en **Mi Perfil → Cambiar contraseña** (no existe "olvidé mi contraseña": si la pierde, tú le generas otra con **Re-provisionar** en el panel de agencia).
2. Recorrido por la aplicación:
   - **Mensajes**: bandeja única de WhatsApp, Instagram y Messenger. Cómo responder, ver no leídos y abrir el contacto.
   - **Leads**: el pipeline; arrastrar tarjetas entre etapas, abrir el lead, notas, y la tarjeta del **anuncio de origen** de cada lead.
   - **Contactos**: ficha, etiquetas, historial.
   - **Tareas**: tareas asignadas y vencimientos.
   - **Calendario**: citas, crear una cita a mano, bloquear tiempo.
   - **Campanita**: notificaciones de leads, citas y avisos del sistema (por ejemplo, "Google Calendar se desconectó").
   - **Automatizaciones**: qué hace cada una y cómo pausarlas (interruptor Activa/Inactiva). Recomienda que te pida los cambios en lugar de editarlas.
3. Buenas prácticas de WhatsApp (sección 4) y límites de Instagram (sección 5.2), otra vez y por escrito.
4. **Privacidad y términos**: `https://<dominio>/privacy` y `https://<dominio>/terms` (también enlazados en el login y en la página de reservas). Si pone la página de reservas en su web, que enlace también su propia política de privacidad.
5. Déjale por escrito: URL de acceso, su link de reservas, a quién escribir para soporte y en qué horario.

**Pendiente:** Rocco no envía un correo de bienvenida con las credenciales; tienes que mandarlas tú.

---

## 11. Primera semana: qué vigilar y problemas frecuentes

### 11.1 Alertas de Telegram que recibes tú
Llegan a tu chat de Telegram (vía el flujo de n8n "Rocco CRM · Alertas"):

| Alerta | Qué significa | Qué hacer |
|---|---|---|
| `🚨 Rocco CRM · WhatsApp desconectado` (con organización, nombre e instancia) | Un número lleva al menos 2 comprobaciones seguidas (unos 10 min) caído. No entran mensajes ni leads de ese cliente. | Avisa al cliente y reconecta (11.2). |
| `🚨 Rocco CRM · Evolution API no responde` | El servidor de WhatsApp no contesta (afecta a todos los clientes). | Revisa el contenedor de Evolution en el servidor. |
| `🚨 Rocco CRM · WhatsApp reconectado ✅` | Volvió solo o lo reconectaron. | Nada. |
| `🚨 Rocco CRM · error` con `[google] permiso revocado/caducado para <correo>` | Google retiró el permiso de ese usuario. | Pide al usuario que reconecte (11.3). |
| `🚨 Rocco CRM · error` (otros) | Cualquier error del servidor. Se agrupan: el mismo error como mucho una vez cada 30 min. | Si se repite o menciona al cliente nuevo, investígalo. |
| `❌ Backup del CRM FALLÓ …` | Falló el backup diario (07:00 UTC). | Revísalo el mismo día. |
| `✅ Backups del CRM al día …` | Resumen semanal, los domingos. | Si un domingo no llega, el backup o las alertas están caídos. |

Además, durante la primera semana:
- Día 1 y día 3: entra con **Acceder al CRM** y revisa que entran conversaciones y leads, y que las automatizaciones tienen **Ejecuciones** y una **Última ejecución** reciente.
- En la ficha del cliente, pestaña **Auditoría**, comprueba que el equipo inicia sesión y trabaja los leads.
- Al final de la semana, llama al cliente: dudas, textos a ajustar, etapas que sobran o faltan.

### 11.2 WhatsApp desconectado
Síntomas: alerta de Telegram, el cliente dice que "no entran mensajes", en Ajustes → WhatsApp aparece **Desconectado** o **Esperando QR**.
Solución: Ajustes → **WhatsApp** → **Gestionar** → **Conectar** y volver a escanear el QR con el teléfono del negocio. Causas típicas: el cliente cerró la sesión del dispositivo vinculado, cambió de teléfono o el teléfono estuvo muchos días sin internet. Los mensajes recibidos mientras estuvo desconectado pueden no aparecer en el CRM.
**Pendiente:** el cliente no recibe ningún aviso dentro del CRM cuando se cae su WhatsApp; solo te llega a ti por Telegram.

### 11.3 Google Calendar desconectado
Síntomas: en la campanita aparece **"Google Calendar se desconectó"**; las citas nuevas no tienen enlace de Meet.
Solución: el usuario afectado entra con su sesión a **Mi Perfil → Conexiones → Google Calendar → Conectar**. Al reconectar, Rocco **repara solo** las citas pendientes que se agendaron sin Meet mientras estaba desconectado.
Ojo: el texto de la notificación y el aviso del calendario dicen que se reconecta en "Configuración → Calendarios / Calendario", pero el botón está en **Mi Perfil** (ver lista de errores de texto en el informe).

### 11.4 DM de Instagram rechazado
Síntomas: al responder desde Mensajes sale "Instagram no permite escribirle todavía…" o el DM automático no llegó.
Causa: la ventana de 24 h de Meta o la respuesta privada ya usada (sección 5.2). No es un fallo de Rocco.
Solución: esperar a que la persona escriba por DM; responder públicamente al comentario; o pedirle su WhatsApp.

### 11.5 Un lead no aparece en el pipeline
Revisa en este orden:
1. ¿La conversación está en **Mensajes**? Si no, el problema es la conexión (11.2 u 11.4).
2. ¿Existe un pipeline con al menos una etapa? (Ajustes → Pipelines y etapas.)
3. ¿Hay una automatización **Activa** con el disparador correcto (**Nuevo mensaje de WhatsApp** / **Comentario en Instagram**) y un paso **Crear oportunidad**? ¿Su contador de **Ejecuciones** sube?
4. WhatsApp: el disparador solo actúa con la **primera** conversación de ese número; si el contacto ya había escrito antes, no crea un lead nuevo. Créalo a mano desde el contacto.
5. Instagram: el comentario tenía que pedir información o contener la palabra clave del post; no puede venir de una cuenta del propio negocio; y esa persona no puede haber recibido el flujo en los últimos 7 días.
6. Si todo está bien y sigue sin aparecer, busca en Telegram una alerta de error de esa hora.

### 11.6 Otros
- **El cliente perdió la contraseña**: panel de agencia → ficha → pestaña CRM → **Re-provisionar** → mándale la nueva contraseña temporal.
- **La reserva no ofrece horas**: revisa **Reserva en línea** activada, disponibilidad del calendario, **Anticipación mínima**, **Ventana** y la zona horaria.
- **Llegan recordatorios de una cita cancelada**: limitación conocida (8.2).
