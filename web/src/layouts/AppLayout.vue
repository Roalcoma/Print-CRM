<script setup lang="ts">
import { computed } from 'vue';
import { RouterLink, RouterView, useRouter, useRoute } from 'vue-router';
import { LayoutDashboard, Users, Kanban, LogOut, Search, Bell, Settings, ListTodo } from 'lucide-vue-next';
import { useAuthStore } from '../stores/auth';

const auth = useAuthStore();
const router = useRouter();
const route = useRoute();

const nav = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, match: ['/dashboard'], module: null as string | null },
  { to: '/contacts', label: 'Contactos', icon: Users, match: ['/contacts'], module: 'contacts' },
  { to: '/opportunities', label: 'Oportunidades', icon: Kanban, match: ['/opportunities', '/pipelines'], module: 'opportunities' },
  { to: '/tasks', label: 'Tareas', icon: ListTodo, match: ['/tasks'], module: 'tasks' },
];
const visibleNav = computed(() => nav.filter(i => !i.module || auth.can(i.module)));
const isActive = (m: string[]) => m.some(p => route.path.startsWith(p));

const title = computed(() => (route.meta.title as string) ?? 'CRM');
const initials = computed(() => {
  const n = auth.user?.name ?? 'U';
  return n.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
});

function logout() {
  auth.logout();
  router.push('/login');
}
</script>

<template>
  <div class="flex h-screen bg-slate-50 text-slate-900">
    <!-- Sidebar oscuro estilo GHL -->
    <aside class="z-10 flex w-56 flex-col bg-gradient-to-b from-slate-900 to-slate-950 text-slate-400 shadow-xl">
      <div class="flex h-16 items-center gap-2.5 px-4">
        <div class="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 text-sm font-bold text-white shadow-lg shadow-indigo-900/50">C</div>
        <span class="text-base font-semibold tracking-tight text-white">CRM</span>
      </div>

      <nav class="flex-1 px-3 py-3">
        <p class="mb-2 px-3 text-[10px] font-semibold uppercase tracking-wider text-slate-600">Menú</p>
        <div class="space-y-0.5">
          <RouterLink
            v-for="item in visibleNav"
            :key="item.to"
            :to="item.to"
            class="group relative flex items-center gap-2.5 rounded-md px-3 py-2 text-[13px] font-medium transition-all duration-200"
            :class="isActive(item.match)
              ? 'bg-indigo-600 text-white shadow-md shadow-indigo-900/40'
              : 'text-slate-400 hover:translate-x-0.5 hover:bg-slate-800 hover:text-white'"
          >
            <span v-if="isActive(item.match)" class="absolute -left-3 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-indigo-400"></span>
            <component :is="item.icon" class="h-[18px] w-[18px]" />
            {{ item.label }}
          </RouterLink>
        </div>
      </nav>

      <div class="border-t border-slate-800/70 p-3">
        <RouterLink
          v-if="auth.isAdmin"
          to="/settings"
          class="mb-1 flex items-center gap-2.5 rounded-md px-3 py-2 text-[13px] font-medium transition-all duration-200"
          :class="route.path.startsWith('/settings')
            ? 'bg-indigo-600 text-white shadow-md shadow-indigo-900/40'
            : 'text-slate-400 hover:translate-x-0.5 hover:bg-slate-800 hover:text-white'"
        >
          <Settings class="h-[18px] w-[18px]" />
          Configuración
        </RouterLink>
        <div class="flex items-center gap-2.5 rounded-lg px-2 py-1.5">
          <div class="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-xs font-semibold text-white shadow-sm">{{ initials }}</div>
          <div class="min-w-0 flex-1">
            <p class="truncate text-[13px] font-medium text-white">{{ auth.user?.name ?? 'Usuario' }}</p>
            <p class="truncate text-[11px] text-slate-500">{{ auth.user?.email }}</p>
          </div>
          <button class="cursor-pointer rounded-md p-1.5 text-slate-500 transition-colors duration-200 hover:bg-slate-800 hover:text-red-400" @click="logout" aria-label="Cerrar sesión">
            <LogOut class="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>

    <!-- Columna derecha: header + contenido -->
    <div class="flex flex-1 flex-col overflow-hidden">
      <header class="z-[5] flex h-16 flex-shrink-0 items-center justify-between border-b border-slate-200 bg-white px-6 shadow-toolbar">
        <h1 class="text-xl font-semibold tracking-tight text-slate-900">{{ title }}</h1>
        <div class="flex items-center gap-3">
          <div class="relative hidden sm:block">
            <Search class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input placeholder="Buscar…" class="w-56 rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm transition-all focus:border-primary focus:bg-white focus:shadow-sm focus:ring-2 focus:ring-primary/20 focus:outline-none" />
          </div>
          <button class="relative cursor-pointer rounded-lg border border-slate-200 p-2 text-slate-500 transition-all duration-200 hover:border-slate-300 hover:bg-slate-50 hover:text-primary hover:shadow-sm" aria-label="Notificaciones">
            <Bell class="h-5 w-5" />
            <span class="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-cta ring-2 ring-white"></span>
          </button>
          <div class="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-sm font-semibold text-white shadow-sm ring-2 ring-transparent transition-all hover:ring-indigo-200">{{ initials }}</div>
        </div>
      </header>

      <main class="flex-1 overflow-auto">
        <RouterView v-slot="{ Component }">
          <Transition name="fade" mode="out-in">
            <component :is="Component" />
          </Transition>
        </RouterView>
      </main>
    </div>
  </div>
</template>
