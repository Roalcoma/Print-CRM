<template>
  <div class="min-h-screen bg-gray-50">
    <!-- Header -->
    <header class="bg-white border-b border-gray-200 sticky top-0 z-10">
      <div class="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
        <div class="flex items-center gap-3">
          <div class="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center">
            <svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <span class="font-semibold text-gray-900 text-lg">Rocco CRM</span>
        </div>
        <nav class="hidden md:flex items-center gap-6 text-sm text-gray-500">
          <a href="#servicio" class="hover:text-indigo-600 transition-colors">El servicio</a>
          <a href="#facturacion" class="hover:text-indigo-600 transition-colors">Facturación</a>
          <a href="#responsabilidad" class="hover:text-indigo-600 transition-colors">Responsabilidad</a>
          <a href="#terminacion" class="hover:text-indigo-600 transition-colors">Terminación</a>
        </nav>
      </div>
    </header>

    <!-- Hero -->
    <div class="bg-white border-b border-gray-200">
      <div class="max-w-4xl mx-auto px-6 py-12">
        <div class="flex items-center gap-2 text-indigo-600 text-sm font-medium mb-3">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          Documento legal
        </div>
        <h1 class="text-3xl font-bold text-gray-900 mb-4">Términos y Condiciones de Uso</h1>
        <p class="text-gray-500 text-base max-w-2xl">
          Estos términos constituyen un acuerdo legalmente vinculante entre usted (o la entidad que
          representa) y Árbol Áureo, operador de Rocco CRM. Léalos detenidamente antes de acceder
          o usar la plataforma.
        </p>
        <div class="mt-6 flex flex-wrap gap-4 text-sm text-gray-500">
          <span class="flex items-center gap-1.5">
            <svg class="w-4 h-4 text-green-500" fill="currentColor" viewBox="0 0 20 20">
              <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" />
            </svg>
            Última actualización: {{ lastUpdated }}
          </span>
          <span class="flex items-center gap-1.5">
            <svg class="w-4 h-4 text-green-500" fill="currentColor" viewBox="0 0 20 20">
              <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" />
            </svg>
            Versión 1.0
          </span>
        </div>
      </div>
    </div>

    <div class="max-w-4xl mx-auto px-6 py-8">
      <!-- Índice -->
      <div class="bg-indigo-50 border border-indigo-100 rounded-xl p-6 mb-10">
        <h2 class="text-sm font-semibold text-indigo-800 uppercase tracking-wide mb-4">Contenido</h2>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
          <a v-for="s in toc" :key="s.id" :href="`#${s.id}`"
            class="flex items-center gap-2 text-indigo-700 hover:text-indigo-900 hover:underline py-1">
            <span class="text-indigo-400 font-mono text-xs w-6 shrink-0">{{ s.num }}</span>
            {{ s.title }}
          </a>
        </div>
      </div>

      <!-- 1. ACEPTACIÓN -->
      <section id="aceptacion" class="mb-12">
        <SectionHeader num="1" title="Aceptación de los términos" />
        <div class="prose-content">
          <p>
            Al crear una cuenta, acceder o usar Rocco CRM («la Plataforma»), usted («el Cliente»
            o «el Usuario») declara haber leído, comprendido y aceptado íntegramente estos
            Términos y Condiciones («los Términos»), así como nuestra
            <router-link to="/privacy">Política de Privacidad y Seguridad</router-link>,
            que se incorpora a este acuerdo por referencia.
          </p>
          <p>
            Si actúa en nombre de una empresa u organización, declara tener la autoridad legal
            para vincular a dicha entidad con estos Términos. En ese caso, «el Cliente» hace
            referencia a esa entidad.
          </p>
          <InfoBox type="warning" title="Si no está de acuerdo">
            Si no acepta alguno de estos Términos, no está autorizado a usar la Plataforma.
            Deberá cesar el uso inmediatamente y, si corresponde, cancelar su suscripción.
          </InfoBox>
          <p>
            El uso continuado de la Plataforma tras la publicación de una versión actualizada
            de los Términos constituye aceptación de los cambios.
          </p>
        </div>
      </section>

      <!-- 2. DESCRIPCIÓN DEL SERVICIO -->
      <section id="servicio" class="mb-12">
        <SectionHeader num="2" title="Descripción del servicio" />
        <div class="prose-content">
          <p>
            Rocco CRM es una plataforma SaaS de gestión de relaciones con clientes operada por
            <strong>Árbol Áureo</strong>. El servicio incluye, entre otras funcionalidades:
          </p>
          <ul>
            <li>Gestión de contactos, prospectos y pipeline de ventas.</li>
            <li>Inbox unificado de conversaciones multicanal: WhatsApp Business, Instagram Direct y Facebook Messenger.</li>
            <li>Calendario de citas con página de reserva pública y sincronización con Google Calendar.</li>
            <li>Motor de automatizaciones: secuencias de mensajes, notificaciones internas y recordatorios de citas.</li>
            <li>Gestión de tareas y actividades del equipo.</li>
            <li>Paneles de analítica y reportes.</li>
            <li>Configuración multi-usuario con roles y permisos.</li>
            <li>Acceso a la API y webhooks para integraciones personalizadas (según el plan).</li>
          </ul>
          <p>
            La Plataforma se presta como servicio en la nube («as-is» en su versión disponible
            en cada momento). Árbol Áureo se reserva el derecho de añadir, modificar o
            descontinuar funcionalidades con previo aviso razonable.
          </p>
          <InfoBox type="info" title="Acceso a través de terceros">
            Algunas funciones requieren cuentas activas en servicios de terceros (Meta Business
            Suite, WhatsApp Business API, Google). El Cliente es responsable de cumplir con los
            términos de dichos servicios.
          </InfoBox>
        </div>
      </section>

      <!-- 3. REGISTRO Y CUENTAS -->
      <section id="cuentas" class="mb-12">
        <SectionHeader num="3" title="Registro, cuentas y acceso" />
        <div class="prose-content">
          <h3>3.1 Elegibilidad</h3>
          <p>
            Para registrarse en Rocco CRM el Cliente debe:
          </p>
          <ul>
            <li>Ser mayor de 18 años o tener la mayoría de edad legal en su jurisdicción.</li>
            <li>Ser una persona natural con capacidad jurídica plena, o actuar en representación de una entidad legalmente constituida.</li>
            <li>No estar prohibido de usar el servicio por la ley aplicable.</li>
          </ul>

          <h3>3.2 Veracidad de la información</h3>
          <p>
            El Cliente se compromete a proporcionar información veraz, completa y actualizada
            durante el registro y a mantenerla así durante toda la relación contractual.
            Árbol Áureo no asume responsabilidad por daños derivados de información falsa
            o desactualizada proporcionada por el Cliente.
          </p>

          <h3>3.3 Seguridad de las credenciales</h3>
          <p>
            El Cliente es el único responsable de:
          </p>
          <ul>
            <li>Mantener la confidencialidad de sus credenciales de acceso (correo y contraseña).</li>
            <li>Todas las actividades que ocurran bajo su cuenta, sean o no autorizadas.</li>
            <li>Notificar a Árbol Áureo inmediatamente ante cualquier uso no autorizado o brecha de seguridad a través de <a href="mailto:rodrigoalfonzo97@gmail.com">rodrigoalfonzo97@gmail.com</a>.</li>
          </ul>
          <p>
            Árbol Áureo no será responsable por pérdidas derivadas del uso no autorizado de
            la cuenta del Cliente cuando este no haya tomado medidas razonables de seguridad
            o no haya notificado la brecha de forma oportuna.
          </p>

          <h3>3.4 Acceso de usuarios adicionales</h3>
          <p>
            El Cliente puede invitar a miembros de su equipo («Usuarios») a acceder a la
            Plataforma. El Cliente garantiza que todos sus Usuarios conocen y aceptan estos
            Términos, y es responsable de su cumplimiento. El número de Usuarios permitidos
            depende del plan contratado.
          </p>
        </div>
      </section>

      <!-- 4. PLANES Y FACTURACIÓN -->
      <section id="facturacion" class="mb-12">
        <SectionHeader num="4" title="Planes, precios y facturación" />
        <div class="prose-content">
          <h3>4.1 Planes disponibles</h3>
          <p>
            Rocco CRM ofrece distintos planes de suscripción con diferente alcance de
            funcionalidades, número de usuarios, contactos y automatizaciones. Los detalles
            actualizados de cada plan están disponibles en la página de precios de la Plataforma.
          </p>

          <h3>4.2 Período de prueba gratuita</h3>
          <p>
            Árbol Áureo puede ofrecer un período de prueba gratuita («trial») de duración
            determinada. Al finalizar el trial, el servicio se suspenderá automáticamente
            a menos que el Cliente active una suscripción de pago. No se requiere tarjeta de
            crédito para iniciar un trial, salvo indicación contraria.
          </p>

          <h3>4.3 Ciclo de facturación</h3>
          <ul>
            <li>Las suscripciones se facturan por anticipado, de forma mensual o anual según el plan elegido.</li>
            <li>El primer cargo se realiza al activar la suscripción o al finalizar el período de trial.</li>
            <li>Las renovaciones son automáticas al inicio de cada período, salvo cancelación previa conforme a la Sección 4.6.</li>
          </ul>

          <h3>4.4 Cambios de plan</h3>
          <ul>
            <li><strong>Upgrade:</strong> el cambio a un plan superior tiene efecto inmediato. Se cobra la diferencia prorrateada por el tiempo restante del período en curso.</li>
            <li><strong>Downgrade:</strong> el cambio a un plan inferior tiene efecto al inicio del siguiente período de facturación. No genera crédito retroactivo.</li>
          </ul>

          <h3>4.5 Impuestos</h3>
          <p>
            Los precios indicados no incluyen impuestos, tasas ni gravámenes aplicables
            (IVA, IGIC, sales tax, etc.). El Cliente es responsable del pago de todos los
            impuestos aplicables en su jurisdicción. Árbol Áureo añadirá los impuestos
            correspondientes cuando sea legalmente requerido.
          </p>

          <h3>4.6 Cancelación</h3>
          <p>
            El Cliente puede cancelar su suscripción en cualquier momento desde el panel de
            configuración de su cuenta o contactando a
            <a href="mailto:rodrigoalfonzo97@gmail.com">rodrigoalfonzo97@gmail.com</a>.
            La cancelación tiene efecto al final del período de facturación en curso.
            El acceso a la Plataforma se mantiene activo hasta esa fecha.
          </p>

          <h3>4.7 Política de reembolso</h3>
          <p>
            Las suscripciones son <strong>no reembolsables</strong> salvo en los siguientes casos:
          </p>
          <ul>
            <li>El servicio haya estado no disponible (downtime) durante más del 5% del período facturado por causas atribuibles a Árbol Áureo (no incluye mantenimientos programados ni causas de fuerza mayor).</li>
            <li>El Cliente haya sido cobrado erróneamente por un error técnico documentado.</li>
            <li>La legislación aplicable en la jurisdicción del Cliente exija expresamente el reembolso.</li>
          </ul>
          <p>
            Las solicitudes de reembolso deben presentarse dentro de los <strong>30 días
            naturales</strong> siguientes al cargo en cuestión.
          </p>

          <h3>4.8 Impago</h3>
          <p>
            En caso de impago, Árbol Áureo se reserva el derecho de suspender el acceso a la
            Plataforma con un aviso previo de <strong>7 días</strong>. Si el pago no se regulariza
            en un plazo adicional de 14 días, la cuenta podrá ser cancelada definitivamente y los
            datos eliminados conforme a la Política de Privacidad.
          </p>
        </div>
      </section>

      <!-- 5. USO ACEPTABLE -->
      <section id="uso-aceptable" class="mb-12">
        <SectionHeader num="5" title="Uso aceptable y conducta prohibida" />
        <div class="prose-content">
          <h3>5.1 Usos permitidos</h3>
          <p>
            El Cliente puede usar Rocco CRM exclusivamente para fines comerciales lícitos
            propios de un sistema de gestión de relaciones con clientes: comunicación con
            prospectos y clientes, gestión de ventas, agendamiento de citas, automatización
            de seguimiento comercial y actividades relacionadas.
          </p>

          <h3>5.2 Conductas prohibidas</h3>
          <p>Queda expresamente prohibido:</p>
          <ul>
            <li><strong>Spam y comunicaciones no solicitadas:</strong> enviar mensajes masivos a destinatarios que no hayan dado su consentimiento explícito conforme a la legislación vigente (CAN-SPAM, CASL, GDPR, etc.).</li>
            <li><strong>Actividades ilegales:</strong> usar la Plataforma para cometer fraude, phishing, suplantación de identidad, blanqueo de capitales, venta de sustancias ilegales u cualquier otra actividad contraria a la ley.</li>
            <li><strong>Violación de derechos de terceros:</strong> infringir derechos de propiedad intelectual, privacidad o cualquier otro derecho de terceros.</li>
            <li><strong>Ingeniería inversa:</strong> descompilar, desensamblar, realizar ingeniería inversa o intentar obtener el código fuente de la Plataforma.</li>
            <li><strong>Ataques al servicio:</strong> introducir malware, realizar ataques de denegación de servicio (DoS/DDoS), explotar vulnerabilidades o intentar acceder a cuentas ajenas.</li>
            <li><strong>Scraping no autorizado:</strong> extraer datos de la Plataforma mediante robots, scrapers o cualquier método automatizado no autorizado por Árbol Áureo.</li>
            <li><strong>Reventa no autorizada:</strong> revender, sublicenciar o proporcionar acceso a la Plataforma a terceros sin un acuerdo de reventa expreso con Árbol Áureo.</li>
            <li><strong>Elusión de límites:</strong> eludir los límites técnicos del plan contratado (contactos, usuarios, automatizaciones, etc.).</li>
            <li><strong>Datos falsos o dañinos:</strong> introducir datos falsos, contenido difamatorio, pornográfico, violento o cualquier contenido que viole derechos de terceros o la ley aplicable.</li>
            <li><strong>Uso en beneficio de competidores:</strong> usar la Plataforma para desarrollar, mejorar o comercializar un producto competidor de Rocco CRM.</li>
          </ul>

          <h3>5.3 Cumplimiento de políticas de terceros</h3>
          <p>
            Al usar las integraciones de mensajería, el Cliente se compromete a cumplir con:
          </p>
          <ul>
            <li>Las <a href="https://www.whatsapp.com/legal/business-policy" target="_blank" rel="noopener noreferrer">Políticas de WhatsApp Business</a> y las condiciones de uso de la API de WhatsApp Business.</li>
            <li>Las <a href="https://developers.facebook.com/policy/" target="_blank" rel="noopener noreferrer">Políticas de la Plataforma de Meta</a> para el uso de Instagram Graph API y Messenger Platform.</li>
            <li>Las <a href="https://developers.google.com/terms" target="_blank" rel="noopener noreferrer">Políticas de la API de Google</a> para el uso de Google Calendar.</li>
          </ul>
          <p>
            El incumplimiento de estas políticas puede resultar en la suspensión de las integraciones
            por parte de dichos proveedores, sin que Árbol Áureo tenga responsabilidad al respecto.
          </p>

          <InfoBox type="warning" title="Consecuencias del incumplimiento">
            La violación de esta sección puede resultar en la suspensión o cancelación inmediata
            de la cuenta, sin derecho a reembolso y sin perjuicio de las acciones legales
            que correspondan.
          </InfoBox>
        </div>
      </section>

      <!-- 6. PROPIEDAD INTELECTUAL -->
      <section id="propiedad-intelectual" class="mb-12">
        <SectionHeader num="6" title="Propiedad intelectual" />
        <div class="prose-content">
          <h3>6.1 Propiedad de Árbol Áureo</h3>
          <p>
            Rocco CRM, incluyendo su código fuente, diseño, interfaz, algoritmos, bases de datos,
            documentación, marcas comerciales, logotipos y cualquier otro elemento de la Plataforma,
            son propiedad exclusiva de Árbol Áureo o de sus licenciantes, y están protegidos por
            las leyes de propiedad intelectual aplicables.
          </p>
          <p>
            Estos Términos no otorgan al Cliente ningún derecho de propiedad sobre la Plataforma.
            Solo se concede una licencia de uso limitada, no exclusiva, no transferible y revocable,
            en los términos descritos en estos Términos.
          </p>

          <h3>6.2 Licencia de uso</h3>
          <p>
            Sujeto al cumplimiento de estos Términos y al pago de las tarifas aplicables,
            Árbol Áureo concede al Cliente una licencia no exclusiva para:
          </p>
          <ul>
            <li>Acceder y usar la Plataforma para los fines comerciales lícitos del Cliente.</li>
            <li>Permitir a los Usuarios autorizados acceder a la Plataforma en nombre del Cliente.</li>
          </ul>

          <h3>6.3 Contenido del Cliente</h3>
          <p>
            El Cliente conserva todos los derechos de propiedad intelectual sobre los datos,
            contenidos e información que introduzca en la Plataforma («Contenido del Cliente»).
            El Cliente concede a Árbol Áureo una licencia limitada, no exclusiva y libre de
            regalías para usar el Contenido del Cliente exclusivamente en la medida necesaria
            para prestar el servicio.
          </p>
          <p>
            Árbol Áureo no reivindica propiedad alguna sobre el Contenido del Cliente y no lo
            usará para fines distintos a la prestación del servicio contratado.
          </p>

          <h3>6.4 Retroalimentación</h3>
          <p>
            Si el Cliente proporciona sugerencias, ideas o comentarios sobre la Plataforma
            («Retroalimentación»), Árbol Áureo puede usarlos libremente para mejorar el
            servicio sin obligación de compensación al Cliente.
          </p>

          <h3>6.5 Marcas y nombres comerciales</h3>
          <p>
            El Cliente no puede usar las marcas, logotipos o nombres comerciales de Árbol Áureo
            o de Rocco CRM sin autorización escrita previa, salvo para referirse de manera
            descriptiva y veraz al uso del servicio.
          </p>
        </div>
      </section>

      <!-- 7. CONFIDENCIALIDAD -->
      <section id="confidencialidad" class="mb-12">
        <SectionHeader num="7" title="Confidencialidad" />
        <div class="prose-content">
          <p>
            Cada parte puede tener acceso a información confidencial de la otra durante la
            relación contractual («Información Confidencial»), incluyendo datos técnicos,
            comerciales, financieros, estratégicos o de cualquier otra naturaleza, identificada
            como confidencial o que razonablemente deba entenderse como tal.
          </p>
          <p>
            Cada parte se compromete a:
          </p>
          <ul>
            <li>Mantener la Información Confidencial de la otra parte en estricta reserva.</li>
            <li>No divulgarla a terceros sin consentimiento previo por escrito.</li>
            <li>Usarla exclusivamente para los fines previstos en estos Términos.</li>
            <li>Aplicar medidas de protección equivalentes a las que usa para su propia información confidencial, pero no menos que un estándar razonable de cuidado.</li>
          </ul>
          <p>
            Estas obligaciones no aplican a información que: (i) sea o se vuelva de dominio
            público sin incumplimiento de estos Términos; (ii) fuera conocida por la parte
            receptora antes de su divulgación; (iii) sea recibida legítimamente de un tercero
            sin restricción de confidencialidad; o (iv) deba divulgarse por mandato legal o
            judicial, previa notificación a la otra parte cuando sea posible.
          </p>
        </div>
      </section>

      <!-- 8. PRIVACIDAD Y DATOS -->
      <section id="privacidad" class="mb-12">
        <SectionHeader num="8" title="Privacidad y tratamiento de datos" />
        <div class="prose-content">
          <p>
            El tratamiento de datos personales se rige por la
            <router-link to="/privacy">Política de Privacidad y Seguridad</router-link>
            de Rocco CRM, que forma parte integrante de estos Términos.
          </p>
          <p>
            El Cliente actúa como <strong>Responsable del Tratamiento</strong> de los datos
            de sus contactos finales, y Árbol Áureo actúa como <strong>Encargado del
            Tratamiento</strong>. El Cliente garantiza que cuenta con la base legal adecuada
            (consentimiento, interés legítimo u otra) para tratar los datos de sus contactos
            y para transferirlos a Árbol Áureo para la prestación del servicio.
          </p>
          <p>
            El Cliente es el único responsable de cumplir con las obligaciones de información
            y consentimiento frente a sus contactos finales conforme a la legislación de
            protección de datos aplicable (GDPR, CCPA, LOPD u otras).
          </p>
          <InfoBox type="info" title="Acuerdo de Encargado del Tratamiento (DPA)">
            Los Clientes sujetos al GDPR u otras normativas que exigen un DPA formal pueden
            solicitar uno a
            <a href="mailto:rodrigoalfonzo97@gmail.com">rodrigoalfonzo97@gmail.com</a>.
          </InfoBox>
        </div>
      </section>

      <!-- 9. DISPONIBILIDAD Y SLA -->
      <section id="disponibilidad" class="mb-12">
        <SectionHeader num="9" title="Disponibilidad del servicio (SLA)" />
        <div class="prose-content">
          <h3>9.1 Disponibilidad objetivo</h3>
          <p>
            Árbol Áureo se compromete a mantener una disponibilidad de la Plataforma del
            <strong>99% mensual</strong> («uptime»), excluyendo:
          </p>
          <ul>
            <li>Ventanas de mantenimiento programado (notificadas con al menos 24 horas de antelación).</li>
            <li>Interrupciones causadas por terceros (proveedores de infraestructura, Meta, Google, operadores de red).</li>
            <li>Casos de fuerza mayor (desastres naturales, conflictos armados, pandemias, etc.).</li>
            <li>Interrupciones causadas por el propio Cliente (uso indebido, sobrecarga deliberada, etc.).</li>
          </ul>

          <h3>9.2 Mantenimientos programados</h3>
          <p>
            Los mantenimientos que impliquen interrupción del servicio se realizarán
            preferentemente en horarios de bajo tráfico y serán notificados con antelación
            suficiente por correo electrónico y/o aviso en la propia Plataforma.
          </p>

          <h3>9.3 Créditos por indisponibilidad</h3>
          <p>
            Si la disponibilidad mensual cae por debajo del 99% por causas atribuibles a
            Árbol Áureo, el Cliente podrá solicitar un crédito sobre la factura del período
            afectado según la siguiente escala:
          </p>
          <div class="overflow-x-auto">
            <table class="legal-table">
              <thead>
                <tr><th>Uptime mensual</th><th>Crédito</th></tr>
              </thead>
              <tbody>
                <tr><td>95% – 99%</td><td>10% de la cuota mensual</td></tr>
                <tr><td>90% – 95%</td><td>25% de la cuota mensual</td></tr>
                <tr><td>Menos del 90%</td><td>50% de la cuota mensual</td></tr>
              </tbody>
            </table>
          </div>
          <p class="mt-4">
            Los créditos son el único remedio disponible por indisponibilidad del servicio
            y no son canjeables por dinero en efectivo. Las solicitudes deben presentarse
            dentro de los 30 días siguientes al incidente.
          </p>
        </div>
      </section>

      <!-- 10. GARANTÍAS Y LIMITACIÓN DE RESPONSABILIDAD -->
      <section id="responsabilidad" class="mb-12">
        <SectionHeader num="10" title="Garantías y limitación de responsabilidad" />
        <div class="prose-content">
          <h3>10.1 Exclusión de garantías</h3>
          <p>
            LA PLATAFORMA SE PROPORCIONA «TAL CUAL» («AS IS») Y «SEGÚN DISPONIBILIDAD»
            («AS AVAILABLE»). EN LA MÁXIMA MEDIDA PERMITIDA POR LA LEY APLICABLE, ÁRBOL ÁUREO
            EXCLUYE EXPRESAMENTE TODA GARANTÍA, EXPRESA O IMPLÍCITA, INCLUYENDO GARANTÍAS DE
            COMERCIABILIDAD, IDONEIDAD PARA UN PROPÓSITO PARTICULAR, NO INFRACCIÓN, Y
            DISPONIBILIDAD ININTERRUMPIDA O SIN ERRORES.
          </p>
          <p>
            Árbol Áureo no garantiza que la Plataforma satisfaga todos los requisitos
            específicos del Cliente, ni que los resultados obtenidos mediante su uso sean
            precisos, completos o fiables.
          </p>

          <h3>10.2 Limitación de responsabilidad</h3>
          <p>
            EN NINGÚN CASO ÁRBOL ÁUREO, SUS DIRECTIVOS, EMPLEADOS, AGENTES O SOCIOS SERÁN
            RESPONSABLES ANTE EL CLIENTE POR:
          </p>
          <ul>
            <li>Daños indirectos, incidentales, especiales, consecuentes o punitivos.</li>
            <li>Pérdida de beneficios, ingresos, datos, oportunidades de negocio o buena voluntad comercial («goodwill»).</li>
            <li>Interrupciones del negocio del Cliente.</li>
          </ul>
          <p>
            Aun cuando Árbol Áureo haya sido advertido de la posibilidad de tales daños.
          </p>
          <p>
            LA RESPONSABILIDAD TOTAL ACUMULADA DE ÁRBOL ÁUREO FRENTE AL CLIENTE, POR CUALQUIER
            CAUSA Y BAJO CUALQUIER TEORÍA LEGAL, NO EXCEDERÁ EL IMPORTE TOTAL PAGADO POR EL
            CLIENTE EN LOS <strong>12 MESES ANTERIORES</strong> AL EVENTO QUE DIO LUGAR A LA
            RECLAMACIÓN.
          </p>

          <h3>10.3 Excepciones</h3>
          <p>
            Las limitaciones anteriores no aplican a:
          </p>
          <ul>
            <li>Daños causados por dolo o negligencia grave de Árbol Áureo.</li>
            <li>Muerte o lesiones personales causadas por negligencia de Árbol Áureo.</li>
            <li>Fraude o tergiversación fraudulenta.</li>
            <li>Cualquier otra responsabilidad que no pueda excluirse por ley.</li>
          </ul>

          <h3>10.4 Responsabilidad del Cliente</h3>
          <p>
            El Cliente es el único responsable de:
          </p>
          <ul>
            <li>La exactitud, legalidad y calidad de los datos que introduce en la Plataforma.</li>
            <li>El cumplimiento de las leyes aplicables al uso de la Plataforma en su jurisdicción.</li>
            <li>Las comunicaciones enviadas a sus contactos a través de la Plataforma.</li>
            <li>Obtener los consentimientos necesarios de sus contactos finales.</li>
            <li>La configuración y seguridad de sus integraciones (WhatsApp, Meta, Google).</li>
          </ul>
        </div>
      </section>

      <!-- 11. INDEMNIZACIÓN -->
      <section id="indemnizacion" class="mb-12">
        <SectionHeader num="11" title="Indemnización" />
        <div class="prose-content">
          <p>
            El Cliente se compromete a defender, indemnizar y mantener indemne a Árbol Áureo,
            sus directivos, empleados, agentes y socios frente a cualquier reclamación,
            demanda, pérdida, responsabilidad, coste y gasto (incluidos honorarios razonables
            de abogados) que surjan de o estén relacionados con:
          </p>
          <ul>
            <li>El uso de la Plataforma por parte del Cliente o sus Usuarios.</li>
            <li>La violación de estos Términos por el Cliente o sus Usuarios.</li>
            <li>El Contenido del Cliente introducido en la Plataforma.</li>
            <li>La violación de derechos de terceros, incluidos derechos de privacidad o propiedad intelectual.</li>
            <li>El incumplimiento de las leyes aplicables, incluyendo normativa de protección de datos y legislación anti-spam.</li>
          </ul>
          <p>
            Árbol Áureo notificará al Cliente con prontitud cualquier reclamación de este tipo
            y cooperará razonablemente en su defensa. El Cliente no podrá llegar a acuerdos
            que impliquen admisiones de responsabilidad o cargos a Árbol Áureo sin su
            consentimiento previo por escrito.
          </p>
        </div>
      </section>

      <!-- 12. SUSPENSIÓN Y TERMINACIÓN -->
      <section id="terminacion" class="mb-12">
        <SectionHeader num="12" title="Suspensión y terminación del servicio" />
        <div class="prose-content">
          <h3>12.1 Cancelación voluntaria por el Cliente</h3>
          <p>
            El Cliente puede cancelar su suscripción en cualquier momento según lo indicado
            en la Sección 4.6. La cancelación no da derecho a reembolso del período en curso,
            salvo en los casos previstos en la Sección 4.7.
          </p>

          <h3>12.2 Suspensión por Árbol Áureo</h3>
          <p>
            Árbol Áureo puede suspender el acceso del Cliente a la Plataforma, con o sin
            previo aviso, en los siguientes supuestos:
          </p>
          <ul>
            <li>Incumplimiento de los Términos, especialmente la Sección 5 (uso aceptable).</li>
            <li>Impago de cuotas tras el período de gracia establecido en la Sección 4.8.</li>
            <li>Actividad que pueda causar daño a la Plataforma, a otros usuarios o a terceros.</li>
            <li>Requerimiento de autoridad competente o resolución judicial.</li>
            <li>Incumplimiento grave de las políticas de terceros (Meta, Google, etc.) que ponga en riesgo las integraciones de la Plataforma.</li>
          </ul>
          <p>
            En caso de suspensión por incumplimiento subsanable, Árbol Áureo comunicará al
            Cliente la causa y le otorgará un plazo razonable para corregirla.
          </p>

          <h3>12.3 Terminación por Árbol Áureo</h3>
          <p>
            Árbol Áureo puede terminar la relación contractual con el Cliente mediante aviso
            por escrito con <strong>30 días de antelación</strong> por cualquier causa, o de
            forma inmediata en caso de incumplimiento grave, actividad fraudulenta o ilegal,
            o riesgo significativo para la plataforma o sus usuarios.
          </p>

          <h3>12.4 Efectos de la terminación</h3>
          <p>Tras la terminación o cancelación de la cuenta:</p>
          <ul>
            <li>El acceso del Cliente a la Plataforma cesará en la fecha efectiva.</li>
            <li>El Cliente tendrá un plazo de <strong>30 días</strong> para exportar sus datos.</li>
            <li>Transcurrido ese plazo, los datos serán eliminados conforme a la Política de Privacidad.</li>
            <li>Las obligaciones de pago pendientes seguirán siendo exigibles.</li>
            <li>Las cláusulas de confidencialidad, propiedad intelectual, indemnización y limitación de responsabilidad sobrevivirán a la terminación.</li>
          </ul>

          <h3>12.5 Discontinuación del servicio</h3>
          <p>
            Si Árbol Áureo decide discontinuar la Plataforma en su totalidad, notificará a los
            Clientes con al menos <strong>90 días de antelación</strong> y reembolsará la parte
            proporcional de las cuotas prepagadas correspondientes al período no prestado.
          </p>
        </div>
      </section>

      <!-- 13. CAMBIOS EN LOS TÉRMINOS -->
      <section id="cambios" class="mb-12">
        <SectionHeader num="13" title="Modificaciones a estos Términos" />
        <div class="prose-content">
          <p>
            Árbol Áureo puede modificar estos Términos en cualquier momento. Ante cambios
            materiales (aquellos que afecten significativamente los derechos u obligaciones
            del Cliente), se aplicará el siguiente procedimiento:
          </p>
          <ul>
            <li>Notificación por correo electrónico al administrador de la cuenta con al menos <strong>30 días de antelación</strong>.</li>
            <li>Aviso destacado en la Plataforma durante el período de preaviso.</li>
            <li>Publicación de la nueva versión en esta página con la fecha de entrada en vigor.</li>
          </ul>
          <p>
            Si el Cliente no acepta los cambios, puede cancelar su suscripción antes de la
            fecha de entrada en vigor sin penalización adicional y con reembolso proporcional
            del período prepagado no consumido.
          </p>
          <p>
            El uso continuado de la Plataforma tras la entrada en vigor de los cambios
            constituye aceptación de los Términos modificados.
          </p>
        </div>
      </section>

      <!-- 14. LEY APLICABLE -->
      <section id="ley-aplicable" class="mb-12">
        <SectionHeader num="14" title="Ley aplicable y resolución de disputas" />
        <div class="prose-content">
          <h3>14.1 Ley aplicable</h3>
          <p>
            Estos Términos se rigen e interpretan de acuerdo con las leyes del
            <strong>Estado de Florida, Estados Unidos de América</strong>, sin perjuicio
            de los derechos irrenunciables que puedan corresponder al Cliente bajo la
            legislación de su lugar de residencia o establecimiento.
          </p>

          <h3>14.2 Resolución amistosa</h3>
          <p>
            Ante cualquier disputa, controversia o reclamación derivada de estos Términos o
            del uso de la Plataforma, las partes se comprometen a intentar resolverla
            amistosamente mediante negociación directa durante un período de
            <strong>30 días</strong> desde la notificación de la disputa.
          </p>

          <h3>14.3 Arbitraje</h3>
          <p>
            Si la disputa no se resuelve amistosamente, las partes acuerdan someterla a
            arbitraje vinculante administrado por la <strong>American Arbitration Association
            (AAA)</strong> bajo sus Reglas Comerciales vigentes en ese momento, con sede
            en Orlando, Florida. El laudo arbitral será definitivo y vinculante, y podrá
            ejecutarse en cualquier tribunal con jurisdicción competente.
          </p>
          <p>
            Cada parte asumirá sus propios costes de representación legal. Los costes del
            arbitraje se distribuirán según decida el árbitro.
          </p>

          <h3>14.4 Renuncia a demandas colectivas</h3>
          <p>
            EN LA MÁXIMA MEDIDA PERMITIDA POR LA LEY, EL CLIENTE RENUNCIA A PARTICIPAR EN
            DEMANDAS COLECTIVAS («CLASS ACTIONS») O ARBITRAJES COLECTIVOS CONTRA ÁRBOL ÁUREO.
            TODAS LAS RECLAMACIONES DEBEN PRESENTARSE DE FORMA INDIVIDUAL.
          </p>

          <h3>14.5 Excepciones</h3>
          <p>
            Sin perjuicio de lo anterior, cualquiera de las partes puede solicitar medidas
            cautelares de urgencia ante un tribunal competente para proteger derechos de
            propiedad intelectual o información confidencial sin que ello constituya renuncia
            al arbitraje.
          </p>
        </div>
      </section>

      <!-- 15. DISPOSICIONES GENERALES -->
      <section id="general" class="mb-12">
        <SectionHeader num="15" title="Disposiciones generales" />
        <div class="prose-content">
          <h3>15.1 Acuerdo completo</h3>
          <p>
            Estos Términos, junto con la Política de Privacidad y cualquier acuerdo adicional
            suscrito por escrito entre las partes, constituyen el acuerdo completo entre el
            Cliente y Árbol Áureo en relación con el objeto aquí tratado, y reemplazan todos
            los acuerdos, representaciones y entendimientos anteriores, ya sean escritos u orales.
          </p>

          <h3>15.2 Nulidad parcial</h3>
          <p>
            Si alguna disposición de estos Términos fuera declarada inválida, ilegal o
            inaplicable por un tribunal o árbitro competente, dicha disposición se modificará
            en la medida mínima necesaria para hacerla válida y aplicable. El resto de los
            Términos permanecerá en plena vigencia y efecto.
          </p>

          <h3>15.3 No renuncia</h3>
          <p>
            El hecho de que Árbol Áureo no ejerza o retrase el ejercicio de cualquier derecho
            o disposición de estos Términos no constituirá una renuncia a dicho derecho o
            disposición, salvo renuncia expresa por escrito.
          </p>

          <h3>15.4 Cesión</h3>
          <p>
            El Cliente no puede ceder, transferir ni sublicenciar ninguno de sus derechos u
            obligaciones bajo estos Términos sin el consentimiento previo y por escrito de
            Árbol Áureo. Árbol Áureo puede ceder sus derechos u obligaciones a un sucesor
            en caso de fusión, adquisición o venta de activos relevantes, notificando al
            Cliente con razonable antelación.
          </p>

          <h3>15.5 Fuerza mayor</h3>
          <p>
            Ninguna de las partes será responsable de demoras o incumplimientos causados por
            circunstancias fuera de su control razonable, incluyendo desastres naturales,
            pandemias, conflictos armados, huelgas, fallos de infraestructura de terceros,
            apagones de internet a gran escala o actos gubernamentales. La parte afectada
            notificará a la otra con la mayor celeridad posible y adoptará medidas razonables
            para mitigar el impacto.
          </p>

          <h3>15.6 Independencia de las partes</h3>
          <p>
            La relación entre las partes es la de contratantes independientes. Nada en estos
            Términos crea una asociación, empresa conjunta («joint venture»), relación laboral
            ni agencia entre las partes.
          </p>

          <h3>15.7 Comunicaciones</h3>
          <p>
            Las notificaciones legales dirigidas a Árbol Áureo deben enviarse a
            <a href="mailto:rodrigoalfonzo97@gmail.com">rodrigoalfonzo97@gmail.com</a> con el
            asunto «Notificación legal — Rocco CRM». Las notificaciones al Cliente se enviarán
            al correo electrónico registrado en la cuenta.
          </p>

          <h3>15.8 Idioma</h3>
          <p>
            Estos Términos están redactados en español. En caso de traducciones a otros idiomas,
            la versión en español prevalecerá ante cualquier inconsistencia.
          </p>
        </div>
      </section>

      <!-- 16. CONTACTO -->
      <section id="contacto" class="mb-12">
        <SectionHeader num="16" title="Contacto" />
        <div class="prose-content">
          <p>
            Para cualquier consulta sobre estos Términos, comuníquese con nosotros:
          </p>
          <div class="mt-4 border border-gray-200 rounded-lg p-5 inline-block text-sm">
            <p class="font-semibold text-gray-800 mb-1">Árbol Áureo — Rocco CRM</p>
            <p class="text-gray-600">
              <a href="mailto:rodrigoalfonzo97@gmail.com" class="text-indigo-600 hover:underline">
                rodrigoalfonzo97@gmail.com
              </a>
            </p>
          </div>
          <p class="mt-4 text-sm text-gray-500">
            También puede consultar nuestra
            <router-link to="/privacy" class="text-indigo-600 hover:underline">
              Política de Privacidad y Seguridad
            </router-link>
            para información sobre el tratamiento de datos personales.
          </p>
        </div>
      </section>

      <!-- Footer -->
      <div class="border-t border-gray-200 pt-8 pb-16 text-center text-sm text-gray-400">
        <p>© {{ currentYear }} Árbol Áureo — Rocco CRM. Todos los derechos reservados.</p>
        <p class="mt-1">
          Vigente desde {{ lastUpdated }} · Versión 1.0 ·
          <router-link to="/privacy" class="text-indigo-500 hover:underline">Política de Privacidad</router-link>
          ·
          <router-link to="/login" class="text-indigo-500 hover:underline">Acceder al CRM</router-link>
        </p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
