<template>
  <div class="min-h-screen bg-gray-50">
    <!-- Header -->
    <header class="bg-white border-b border-gray-200 sticky top-0 z-10">
      <div class="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
        <div class="flex items-center gap-3">
          <div class="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center">
            <svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>
          <span class="font-semibold text-gray-900 text-lg">Rocco CRM</span>
        </div>
        <nav class="hidden md:flex items-center gap-6 text-sm text-gray-500">
          <a href="#privacidad" class="hover:text-indigo-600 transition-colors">Privacidad</a>
          <a href="#seguridad" class="hover:text-indigo-600 transition-colors">Seguridad</a>
          <a href="#derechos" class="hover:text-indigo-600 transition-colors">Tus derechos</a>
          <a href="#contacto" class="hover:text-indigo-600 transition-colors">Contacto</a>
        </nav>
      </div>
    </header>

    <!-- Hero -->
    <div class="bg-white border-b border-gray-200">
      <div class="max-w-4xl mx-auto px-6 py-12">
        <div class="flex items-center gap-2 text-indigo-600 text-sm font-medium mb-3">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
          Documento legal
        </div>
        <h1 class="text-3xl font-bold text-gray-900 mb-4">
          Política de Privacidad y Seguridad
        </h1>
        <p class="text-gray-500 text-base max-w-2xl">
          Esta política describe cómo Rocco CRM recopila, usa, almacena y protege la información de
          sus clientes y usuarios finales. Léala detenidamente antes de usar nuestra plataforma.
        </p>
        <div class="mt-6 flex flex-wrap gap-4 text-sm text-gray-500">
          <span class="flex items-center gap-1.5">
            <svg class="w-4 h-4 text-green-500" fill="currentColor" viewBox="0 0 20 20">
              <path fill-rule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                clip-rule="evenodd" />
            </svg>
            Última actualización: {{ lastUpdated }}
          </span>
          <span class="flex items-center gap-1.5">
            <svg class="w-4 h-4 text-green-500" fill="currentColor" viewBox="0 0 20 20">
              <path fill-rule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                clip-rule="evenodd" />
            </svg>
            Versión 1.0
          </span>
          <span class="flex items-center gap-1.5">
            <svg class="w-4 h-4 text-green-500" fill="currentColor" viewBox="0 0 20 20">
              <path fill-rule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                clip-rule="evenodd" />
            </svg>
            Aplica en todos los territorios donde operamos
          </span>
        </div>
      </div>
    </div>

    <!-- Índice / ToC -->
    <div class="max-w-4xl mx-auto px-6 py-8">
      <div class="bg-indigo-50 border border-indigo-100 rounded-xl p-6 mb-10">
        <h2 class="text-sm font-semibold text-indigo-800 uppercase tracking-wide mb-4">Contenido</h2>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
          <a v-for="section in toc" :key="section.id" :href="`#${section.id}`"
            class="flex items-center gap-2 text-indigo-700 hover:text-indigo-900 hover:underline py-1">
            <span class="text-indigo-400 font-mono text-xs w-6 shrink-0">{{ section.num }}</span>
            {{ section.title }}
          </a>
        </div>
      </div>

      <!-- ── SECCIÓN 1: QUIÉNES SOMOS ── -->
      <section id="identidad" class="mb-12">
        <SectionHeader num="1" title="Quiénes somos y cómo contactarnos" />
        <div class="prose-content">
          <p>
            <strong>Rocco CRM</strong> es una plataforma de gestión de relaciones con clientes
            (CRM) de tipo Software como Servicio (SaaS), desarrollada y operada por
            <strong>Árbol Áureo</strong> («la Empresa», «nosotros» o «nuestro»).
          </p>
          <p>
            Nuestros servicios incluyen la gestión de contactos, oportunidades de venta, citas,
            conversaciones multicanal (WhatsApp, Instagram, Facebook Messenger), automatizaciones
            de marketing y comunicaciones, y herramientas de analítica orientadas a negocios.
          </p>
          <InfoBox type="info" title="Roles en el tratamiento de datos">
            Actuamos como <strong>Encargado del Tratamiento</strong> respecto a los datos de los
            contactos finales que las organizaciones clientes gestionan dentro de la plataforma.
            Actuamos como <strong>Responsable del Tratamiento</strong> respecto a los datos de
            los usuarios que se registran directamente en Rocco CRM (administradores, agentes,
            usuarios de la organización).
          </InfoBox>
        </div>
      </section>

      <!-- ── SECCIÓN 2: DEFINICIONES ── -->
      <section id="definiciones" class="mb-12">
        <SectionHeader num="2" title="Definiciones" />
        <div class="prose-content">
          <dl class="divide-y divide-gray-100">
            <DefinitionItem term="Plataforma">
              El conjunto de aplicaciones web, APIs y servicios que conforman Rocco CRM.
            </DefinitionItem>
            <DefinitionItem term="Cliente / Organización">
              Persona jurídica o natural que suscribe una cuenta en Rocco CRM para gestionar su negocio.
            </DefinitionItem>
            <DefinitionItem term="Usuario">
              Cualquier persona (administrador, agente, miembro del equipo) que accede a la
              Plataforma en nombre de una Organización mediante credenciales propias.
            </DefinitionItem>
            <DefinitionItem term="Contacto final">
              Persona cuyos datos son almacenados y gestionados dentro de la Plataforma por
              una Organización (prospectos, clientes, leads).
            </DefinitionItem>
            <DefinitionItem term="Datos Personales">
              Cualquier información que identifique o permita identificar a una persona natural.
            </DefinitionItem>
            <DefinitionItem term="Tratamiento">
              Toda operación realizada sobre Datos Personales: recopilación, almacenamiento,
              consulta, uso, comunicación, transferencia o supresión.
            </DefinitionItem>
            <DefinitionItem term="Sub-encargado">
              Tercero al que la Empresa encarga parte del tratamiento de datos con las debidas
              garantías contractuales (proveedores de infraestructura, APIs de mensajería, etc.).
            </DefinitionItem>
          </dl>
        </div>
      </section>

      <!-- ── SECCIÓN 3: DATOS QUE RECOPILAMOS ── -->
      <section id="datos-recopilados" class="mb-12">
        <SectionHeader num="3" title="Datos que recopilamos" />
        <div class="prose-content">
          <h3>3.1 Datos de Usuarios de la Organización</h3>
          <p>Cuando una organización registra usuarios en la plataforma, recopilamos:</p>
          <ul>
            <li><strong>Identidad:</strong> nombre completo, dirección de correo electrónico.</li>
            <li><strong>Credenciales:</strong> contraseña cifrada (bcrypt, nunca en texto claro).</li>
            <li><strong>Configuración:</strong> preferencias de interfaz, zona horaria, idioma.</li>
            <li><strong>Metadatos de sesión:</strong> dirección IP, tipo de navegador, timestamps de inicio/cierre de sesión.</li>
            <li><strong>Actividad interna:</strong> acciones realizadas en la plataforma (registros de auditoría).</li>
          </ul>

          <h3>3.2 Datos de la Organización</h3>
          <ul>
            <li>Nombre legal y comercial de la empresa.</li>
            <li>Correo electrónico, teléfono y dirección postal de contacto.</li>
            <li>Datos de facturación y suscripción (no almacenamos datos de tarjeta directamente; se gestionan a través del procesador de pagos).</li>
            <li>Configuración de integraciones: instancias de WhatsApp (número, nombre de instancia), páginas de Facebook, cuentas de Instagram, credenciales OAuth (tokens, nunca contraseñas).</li>
          </ul>

          <h3>3.3 Datos de Contactos Finales</h3>
          <p>
            Las organizaciones clientes introducen y gestionan datos de sus propios contactos.
            La Empresa trata estos datos únicamente en calidad de Encargado del Tratamiento, bajo
            las instrucciones de la Organización. Estos datos pueden incluir:
          </p>
          <ul>
            <li>Nombre, apellidos, correo electrónico, número de teléfono (incluyendo WhatsApp).</li>
            <li>Datos de identificación en redes sociales (ID de usuario de Instagram/Facebook).</li>
            <li>Historial de conversaciones (mensajes de WhatsApp, Instagram DM, Facebook Messenger).</li>
            <li>Notas, etiquetas y campos personalizados ingresados por la organización.</li>
            <li>Historial de citas agendadas: fecha, hora, enlace de reunión, estado.</li>
            <li>Oportunidades y datos del pipeline de ventas asociados al contacto.</li>
            <li>Registros de automatizaciones ejecutadas.</li>
          </ul>

          <h3>3.4 Datos técnicos y de uso</h3>
          <ul>
            <li>Logs del servidor (peticiones HTTP, errores, tiempos de respuesta).</li>
            <li>Eventos de webhooks recibidos desde terceros (Meta, Evolution API).</li>
            <li>Métricas de rendimiento agregadas y anonimizadas.</li>
          </ul>

          <InfoBox type="warning" title="Datos sensibles">
            Rocco CRM <strong>no solicita ni almacena deliberadamente</strong> categorías especiales
            de datos (datos de salud, religión, origen étnico, orientación sexual, afiliación
            política, etc.). Las organizaciones no deben introducir esta clase de información en
            la plataforma.
          </InfoBox>
        </div>
      </section>

      <!-- ── SECCIÓN 4: BASE LEGAL ── -->
      <section id="base-legal" class="mb-12">
        <SectionHeader num="4" title="Base legal del tratamiento" />
        <div class="prose-content">
          <p>
            El tratamiento de datos se sustenta en las siguientes bases legales según el
            Reglamento General de Protección de Datos (RGPD/GDPR) de la Unión Europea,
            la CCPA/CPRA de California y legislaciones equivalentes:
          </p>
          <div class="overflow-x-auto">
            <table class="legal-table">
              <thead>
                <tr>
                  <th>Tipo de dato</th>
                  <th>Base legal</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Datos de usuarios de la plataforma</td>
                  <td>Ejecución de contrato (Art. 6.1.b GDPR)</td>
                </tr>
                <tr>
                  <td>Datos de facturación y suscripción</td>
                  <td>Ejecución de contrato + obligación legal (Art. 6.1.b y 6.1.c)</td>
                </tr>
                <tr>
                  <td>Logs y datos de seguridad</td>
                  <td>Interés legítimo en la seguridad del servicio (Art. 6.1.f)</td>
                </tr>
                <tr>
                  <td>Datos de contactos finales</td>
                  <td>
                    Instrucciones del Responsable (la Organización cliente) bajo Acuerdo de
                    Encargado del Tratamiento (DPA)
                  </td>
                </tr>
                <tr>
                  <td>Comunicaciones de marketing</td>
                  <td>Consentimiento explícito del usuario (Art. 6.1.a)</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <!-- ── SECCIÓN 5: USO DE LOS DATOS ── -->
      <section id="uso-datos" class="mb-12">
        <SectionHeader num="5" title="Finalidades del tratamiento" />
        <div class="prose-content">
          <h3>5.1 Para la prestación del servicio</h3>
          <ul>
            <li>Autenticación y control de acceso a la plataforma.</li>
            <li>Sincronización y visualización de conversaciones multicanal.</li>
            <li>Ejecución de automatizaciones configuradas por la organización.</li>
            <li>Envío de mensajes de WhatsApp e Instagram en nombre de la organización.</li>
            <li>Gestión del calendario de citas y envío de notificaciones/recordatorios.</li>
            <li>Generación de reportes y estadísticas de uso para la organización.</li>
          </ul>

          <h3>5.2 Para operaciones de la empresa</h3>
          <ul>
            <li>Facturación, gestión de suscripciones y cobros.</li>
            <li>Soporte técnico y resolución de incidencias.</li>
            <li>Auditoría de seguridad y detección de fraude.</li>
            <li>Mantenimiento, actualizaciones y mejoras del servicio.</li>
            <li>Cumplimiento de obligaciones legales.</li>
          </ul>

          <h3>5.3 Para comunicación con clientes</h3>
          <ul>
            <li>Notificaciones sobre cambios en los términos o en el servicio.</li>
            <li>Alertas críticas de seguridad.</li>
            <li>Actualizaciones del producto y nuevas funcionalidades (con posibilidad de desuscripción).</li>
          </ul>

          <InfoBox type="info" title="Prohibición de uso indebido">
            La Empresa <strong>no vende, alquila ni comercializa</strong> los datos de los
            usuarios ni de los contactos finales a terceros. Los datos no se utilizan para
            publicidad dirigida a los contactos finales.
          </InfoBox>
        </div>
      </section>

      <!-- ── SECCIÓN 6: INTEGRACIONES Y SUB-ENCARGADOS ── -->
      <section id="terceros" class="mb-12">
        <SectionHeader num="6" title="Integraciones con terceros y sub-encargados" />
        <div class="prose-content">
          <p>
            Para prestar el servicio, la Empresa utiliza proveedores de terceros que actúan como
            sub-encargados del tratamiento. Todos ellos cuentan con políticas de privacidad propias
            y garantías contractuales adecuadas.
          </p>

          <div class="space-y-4 mt-4">
            <ThirdPartyCard
              name="Meta Platforms (Facebook / Instagram)"
              purpose="Recepción y envío de mensajes vía Instagram Direct y Facebook Messenger a través de Meta Graph API v19.0. Procesamiento de comentarios de Instagram."
              data="ID de usuario de Instagram/Facebook, contenido de mensajes, tokens de acceso OAuth (cifrados en reposo)."
              policy="https://www.facebook.com/privacy/policy/" />

            <ThirdPartyCard
              name="WhatsApp / Evolution API"
              purpose="Envío y recepción de mensajes de WhatsApp Business a través de la instancia Evolution API configurada por la organización."
              data="Número de teléfono (JID de WhatsApp), contenido de mensajes de texto e imágenes, estado de entrega."
              policy="https://www.whatsapp.com/legal/privacy-policy" />

            <ThirdPartyCard
              name="Google Calendar API"
              purpose="Sincronización bidireccional de citas entre el calendario de Rocco CRM y Google Calendar cuando la organización lo habilita."
              data="Título de eventos, fecha/hora, asistentes (correo electrónico), enlace de reunión. Tokens OAuth almacenados cifrados."
              policy="https://policies.google.com/privacy" />

            <ThirdPartyCard
              name="Proveedor de infraestructura (servidor)"
              purpose="Alojamiento de la base de datos, contenedores Docker y servicio de red donde se ejecuta la plataforma."
              data="Todos los datos de la plataforma. El servidor opera dentro de los límites físicos contratados. Los datos no se transfieren a servidores adicionales sin notificación."
              policy="" />

            <ThirdPartyCard
              name="Cloudflare"
              purpose="Enrutamiento de tráfico HTTPS, terminación TLS y protección ante ataques DDoS a través del túnel Cloudflare."
              data="Metadatos de tráfico de red (IPs, tiempos de respuesta). Cloudflare no accede al contenido de las peticiones."
              policy="https://www.cloudflare.com/privacypolicy/" />
          </div>

          <p class="mt-6 text-sm text-gray-500">
            La lista actualizada de sub-encargados se puede solicitar por escrito a
            <a href="mailto:rodrigoalfonzo97@gmail.com" class="text-indigo-600 hover:underline">rodrigoalfonzo97@gmail.com</a>.
            La Empresa notificará con al menos <strong>30 días de antelación</strong> cualquier
            incorporación de nuevos sub-encargados relevantes.
          </p>
        </div>
      </section>

      <!-- ── SECCIÓN 7: TRANSFERENCIAS INTERNACIONALES ── -->
      <section id="transferencias" class="mb-12">
        <SectionHeader num="7" title="Transferencias internacionales de datos" />
        <div class="prose-content">
          <p>
            Los datos pueden ser procesados en países distintos al de residencia del usuario.
            Las transferencias internacionales se realizan únicamente cuando existe alguna de
            las siguientes garantías:
          </p>
          <ul>
            <li>
              <strong>Decisión de adecuación de la Comisión Europea:</strong> para transferencias
              hacia países reconocidos con nivel de protección equivalente al europeo.
            </li>
            <li>
              <strong>Cláusulas Contractuales Tipo (SCC):</strong> incorporadas en los acuerdos
              con sub-encargados ubicados en terceros países.
            </li>
            <li>
              <strong>Mecanismos de la CCPA:</strong> para usuarios en California (EE.UU.), con
              derechos equivalentes reconocidos.
            </li>
            <li>
              <strong>Consentimiento explícito:</strong> cuando ninguna otra base sea aplicable,
              se solicitará consentimiento informado previo.
            </li>
          </ul>
          <p>
            Meta Platforms y Google tienen sede principal en Estados Unidos y están sujetos al
            Data Privacy Framework (DPF) UE-EE.UU., lo que permite la transferencia de datos
            personales desde el Espacio Económico Europeo.
          </p>
        </div>
      </section>

      <!-- ── SECCIÓN 8: RETENCIÓN DE DATOS ── -->
      <section id="retencion" class="mb-12">
        <SectionHeader num="8" title="Plazos de retención de datos" />
        <div class="prose-content">
          <div class="overflow-x-auto">
            <table class="legal-table">
              <thead>
                <tr>
                  <th>Tipo de dato</th>
                  <th>Plazo de retención</th>
                  <th>Criterio</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Datos de cuenta de usuario</td>
                  <td>Duración de la suscripción + 30 días</td>
                  <td>Posibilidad de reactivación</td>
                </tr>
                <tr>
                  <td>Contactos finales y conversaciones</td>
                  <td>Duración de la suscripción + 30 días</td>
                  <td>Instrucción del responsable (organización)</td>
                </tr>
                <tr>
                  <td>Logs de seguridad y auditoría</td>
                  <td>12 meses</td>
                  <td>Interés legítimo y cumplimiento normativo</td>
                </tr>
                <tr>
                  <td>Datos de facturación</td>
                  <td>7 años</td>
                  <td>Obligación legal (normativa fiscal)</td>
                </tr>
                <tr>
                  <td>Backups de base de datos</td>
                  <td>30 días (backups diarios rotatorios)</td>
                  <td>Recuperación ante desastres</td>
                </tr>
                <tr>
                  <td>Tokens OAuth (Instagram, Google)</td>
                  <td>Hasta revocación o caducidad</td>
                  <td>Necesidad funcional del servicio</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p class="mt-4">
            Al cancelar una suscripción, la Organización puede solicitar la <strong>eliminación
            inmediata</strong> de todos sus datos antes del período de retención estándar,
            mediante solicitud escrita a
            <a href="mailto:rodrigoalfonzo97@gmail.com" class="text-indigo-600 hover:underline">rodrigoalfonzo97@gmail.com</a>.
            La eliminación se confirmará en un plazo máximo de <strong>72 horas hábiles</strong>.
          </p>
        </div>
      </section>

      <!-- ── SECCIÓN 9: SEGURIDAD ── -->
      <section id="seguridad" class="mb-12">
        <SectionHeader num="9" title="Medidas de seguridad técnica y organizativa" />
        <div class="prose-content">
          <p>
            La Empresa aplica medidas de seguridad alineadas con los estándares de la industria
            para garantizar la confidencialidad, integridad y disponibilidad de los datos:
          </p>

          <h3>9.1 Seguridad en tránsito</h3>
          <ul>
            <li>Todo el tráfico entre el cliente y la plataforma está cifrado mediante <strong>TLS 1.2+ (HTTPS)</strong> a través del túnel Cloudflare.</li>
            <li>Los webhooks de terceros (Meta, Evolution API) se reciben exclusivamente por endpoints HTTPS.</li>
            <li>Las claves API y tokens OAuth se transmiten solo por canales cifrados, nunca en parámetros de URL visibles.</li>
          </ul>

          <h3>9.2 Seguridad en reposo</h3>
          <ul>
            <li>Las contraseñas de usuarios se almacenan con hash <strong>bcrypt</strong> con factor de coste ≥ 12.</li>
            <li>Los tokens de acceso OAuth (Instagram, Google) se almacenan cifrados en la base de datos.</li>
            <li>Las claves API de terceros (Evolution API) se almacenan en variables de entorno del servidor, no en el código fuente.</li>
            <li>El disco del servidor de base de datos está cifrado a nivel de sistema operativo.</li>
          </ul>

          <h3>9.3 Control de acceso</h3>
          <ul>
            <li><strong>Aislamiento multi-tenant:</strong> cada organización tiene su propio espacio lógico. Las consultas a la base de datos incluyen obligatoriamente el filtro <code>organization_id</code> para impedir el acceso cruzado entre tenants.</li>
            <li><strong>Control de roles:</strong> los usuarios tienen roles diferenciados (Administrador, Agente) con permisos granulares por módulo.</li>
            <li><strong>Autenticación por JWT:</strong> tokens firmados con clave secreta rotada periódicamente, con expiración configurable.</li>
            <li><strong>Acceso SSH restringido:</strong> el servidor de producción solo admite acceso SSH mediante red privada virtual (Tailscale/VPN).</li>
            <li><strong>Principio de mínimo privilegio:</strong> el usuario de la base de datos en producción tiene permisos limitados a las operaciones necesarias.</li>
          </ul>

          <h3>9.4 Infraestructura y disponibilidad</h3>
          <ul>
            <li>La plataforma se ejecuta en contenedores <strong>Docker</strong> con separación entre servicios (app, base de datos).</li>
            <li>Backups automáticos diarios de la base de datos PostgreSQL con retención de 30 días.</li>
            <li>Monitoreo activo del estado de los contenedores y servicios críticos.</li>
            <li>Plan de recuperación ante desastres con objetivo de tiempo de recuperación (RTO) de 4 horas para fallos críticos.</li>
          </ul>

          <h3>9.5 Seguridad del desarrollo</h3>
          <ul>
            <li>Código fuente gestionado con control de versiones (Git) en repositorio privado.</li>
            <li>Revisión de cambios antes del despliegue en producción.</li>
            <li>Uso de consultas parametrizadas en todas las operaciones con base de datos para prevenir inyección SQL.</li>
            <li>Validación y saneamiento de entradas del usuario en cliente y servidor.</li>
            <li>Las dependencias se auditan periódicamente ante vulnerabilidades conocidas (CVE).</li>
          </ul>

          <h3>9.6 Gestión de incidentes</h3>
          <ul>
            <li>
              En caso de brecha de seguridad que afecte datos personales, la Empresa notificará
              a las Organizaciones afectadas dentro de las <strong>72 horas</strong> siguientes
              al conocimiento del incidente, conforme al Art. 33 del GDPR.
            </li>
            <li>
              Se mantendrá un registro interno de incidentes de seguridad con descripción,
              alcance, medidas adoptadas y lecciones aprendidas.
            </li>
            <li>
              Para reportar vulnerabilidades de seguridad, contactar a
              <a href="mailto:rodrigoalfonzo97@gmail.com" class="text-indigo-600 hover:underline">rodrigoalfonzo97@gmail.com</a>
              con el asunto «Responsible Disclosure».
            </li>
          </ul>

          <InfoBox type="success" title="Política de divulgación responsable">
            Rocco CRM reconoce la labor de investigadores de seguridad. Si detectas una
            vulnerabilidad, repórtala de forma responsable antes de hacerla pública.
            Respondemos a todos los reportes dentro de 5 días hábiles.
          </InfoBox>
        </div>
      </section>

      <!-- ── SECCIÓN 10: COOKIES ── -->
      <section id="cookies" class="mb-12">
        <SectionHeader num="10" title="Cookies y almacenamiento local" />
        <div class="prose-content">
          <p>
            Rocco CRM es una aplicación web de página única (SPA). Utilizamos
            <strong>almacenamiento local del navegador</strong> (<code>localStorage</code> /
            <code>sessionStorage</code>) para mantener la sesión activa. No usamos cookies de
            rastreo de terceros ni píxeles de seguimiento.
          </p>
          <div class="overflow-x-auto mt-4">
            <table class="legal-table">
              <thead>
                <tr>
                  <th>Nombre / clave</th>
                  <th>Tipo</th>
                  <th>Finalidad</th>
                  <th>Duración</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><code>token</code></td>
                  <td>localStorage</td>
                  <td>Token JWT de autenticación de sesión</td>
                  <td>Hasta cierre de sesión o expiración</td>
                </tr>
                <tr>
                  <td><code>agency_token</code></td>
                  <td>localStorage</td>
                  <td>Token de sesión de cuenta de agencia</td>
                  <td>Hasta cierre de sesión o expiración</td>
                </tr>
                <tr>
                  <td>Preferencias de UI</td>
                  <td>localStorage</td>
                  <td>Configuración local de interfaz (tema, vistas)</td>
                  <td>Indefinida (hasta que el usuario la borre)</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p class="mt-4">
            Puedes borrar estos datos en cualquier momento desde la configuración de tu navegador
            o cerrando sesión en la plataforma. No se requiere consentimiento de cookies para el
            funcionamiento esencial de la plataforma.
          </p>
        </div>
      </section>

      <!-- ── SECCIÓN 11: DERECHOS ── -->
      <section id="derechos" class="mb-12">
        <SectionHeader num="11" title="Derechos de los interesados" />
        <div class="prose-content">
          <p>
            Dependiendo de tu jurisdicción, tienes derecho a ejercer los siguientes derechos
            respecto a tus datos personales:
          </p>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-4 my-6">
            <RightCard icon="eye" title="Acceso" color="blue">
              Solicitar confirmación de si tratamos tus datos y obtener una copia.
            </RightCard>
            <RightCard icon="pencil" title="Rectificación" color="green">
              Corregir datos inexactos o completar datos incompletos.
            </RightCard>
            <RightCard icon="trash" title="Supresión («derecho al olvido»)" color="red">
              Solicitar la eliminación de tus datos cuando ya no sean necesarios o retires el consentimiento.
            </RightCard>
            <RightCard icon="ban" title="Oposición" color="orange">
              Oponerte al tratamiento basado en interés legítimo.
            </RightCard>
            <RightCard icon="pause" title="Limitación" color="purple">
              Solicitar la suspensión temporal del tratamiento mientras se resuelve una reclamación.
            </RightCard>
            <RightCard icon="download" title="Portabilidad" color="indigo">
              Recibir tus datos en formato estructurado (JSON/CSV) para transferirlos a otro servicio.
            </RightCard>
            <RightCard icon="robot" title="Decisiones automatizadas" color="gray">
              No ser objeto de decisiones basadas exclusivamente en tratamiento automatizado que te afecten significativamente.
            </RightCard>
            <RightCard icon="megaphone" title="Reclamación ante autoridad" color="teal">
              Presentar una reclamación ante la autoridad supervisora de protección de datos de tu país.
            </RightCard>
          </div>

          <h3>11.1 Derechos bajo CCPA/CPRA (California)</h3>
          <p>
            Los residentes de California tienen adicionalmente el derecho a:
          </p>
          <ul>
            <li>Conocer las categorías y fuentes de información personal recopilada.</li>
            <li>Conocer con qué terceros se comparte la información.</li>
            <li><strong>Opt-out</strong> de la «venta» de información personal (Rocco CRM no vende datos).</li>
            <li>No sufrir discriminación por ejercer sus derechos CCPA.</li>
            <li>Solicitar la corrección de información personal inexacta.</li>
          </ul>

          <h3>11.2 Cómo ejercer tus derechos</h3>
          <p>
            Las solicitudes se pueden presentar de las siguientes formas:
          </p>
          <ul>
            <li>
              <strong>Email:</strong>
              <a href="mailto:rodrigoalfonzo97@gmail.com" class="text-indigo-600 hover:underline">rodrigoalfonzo97@gmail.com</a>
              con el asunto «Solicitud de derechos ARCO».
            </li>
            <li>
              <strong>Plazo de respuesta:</strong> máximo <strong>30 días naturales</strong>
              (ampliable a 60 días en casos complejos con notificación previa).
            </li>
            <li>
              <strong>Verificación de identidad:</strong> podremos solicitar prueba de identidad
              para proteger los datos del titular.
            </li>
          </ul>

          <InfoBox type="info" title="Para contactos finales de organizaciones">
            Si eres una persona cuyos datos gestiona una organización usuaria de Rocco CRM,
            debes dirigir tus solicitudes de derechos directamente a esa organización, que es
            la Responsable del Tratamiento de tus datos. La Empresa asistirá a la organización
            para dar cumplimiento a dichas solicitudes.
          </InfoBox>
        </div>
      </section>

      <!-- ── SECCIÓN 12: MENORES ── -->
      <section id="menores" class="mb-12">
        <SectionHeader num="12" title="Menores de edad" />
        <div class="prose-content">
          <p>
            Rocco CRM es un servicio dirigido exclusivamente a <strong>personas mayores de 18
            años</strong> y a entidades comerciales. La plataforma no está diseñada para recopilar
            ni tratar intencionalmente datos de menores de 18 años (o 16 años en el Espacio
            Económico Europeo).
          </p>
          <p>
            Si detectamos que hemos recopilado datos de menores sin el consentimiento apropiado,
            procederemos a eliminarlos de inmediato. Las organizaciones clientes son responsables
            de garantizar que sus contactos finales sean mayores de edad o cuenten con
            consentimiento parental verificable.
          </p>
        </div>
      </section>

      <!-- ── SECCIÓN 13: ACUERDO DPA ── -->
      <section id="dpa" class="mb-12">
        <SectionHeader num="13" title="Acuerdo de Encargado del Tratamiento (DPA)" />
        <div class="prose-content">
          <p>
            Para organizaciones sujetas al GDPR u otras legislaciones que exigen un acuerdo
            formal de procesamiento de datos entre Responsable y Encargado, Rocco CRM ofrece
            la firma de un <strong>Data Processing Agreement (DPA)</strong> que incluye:
          </p>
          <ul>
            <li>Descripción detallada del tratamiento y sus finalidades.</li>
            <li>Obligaciones y derechos del Responsable.</li>
            <li>Obligaciones del Encargado (Rocco CRM), incluyendo medidas de seguridad, sub-encargados y notificación de brechas.</li>
            <li>Cláusulas Contractuales Tipo (SCC) para transferencias internacionales cuando apliquen.</li>
            <li>Procedimientos de auditoría y demostración de cumplimiento.</li>
          </ul>
          <p>
            Para solicitar el DPA, contactar a
            <a href="mailto:rodrigoalfonzo97@gmail.com" class="text-indigo-600 hover:underline">rodrigoalfonzo97@gmail.com</a>.
          </p>
        </div>
      </section>

      <!-- ── SECCIÓN 14: CAMBIOS EN LA POLÍTICA ── -->
      <section id="cambios" class="mb-12">
        <SectionHeader num="14" title="Cambios en esta política" />
        <div class="prose-content">
          <p>
            La Empresa puede actualizar esta política cuando sea necesario para reflejar
            cambios en el servicio, nuevas integraciones, cambios normativos o mejoras en
            las prácticas de privacidad.
          </p>
          <ul>
            <li>
              Los cambios <strong>materiales</strong> (que afecten significativamente tus derechos
              o el uso de datos) se comunicarán por correo electrónico a los administradores de
              las organizaciones con al menos <strong>30 días de antelación</strong>.
            </li>
            <li>
              Los cambios <strong>menores</strong> (aclaraciones, correcciones tipográficas,
              nuevos sub-encargados no críticos) se publicarán actualizando esta página con
              la nueva fecha de vigencia.
            </li>
            <li>
              El uso continuado de la plataforma tras la fecha de entrada en vigor de los
              cambios implica la aceptación de la versión actualizada.
            </li>
            <li>
              Las versiones anteriores de esta política estarán disponibles bajo solicitud
              a <a href="mailto:rodrigoalfonzo97@gmail.com" class="text-indigo-600 hover:underline">rodrigoalfonzo97@gmail.com</a>.
            </li>
          </ul>
        </div>
      </section>

      <!-- ── SECCIÓN 15: TÉRMINOS DE USO ACEPTABLE ── -->
      <section id="uso-aceptable" class="mb-12">
        <SectionHeader num="15" title="Política de uso aceptable" />
        <div class="prose-content">
          <p>
            Al usar Rocco CRM, la Organización se compromete a:
          </p>
          <ul>
            <li>
              <strong>Obtener consentimiento:</strong> obtener el consentimiento válido de los
              contactos finales antes de enviarles comunicaciones de marketing mediante WhatsApp,
              Instagram u otros canales, conforme a la legislación aplicable (CAN-SPAM, CASL,
              GDPR, Ley de Protección al Consumidor en EE.UU., etc.).
            </li>
            <li>
              <strong>Respetar las políticas de Meta:</strong> cumplir las políticas de la
              Plataforma de WhatsApp Business y las Políticas de Plataforma de Meta al usar
              las integraciones de mensajería.
            </li>
            <li>
              <strong>No usar para spam:</strong> no usar la plataforma para envío masivo de
              mensajes no solicitados, phishing, fraude ni ninguna actividad ilícita.
            </li>
            <li>
              <strong>No almacenar datos prohibidos:</strong> no introducir en la plataforma
              datos cuyo tratamiento esté prohibido por ley (datos de menores sin consentimiento,
              datos sensibles sin base legal, etc.).
            </li>
            <li>
              <strong>Mantener la seguridad de las credenciales:</strong> proteger las contraseñas
              y claves API de acceso a la plataforma.
            </li>
            <li>
              <strong>Notificar incidentes:</strong> informar a la Empresa sobre cualquier uso
              no autorizado de la cuenta o brecha de seguridad detectada.
            </li>
          </ul>
          <p>
            El incumplimiento de esta política puede resultar en la suspensión o cancelación
            del acceso a la plataforma sin derecho a reembolso.
          </p>
        </div>
      </section>

      <!-- ── SECCIÓN 16: CONTACTO ── -->
      <section id="contacto" class="mb-12">
        <SectionHeader num="16" title="Contacto y Delegado de Protección de Datos" />
        <div class="prose-content">
          <p>
            Para cualquier consulta, reclamación o solicitud relacionada con esta política o
            con el tratamiento de datos personales, puedes contactarnos:
          </p>
          <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
            <ContactCard
              icon="mail"
              title="Privacidad general"
              value="rodrigoalfonzo97@gmail.com" />
            <ContactCard
              icon="shield"
              title="Seguridad / Vulnerabilidades"
              value="rodrigoalfonzo97@gmail.com" />
            <ContactCard
              icon="document"
              title="Asuntos legales / DPA"
              value="rodrigoalfonzo97@gmail.com" />
          </div>
          <p class="mt-6">
            <strong>Árbol Áureo</strong><br />
            <a href="mailto:rodrigoalfonzo97@gmail.com" class="text-indigo-600 hover:underline">rodrigoalfonzo97@gmail.com</a>
          </p>
          <p class="mt-3 text-sm text-gray-500">
            Si considera que el tratamiento de sus datos infringe la normativa aplicable,
            tiene derecho a presentar una reclamación ante la autoridad de control competente:
            la <strong>Agencia Española de Protección de Datos (AEPD)</strong> para residentes
            en España/UE, la <strong>California Privacy Protection Agency (CPPA)</strong> para
            residentes en California, o la autoridad equivalente en su país de residencia.
          </p>
        </div>
      </section>

      <!-- Footer de la página -->
      <div class="border-t border-gray-200 pt-8 pb-16 text-center text-sm text-gray-400">
        <p>© {{ currentYear }} Árbol Áureo — Rocco CRM. Todos los derechos reservados.</p>
        <p class="mt-1">
          Vigente desde {{ lastUpdated }} · Versión 1.0 ·
          <router-link to="/login" class="text-indigo-500 hover:underline">Acceder al CRM</router-link>
        </p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const lastUpdated = 'Septiembre 2026';
