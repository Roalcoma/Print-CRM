import { createRouter, createWebHistory } from 'vue-router';
import { getToken } from './api';
import { useAuthStore } from './stores/auth';

const routes = [
  { path: '/login', component: () => import('./views/LoginView.vue'), meta: { public: true } },
  {
    path: '/',
    component: () => import('./layouts/AppLayout.vue'),
    children: [
      { path: '', redirect: '/dashboard' },
      { path: 'dashboard', component: () => import('./views/DashboardView.vue'), meta: { title: 'Dashboard' } },
      { path: 'contacts', component: () => import('./views/ContactsView.vue'), meta: { title: 'Contactos', module: 'contacts' } },
      { path: 'opportunities', component: () => import('./views/OpportunitiesView.vue'), meta: { title: 'Oportunidades', module: 'opportunities' } },
      { path: 'pipelines', component: () => import('./views/PipelinesView.vue'), meta: { title: 'Oportunidades', module: 'opportunities' } },
      {
        path: 'settings',
        component: () => import('./views/settings/SettingsLayout.vue'),
        meta: { title: 'Configuración', admin: true },
        children: [
          { path: '', redirect: '/settings/team' },
          { path: 'team', component: () => import('./views/settings/SettingsTeam.vue'), meta: { title: 'Configuración', admin: true } },
          { path: 'business', component: () => import('./views/settings/SettingsBusiness.vue'), meta: { title: 'Configuración', admin: true } },
        ],
      },
    ],
  },
];

export const router = createRouter({ history: createWebHistory(), routes });

// Guard: auth + permisos por módulo/rol.
router.beforeEach(async (to) => {
  const authed = !!getToken();
  if (!to.meta.public && !authed) return '/login';
  if (to.path === '/login' && authed) return '/dashboard';
  if (!authed) return;

  const auth = useAuthStore();
  await auth.init(); // asegura user + permisos cargados
  if (to.meta.admin && !auth.isAdmin) return '/dashboard';
  if (to.meta.module && !auth.can(to.meta.module as string)) return '/dashboard';
});
