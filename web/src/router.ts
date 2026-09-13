import { createRouter, createWebHistory } from 'vue-router';
import { getToken } from './api';
import { getAgencyToken } from './agencyApi';
import { useAuthStore } from './stores/auth';

const routes = [
  { path: '/login', component: () => import('./views/LoginView.vue'), meta: { public: true } },
  { path: '/book/:slug', component: () => import('./views/BookingView.vue'), meta: { public: true } },

  // ─── Agency backoffice (JWT separado; layout propio) ───────────────────────
  { path: '/agency/login', component: () => import('./views/agency/AgencyLogin.vue'), meta: { public: true } },
  {
    path: '/agency',
    component: () => import('./layouts/AgencyLayout.vue'),
    children: [
      { path: '', redirect: '/agency/dashboard' },
      { path: 'dashboard', component: () => import('./views/agency/AgencyDashboard.vue'), meta: { title: 'Dashboard', agencyOnly: true } },
      { path: 'clients', component: () => import('./views/agency/AgencyClients.vue'), meta: { title: 'Cuentas CRM', agencyOnly: true } },
      { path: 'clients/:id', component: () => import('./views/agency/AgencyClientDetail.vue'), meta: { title: 'Cuenta CRM', agencyOnly: true } },
      { path: 'plans', component: () => import('./views/agency/AgencyPlans.vue'), meta: { title: 'Planes', agencyOnly: true } },
    ],
  },
  {
    path: '/',
    component: () => import('./layouts/AppLayout.vue'),
    children: [
      { path: '', redirect: '/dashboard' },
      { path: 'dashboard', component: () => import('./views/DashboardView.vue'), meta: { title: 'Dashboard' } },
      { path: 'contacts', component: () => import('./views/ContactsView.vue'), meta: { title: 'Contactos', module: 'contacts' } },
      { path: 'contacts/:id', component: () => import('./views/ContactDetailView.vue'), meta: { title: 'Contacto', module: 'contacts' } },
      { path: 'opportunities', component: () => import('./views/OpportunitiesView.vue'), meta: { title: 'Oportunidades', module: 'opportunities' } },
      { path: 'pipelines', component: () => import('./views/PipelinesView.vue'), meta: { title: 'Oportunidades', module: 'opportunities' } },
      { path: 'tasks', component: () => import('./views/TasksView.vue'), meta: { title: 'Tareas', module: 'tasks' } },
      { path: 'calendar', component: () => import('./views/CalendarView.vue'), meta: { title: 'Calendario' } },
      { path: 'conversations', component: () => import('./views/ConversationsView.vue'), meta: { title: 'Conversaciones' } },
      { path: 'automations', component: () => import('./views/AutomationsView.vue'), meta: { title: 'Automatizaciones' } },
      { path: 'settings/calendar', component: () => import('./views/settings/CalendarSettings.vue'), meta: { title: 'Configuración > Calendario' } },
      { path: 'settings/calendars', component: () => import('./views/settings/CalendarsSettings.vue'), meta: { title: 'Mis calendarios' } },
      { path: 'settings/calendars/:id', component: () => import('./views/settings/CalendarEditView.vue'), meta: { title: 'Editar calendario' } },
      {
        path: 'settings',
        component: () => import('./views/settings/SettingsLayout.vue'),
        meta: { title: 'Configuración', admin: true },
        children: [
          { path: '', redirect: '/settings/team' },
          { path: 'team', component: () => import('./views/settings/SettingsTeam.vue'), meta: { title: 'Configuración', admin: true } },
          { path: 'business', component: () => import('./views/settings/SettingsBusiness.vue'), meta: { title: 'Configuración', admin: true } },
          { path: 'theme', component: () => import('./views/settings/SettingsTheme.vue'), meta: { title: 'Configuración', admin: true } },
          { path: 'whatsapp', component: () => import('./views/settings/WhatsAppSettings.vue'), meta: { title: 'Configuración', admin: true } },
        ],
      },
    ],
  },
];

export const router = createRouter({ history: createWebHistory(), routes });

// Guard: auth + permisos por módulo/rol.
router.beforeEach(async (to) => {
  // Guard de rutas de agencia (token separado)
  if (to.meta.agencyOnly) {
    const agencyAuthed = !!getAgencyToken();
    if (!agencyAuthed) return '/agency/login';
    return; // las rutas agency no pasan por el guard de CRM
  }

  // Si es ruta de agencia login y ya está autenticado como agencia → dashboard agencia
  if (to.path === '/agency/login' && !!getAgencyToken()) return '/agency/dashboard';

  // Guard normal del CRM
  const authed = !!getToken();
  if (!to.meta.public && !authed) return '/login';
  if (to.path === '/login' && authed) return '/dashboard';
  if (!authed) return;

  const auth = useAuthStore();
  await auth.init(); // asegura user + permisos cargados
  if (to.meta.admin && !auth.isAdmin) return '/dashboard';
  if (to.meta.module && !auth.can(to.meta.module as string)) return '/dashboard';
});