const currentYear = new Date().getFullYear();

const toc = [
  { num: '01', id: 'identidad',       title: 'Quiénes somos' },
  { num: '02', id: 'definiciones',    title: 'Definiciones' },
  { num: '03', id: 'datos-recopilados', title: 'Datos que recopilamos' },
  { num: '04', id: 'base-legal',      title: 'Base legal del tratamiento' },
  { num: '05', id: 'uso-datos',       title: 'Finalidades del tratamiento' },
  { num: '06', id: 'terceros',        title: 'Integraciones y sub-encargados' },
  { num: '07', id: 'transferencias',  title: 'Transferencias internacionales' },
  { num: '08', id: 'retencion',       title: 'Plazos de retención' },
  { num: '09', id: 'seguridad',       title: 'Medidas de seguridad' },
  { num: '10', id: 'cookies',         title: 'Cookies y almacenamiento local' },
  { num: '11', id: 'derechos',        title: 'Derechos de los interesados' },
  { num: '12', id: 'menores',         title: 'Menores de edad' },
  { num: '13', id: 'dpa',             title: 'Acuerdo DPA' },
  { num: '14', id: 'cambios',         title: 'Cambios en la política' },
  { num: '15', id: 'uso-aceptable',   title: 'Uso aceptable' },
  { num: '16', id: 'contacto',        title: 'Contacto y DPO' },
];
</script>