const lastUpdated = 'Septiembre 2026';
const currentYear = new Date().getFullYear();

const toc = [
  { num: '01', id: 'aceptacion',            title: 'Aceptación de los términos' },
  { num: '02', id: 'servicio',              title: 'Descripción del servicio' },
  { num: '03', id: 'cuentas',              title: 'Registro y cuentas' },
  { num: '04', id: 'facturacion',          title: 'Planes y facturación' },
  { num: '05', id: 'uso-aceptable',        title: 'Uso aceptable' },
  { num: '06', id: 'propiedad-intelectual', title: 'Propiedad intelectual' },
  { num: '07', id: 'confidencialidad',     title: 'Confidencialidad' },
  { num: '08', id: 'privacidad',           title: 'Privacidad y datos' },
  { num: '09', id: 'disponibilidad',       title: 'Disponibilidad (SLA)' },
  { num: '10', id: 'responsabilidad',      title: 'Garantías y responsabilidad' },
  { num: '11', id: 'indemnizacion',        title: 'Indemnización' },
  { num: '12', id: 'terminacion',          title: 'Suspensión y terminación' },
  { num: '13', id: 'cambios',              title: 'Modificaciones' },
  { num: '14', id: 'ley-aplicable',        title: 'Ley aplicable y disputas' },
  { num: '15', id: 'general',              title: 'Disposiciones generales' },
  { num: '16', id: 'contacto',             title: 'Contacto' },
];
</script>

