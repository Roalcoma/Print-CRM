import { createRouter, createWebHistory } from 'vue-router';
import { getToken } from './api';

const routes = [
  { path: '/login', component: () => import('./views/LoginView.vue'), meta: { public: true } },
  {
    path: '/',
    component: () => import('./layouts/AppLayout.vue'),
    children: [
      { path: '', redirect: '/dashboard' },
      { path: 'dashboard', component: () => import('./views/DashboardView.vue'), meta: { title: 'Dashboard' } },
      { path: 'contacts', component: () => import('./views/ContactsView.vue'), meta: { title: 'Contactos' } },
      { path: 'opportunities', component: () => import('./views/OpportunitiesView.vue'), meta: { title: 'Oportunidades' } },
      { path: 'pipelines', component: () => import('./views/PipelinesView.vue'), meta: { title: 'Oportunidades' } },
    ],
  },
];

export const router = createRouter({ history: createWebHistory(), routes });

// Guard: sin token → login. Con token en /login → dashboard.
router.beforeEach((to) => {
  const authed = !!getToken();
  if (!to.meta.public && !authed) return '/login';
  if (to.path === '/login' && authed) return '/dashboard';
});