<!-- ── Sub-componentes inline ──────────────────────────────────────────── -->

<script lang="ts">
import { defineComponent, h } from 'vue';

// SectionHeader
export const SectionHeader = defineComponent({
  props: { num: String, title: String },
  setup(props) {
    return () => h('div', { class: 'flex items-center gap-3 mb-6' }, [
      h('span', {
        class: 'flex-shrink-0 w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 text-sm font-bold flex items-center justify-center',
      }, props.num),
      h('h2', { class: 'text-xl font-semibold text-gray-900' }, props.title),
    ]);
  },
});

// InfoBox
export const InfoBox = defineComponent({
  props: { type: String, title: String },
  setup(props, { slots }) {
    const colors: Record<string, string> = {
      info:    'bg-blue-50 border-blue-200 text-blue-800',
      warning: 'bg-amber-50 border-amber-200 text-amber-800',
      success: 'bg-green-50 border-green-200 text-green-800',
    };
    return () => h('div', {
      class: `rounded-lg border p-4 my-4 text-sm ${colors[props.type ?? 'info']}`,
    }, [
      h('p', { class: 'font-semibold mb-1' }, props.title),
      h('div', {}, slots.default?.()),
    ]);
  },
});

// DefinitionItem
export const DefinitionItem = defineComponent({
  props: { term: String },
  setup(props, { slots }) {
    return () => h('div', { class: 'py-3 flex gap-4 text-sm' }, [
      h('dt', { class: 'font-semibold text-gray-700 w-48 shrink-0' }, props.term),
      h('dd', { class: 'text-gray-600' }, slots.default?.()),
    ]);
  },
});

