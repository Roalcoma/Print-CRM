<script setup lang="ts">
// Página pública de Rocco CRM (visitantes sin sesión). Es la página de inicio que revisa Google
// para verificar la app de Google Calendar: explica qué hace Rocco y cómo usa los datos de Google.
// En español por defecto; ?lang=en la muestra completa en inglés (versión para el revisor de Google).
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { MessageCircle, Calendar, KanbanSquare, Zap, ArrowRight, ShieldCheck } from 'lucide-vue-next';

const route = useRoute();
const router = useRouter();
const year = new Date().getFullYear();
const contact = 'rodrigoalfonzo97@gmail.com';

type Lang = 'es' | 'en';
const lang = computed<Lang>(() => (route.query.lang === 'en' ? 'en' : 'es'));
function setLang(l: Lang) {
  router.replace({ query: { ...route.query, lang: l === 'en' ? 'en' : undefined } });
}

const T = {
  es: {
    privacy: 'Privacidad', terms: 'Términos', login: 'Entrar',
    title: 'El CRM para equipos que venden por WhatsApp e Instagram.',
    lead: 'Rocco CRM reúne contactos, oportunidades, conversaciones y citas en un solo lugar, para que ningún prospecto se quede sin respuesta. Lo desarrolla y opera',
    enter: 'Entrar a mi cuenta', request: 'Solicitar acceso', requestSubject: 'Acceso a Rocco CRM',
    whatTitle: 'Qué hace Rocco',
    features: [
      ['Contactos y oportunidades', 'Cada lead con su historial, etiquetas, tareas y notas, en un tablero por etapas que el equipo mueve arrastrando.'],
      ['WhatsApp e Instagram en una bandeja', 'Las conversaciones de WhatsApp, Instagram y Messenger llegan al CRM y quedan unidas al contacto y a su oportunidad.'],
      ['Citas y página de reservas', 'Tus clientes eligen horario en una página pública; la cita se crea con su enlace de Google Meet y recordatorios por WhatsApp.'],
      ['Automatizaciones', 'Respuestas y seguimientos automáticos: quién escribe, quién comenta, quién agenda, sin tareas manuales repetidas.'],
    ],
    googleTitle: 'Cómo usa Rocco tu Google Calendar',
    googleIntro: 'Conectar Google Calendar es opcional y lo hace cada usuario desde su perfil. Con tu permiso, Rocco:',
    googleItems: [
      'crea en tu calendario las citas y tareas con fecha que registras en el CRM, con su enlace de Google Meet e invitación a los asistentes;',
      'te muestra tus eventos de Google dentro del calendario del CRM, para ver toda tu agenda en un solo lugar;',
      'consulta solo qué horarios tienes ocupados, para que tu página de reservas no ofrezca esas horas.',
    ],
    googleOutro: 'No vendemos tus datos, no los usamos para publicidad y puedes desconectar Google Calendar en cualquier momento. Detalle completo en la',
    googleLink: 'política de privacidad (sección 6.1)',
  },
  en: {
    privacy: 'Privacy', terms: 'Terms', login: 'Sign in',
    title: 'The CRM for teams that sell over WhatsApp and Instagram.',
    lead: 'Rocco CRM brings contacts, deals, conversations and appointments together in one place, so no lead is left without an answer. Built and operated by',
    enter: 'Sign in to my account', request: 'Request access', requestSubject: 'Rocco CRM access',
    whatTitle: 'What Rocco does',
    features: [
      ['Contacts and deals', 'Every lead with its history, tags, tasks and notes, on a stage-based board the team updates by drag and drop.'],
      ['WhatsApp and Instagram in one inbox', 'WhatsApp, Instagram and Messenger conversations arrive in the CRM, linked to the contact and their deal.'],
      ['Appointments and booking page', 'Customers pick a time on a public page; the appointment is created with its Google Meet link and WhatsApp reminders.'],
      ['Automations', 'Automatic replies and follow-ups for who messages, who comments and who books, with no repetitive manual work.'],
    ],
    googleTitle: 'How Rocco uses your Google Calendar',
    googleIntro: 'Connecting Google Calendar is optional and each user does it from their profile. With your permission, Rocco:',
    googleItems: [
      'creates in your calendar the appointments and dated tasks you record in the CRM, with their Google Meet link and invitations to attendees;',
      'shows your Google events inside the CRM calendar, so you see your whole schedule in one place;',
      'checks only which times you are busy, so your booking page never offers those hours.',
    ],
    googleOutro: 'We do not sell your data, we do not use it for advertising, and you can disconnect Google Calendar at any time. Full details in our',
    googleLink: 'Privacy Policy (section 6.1)',
  },
} as const;

const t = computed(() => T[lang.value]);
const icons = [KanbanSquare, MessageCircle, Calendar, Zap];
</script>