<script lang="ts">
import { defineComponent, h } from 'vue';

export const SectionHeader = defineComponent({
  props: { num: String, title: String },
  setup(props) {
    return () => h('div', { class: 'flex items-center gap-3 mb-6' }, [
      h('span', { class: 'flex-shrink-0 w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 text-sm font-bold flex items-center justify-center' }, props.num),
      h('h2', { class: 'text-xl font-semibold text-gray-900' }, props.title),
    ]);
  },
});

export const InfoBox = defineComponent({
  props: { type: String, title: String },
  setup(props, { slots }) {
    const colors: Record<string, string> = {
      info:    'bg-blue-50 border-blue-200 text-blue-800',
      warning: 'bg-amber-50 border-amber-200 text-amber-800',
      success: 'bg-green-50 border-green-200 text-green-800',
    };
    return () => h('div', { class: `rounded-lg border p-4 my-4 text-sm ${colors[props.type ?? 'info']}` }, [
      h('p', { class: 'font-semibold mb-1' }, props.title),
      h('div', {}, slots.default?.()),
    ]);
  },
});
</script>

<style scoped>
@reference "tailwindcss";

.prose-content { @apply text-gray-600 leading-relaxed; }
.prose-content h3 { @apply text-base font-semibold text-gray-800 mt-6 mb-3; }
.prose-content p { @apply mb-4; }
.prose-content ul { @apply list-disc list-outside ml-5 mb-4 space-y-1.5; }
.prose-content li { @apply text-gray-600; }
.prose-content a { @apply text-indigo-600 hover:underline; }
.legal-table { @apply w-full text-sm border-collapse; }
.legal-table th { @apply text-left bg-gray-50 text-gray-700 font-semibold px-4 py-2.5 border border-gray-200; }
.legal-table td { @apply px-4 py-2.5 border border-gray-200 text-gray-600 align-top; }
.legal-table tr:nth-child(even) td { @apply bg-gray-50; }
</style>
