<script setup lang="ts">
// Página pública de Rocco CRM (visitantes sin sesión). Es la página de inicio que revisa Google
// para verificar la app de Google Calendar: explica qué hace Rocco y cómo usa los datos de Google.
import { MessageCircle, Calendar, KanbanSquare, Zap, ArrowRight, ShieldCheck } from 'lucide-vue-next';

const year = new Date().getFullYear();
const contact = 'rodrigoalfonzo97@gmail.com';

const features = [
  { icon: KanbanSquare, title: 'Contactos y oportunidades',
    text: 'Cada lead con su historial, etiquetas, tareas y notas, en un tablero por etapas que el equipo mueve arrastrando.' },
  { icon: MessageCircle, title: 'WhatsApp e Instagram en una bandeja',
    text: 'Las conversaciones de WhatsApp, Instagram y Messenger llegan al CRM y quedan unidas al contacto y a su oportunidad.' },
  { icon: Calendar, title: 'Citas y página de reservas',
    text: 'Tus clientes eligen horario en una página pública; la cita se crea con su enlace de Google Meet y recordatorios por WhatsApp.' },
  { icon: Zap, title: 'Automatizaciones',
    text: 'Respuestas y seguimientos automáticos: quién escribe, quién comenta, quién agenda, sin tareas manuales repetidas.' },
];
</script>

<template>
  <div class="home">
    <header class="top">
      <div class="wrap top-inner">
        <router-link to="/inicio" class="logo" aria-label="Rocco CRM">
          <img src="/isotipo-mark.png" alt="" class="logo-mark" />
          <span class="wordmark">rocco<span class="dot">.</span></span>
        </router-link>
        <nav class="nav">
          <router-link to="/privacy" class="nav-link">Privacidad</router-link>
          <router-link to="/terms" class="nav-link">Términos</router-link>
          <router-link to="/login" class="btn btn-small">Entrar</router-link>
        </nav>
      </div>
    </header>

    <main>
      <section class="hero">
        <div class="wrap">
          <h1>El CRM para equipos que venden por WhatsApp e Instagram.</h1>
          <p class="lead">
            Rocco CRM reúne contactos, oportunidades, conversaciones y citas en un solo lugar,
            para que ningún prospecto se quede sin respuesta. Lo desarrolla y opera
            <strong>Árbol Áureo</strong>.
          </p>
          <div class="actions">
            <router-link to="/login" class="btn">Entrar a mi cuenta <ArrowRight class="h-4 w-4" /></router-link>
            <a :href="`mailto:${contact}?subject=Acceso%20a%20Rocco%20CRM`" class="btn btn-ghost">Solicitar acceso</a>
          </div>
        </div>
      </section>

      <section class="features">
        <div class="wrap">
          <h2>Qué hace Rocco</h2>
          <ul class="feature-list">
            <li v-for="f in features" :key="f.title">
              <component :is="f.icon" class="feature-icon" />
              <div>
                <h3>{{ f.title }}</h3>
                <p>{{ f.text }}</p>
              </div>
            </li>
          </ul>
        </div>
      </section>

      <section id="google-calendar" class="google">
        <div class="wrap google-inner">
          <ShieldCheck class="google-icon" />
          <div>
            <h2>Cómo usa Rocco tu Google Calendar</h2>
            <p>
              Conectar Google Calendar es opcional y lo hace cada usuario desde su perfil. Con tu permiso, Rocco:
            </p>
            <ul>
              <li>crea en tu calendario las citas y tareas con fecha que registras en el CRM, con su enlace de Google Meet e invitación a los asistentes;</li>
              <li>te muestra tus eventos de Google dentro del calendario del CRM, para ver toda tu agenda en un solo lugar;</li>
              <li>consulta solo qué horarios tienes ocupados, para que tu página de reservas no ofrezca esas horas.</li>
            </ul>
            <p>
              No vendemos tus datos, no los usamos para publicidad y puedes desconectar Google Calendar en cualquier momento.
              Detalle completo en la <router-link to="/privacy#google" class="link">política de privacidad (sección 6.1)</router-link>.
            </p>
          </div>
        </div>
      </section>

      <section class="english" lang="en">
        <div class="wrap">
          <h2>About Rocco CRM</h2>
          <p>
            Rocco CRM is a customer relationship management platform by Árbol Áureo for sales teams that work over
            WhatsApp and Instagram: contacts and sales pipelines, a shared inbox, appointment booking and automations.
            Users can optionally connect Google Calendar so appointments and dated tasks booked in Rocco are created in
            their calendar with a Google Meet link, their calendar events are shown inside the CRM calendar, and their
            busy times are excluded from their public booking page. See our
            <router-link to="/privacy#google" class="link">Privacy Policy</router-link> for how Google user data is handled.
          </p>
        </div>
      </section>
    </main>

    <footer class="foot">
      <div class="wrap foot-inner">
        <span>© {{ year }} Árbol Áureo · Rocco CRM</span>
        <span class="foot-links">
          <router-link to="/privacy">Privacidad</router-link>
          <router-link to="/terms">Términos</router-link>
          <a :href="`mailto:${contact}`">{{ contact }}</a>
        </span>
      </div>
    </footer>
  </div>