// ThirdPartyCard
export const ThirdPartyCard = defineComponent({
  props: { name: String, purpose: String, data: String, policy: String },
  setup(props) {
    return () => h('div', { class: 'border border-gray-200 rounded-lg p-4 text-sm' }, [
      h('div', { class: 'flex items-start justify-between gap-2 mb-2' }, [
        h('span', { class: 'font-semibold text-gray-800' }, props.name),
        props.policy ? h('a', {
          href: props.policy, target: '_blank', rel: 'noopener noreferrer',
          class: 'text-xs text-indigo-600 hover:underline shrink-0',
        }, 'Política ↗') : null,
      ]),
      h('p', { class: 'text-gray-600 mb-1' }, [h('strong', {}, 'Finalidad: '), props.purpose]),
      h('p', { class: 'text-gray-500' }, [h('strong', {}, 'Datos transferidos: '), props.data]),
    ]);
  },
});

// RightCard
export const RightCard = defineComponent({
  props: { icon: String, title: String, color: String },
  setup(props, { slots }) {
    const colorMap: Record<string, string> = {
      blue: 'bg-blue-50 border-blue-200', green: 'bg-green-50 border-green-200',
      red: 'bg-red-50 border-red-200', orange: 'bg-orange-50 border-orange-200',
      purple: 'bg-purple-50 border-purple-200', indigo: 'bg-indigo-50 border-indigo-200',
      gray: 'bg-gray-50 border-gray-200', teal: 'bg-teal-50 border-teal-200',
    };
    return () => h('div', { class: `rounded-lg border p-4 text-sm ${colorMap[props.color ?? 'blue']}` }, [
      h('p', { class: 'font-semibold text-gray-800 mb-1' }, props.title),
      h('p', { class: 'text-gray-600' }, slots.default?.()),
    ]);
  },
});