<template>
  <div class="home" :lang="lang">
    <header class="top">
      <div class="wrap top-inner">
        <router-link :to="{ path: '/inicio', query: lang === 'en' ? { lang: 'en' } : {} }" class="logo" aria-label="Rocco CRM">
          <img src="/isotipo-mark.png" alt="" class="logo-mark" />
          <span class="wordmark">rocco<span class="dot">.</span></span>
        </router-link>
        <nav class="nav">
          <router-link to="/privacy" class="nav-link">{{ t.privacy }}</router-link>
          <router-link to="/terms" class="nav-link">{{ t.terms }}</router-link>
          <div class="langs" role="group" aria-label="Idioma / Language">
            <button type="button" :class="{ on: lang === 'es' }" :aria-pressed="lang === 'es'" @click="setLang('es')">ES</button>
            <button type="button" :class="{ on: lang === 'en' }" :aria-pressed="lang === 'en'" @click="setLang('en')">EN</button>
          </div>
          <router-link to="/login" class="btn btn-small">{{ t.login }}</router-link>
        </nav>
      </div>
    </header>

    <main>
      <section class="hero">
        <div class="wrap">
          <h1>{{ t.title }}</h1>
          <p class="lead">{{ t.lead }} <strong>Árbol Áureo</strong>.</p>
          <div class="actions">
            <router-link to="/login" class="btn">{{ t.enter }} <ArrowRight class="h-4 w-4" /></router-link>
            <a :href="`mailto:${contact}?subject=${encodeURIComponent(t.requestSubject)}`" class="btn btn-ghost">{{ t.request }}</a>
          </div>
        </div>
      </section>

      <section class="features">
        <div class="wrap">
          <h2>{{ t.whatTitle }}</h2>
          <ul class="feature-list">
            <li v-for="(f, i) in t.features" :key="f[0]">
              <component :is="icons[i]" class="feature-icon" />
              <div>
                <h3>{{ f[0] }}</h3>
                <p>{{ f[1] }}</p>
              </div>
            </li>
          </ul>
        </div>
      </section>

      <section id="google-calendar" class="google">
        <div class="wrap google-inner">
          <ShieldCheck class="google-icon" />
          <div>
            <h2>{{ t.googleTitle }}</h2>
            <p>{{ t.googleIntro }}</p>
            <ul>
              <li v-for="item in t.googleItems" :key="item">{{ item }}</li>
            </ul>
            <p>
              {{ t.googleOutro }}
              <router-link to="/privacy#google" class="link">{{ t.googleLink }}</router-link>.
            </p>
          </div>
        </div>
      </section>
    </main>

    <footer class="foot">
      <div class="wrap foot-inner">
        <span>© {{ year }} Árbol Áureo · Rocco CRM</span>
        <span class="foot-links">
          <router-link to="/privacy">{{ t.privacy }}</router-link>
          <router-link to="/terms">{{ t.terms }}</router-link>
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

.langs { display: flex; border: 1px solid #ffffff33; border-radius: 6px; overflow: hidden; }
.langs button { padding: 4px 9px; font-size: 0.75rem; font-weight: 700; color: #94a3b8; cursor: pointer; transition: background .15s, color .15s; }
.langs button:hover { color: #fff; }
.langs button.on { background: #ffffff1f; color: #fff; }

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
.features h2, .google h2 { font-family: var(--font-display); font-size: 1.6rem; font-weight: 800; letter-spacing: -0.02em; }
.feature-list { margin-top: 24px; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 28px 40px; }
.feature-list li { display: flex; gap: 14px; }
.feature-icon { width: 22px; height: 22px; color: #F69008; flex-shrink: 0; margin-top: 3px; }
.feature-list h3 { font-weight: 700; font-size: 1.02rem; }
.feature-list p { margin-top: 4px; color: #475569; line-height: 1.55; font-size: 0.95rem; }

.google { padding: 52px 0 64px; }
.google-inner { display: flex; gap: 18px; }
.google-icon { width: 28px; height: 28px; color: #13243D; flex-shrink: 0; margin-top: 4px; }
.google p { margin-top: 12px; line-height: 1.6; color: #334155; max-width: 760px; }
.google ul { margin-top: 10px; padding-left: 1.1rem; list-style: disc; color: #334155; line-height: 1.6; max-width: 760px; }
.google li { margin-top: 4px; }
.link { color: #b86a00; text-decoration: underline; }

.foot { margin-top: auto; background: #13243D; color: #94a3b8; font-size: 0.85rem; }
.foot-inner { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 10px; padding-top: 18px; padding-bottom: 18px; }
.foot-links { display: flex; flex-wrap: wrap; gap: 16px; }
.foot a:hover { color: #fff; }

@media (max-width: 640px) {
  .nav { gap: 10px; }
  .nav-link { display: none; }
  .hero { padding: 48px 0 40px; }
  .feature-list { grid-template-columns: 1fr; }
  .google-inner { flex-direction: column; gap: 8px; }
}
</style>