</template>

<style scoped>
.home { min-height: 100vh; background: #F6F4F0; color: #13243D; display: flex; flex-direction: column; }
.wrap { max-width: 1040px; margin: 0 auto; padding: 0 20px; }

.top { background: #13243D; }
.top-inner { display: flex; align-items: center; justify-content: space-between; gap: 16px; min-height: 64px; }
.logo { display: flex; align-items: center; gap: 10px; }
.logo-mark { height: 32px; width: auto; }
.wordmark { font-family: var(--font-display); font-size: 1.5rem; font-weight: 800; letter-spacing: -0.03em; color: #fff; }
.dot { color: #F69008; }
.nav { display: flex; align-items: center; gap: 18px; }
.nav-link { font-size: 0.875rem; color: #cbd5e1; }
.nav-link:hover { color: #fff; }

.btn { display: inline-flex; align-items: center; gap: 8px; border-radius: 6px; background: #F69008; color: #fff;
  font-weight: 600; padding: 11px 18px; font-size: 0.95rem; transition: background .15s; }
.btn:hover { background: #dd8007; }
.btn-small { padding: 7px 14px; font-size: 0.85rem; }
.btn-ghost { background: transparent; color: #13243D; border: 1px solid #13243D33; }
.btn-ghost:hover { background: #13243D0d; }

.hero { padding: 72px 0 56px; }
.hero h1 { font-family: var(--font-display); font-size: clamp(2rem, 5vw, 3.1rem); line-height: 1.08; font-weight: 800;
  letter-spacing: -0.03em; max-width: 760px; }
.lead { margin-top: 18px; font-size: 1.1rem; line-height: 1.6; color: #334155; max-width: 640px; }
.actions { margin-top: 28px; display: flex; flex-wrap: wrap; gap: 12px; }

.features { padding: 48px 0; background: #fff; border-top: 1px solid #e7e2d9; border-bottom: 1px solid #e7e2d9; }
.features h2, .google h2, .english h2 { font-family: var(--font-display); font-size: 1.6rem; font-weight: 800; letter-spacing: -0.02em; }
.feature-list { margin-top: 24px; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 28px 40px; }
.feature-list li { display: flex; gap: 14px; }
.feature-icon { width: 22px; height: 22px; color: #F69008; flex-shrink: 0; margin-top: 3px; }
.feature-list h3 { font-weight: 700; font-size: 1.02rem; }
.feature-list p { margin-top: 4px; color: #475569; line-height: 1.55; font-size: 0.95rem; }

.google { padding: 52px 0; }
.google-inner { display: flex; gap: 18px; }
.google-icon { width: 28px; height: 28px; color: #13243D; flex-shrink: 0; margin-top: 4px; }
.google p { margin-top: 12px; line-height: 1.6; color: #334155; max-width: 760px; }
.google ul { margin-top: 10px; padding-left: 1.1rem; list-style: disc; color: #334155; line-height: 1.6; max-width: 760px; }
.google li { margin-top: 4px; }
.link { color: #b86a00; text-decoration: underline; }

.english { padding: 0 0 56px; }
.english p { margin-top: 10px; line-height: 1.6; color: #475569; max-width: 760px; font-size: 0.95rem; }

.foot { margin-top: auto; background: #13243D; color: #94a3b8; font-size: 0.85rem; }
.foot-inner { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 10px; padding-top: 18px; padding-bottom: 18px; }
.foot-links { display: flex; flex-wrap: wrap; gap: 16px; }
.foot a:hover { color: #fff; }

@media (max-width: 640px) {
  .nav-link { display: none; }
  .hero { padding: 48px 0 40px; }
  .feature-list { grid-template-columns: 1fr; }
  .google-inner { flex-direction: column; gap: 8px; }
}
</style>