// ContactCard
export const ContactCard = defineComponent({
  props: { icon: String, title: String, value: String },
  setup(props) {
    return () => h('div', { class: 'border border-gray-200 rounded-lg p-4 text-sm text-center' }, [
      h('p', { class: 'font-semibold text-gray-700 mb-1' }, props.title),
      h('a', {
        href: `mailto:${props.value}`,
        class: 'text-indigo-600 hover:underline break-all',
      }, props.value),
    ]);
  },
});
</script>

<style scoped>
@reference "tailwindcss";

.prose-content {
  @apply text-gray-600 leading-relaxed;
}
.prose-content h3 {
  @apply text-base font-semibold text-gray-800 mt-6 mb-3;
}
.prose-content p {
  @apply mb-4;
}
.prose-content ul {
  @apply list-disc list-outside ml-5 mb-4 space-y-1.5;
}
.prose-content li {
  @apply text-gray-600;
}
.prose-content code {
  @apply bg-gray-100 text-gray-700 px-1.5 py-0.5 rounded text-xs font-mono;
}
.prose-content a {
  @apply text-indigo-600 hover:underline;
}
.legal-table {
  @apply w-full text-sm border-collapse;
}
.legal-table th {
  @apply text-left bg-gray-50 text-gray-700 font-semibold px-4 py-2.5 border border-gray-200;
}
.legal-table td {
  @apply px-4 py-2.5 border border-gray-200 text-gray-600 align-top;
}
.legal-table tr:nth-child(even) td {
  @apply bg-gray-50;
}
</style>
