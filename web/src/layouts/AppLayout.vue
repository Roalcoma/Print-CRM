<script setup lang="ts">
import { computed } from 'vue';
import { RouterLink, RouterView, useRouter, useRoute } from 'vue-router';
import { LayoutDashboard, Users, Kanban, LogOut, Search, Bell } from 'lucide-vue-next';
import { useAuthStore } from '../stores/auth';

const auth = useAuthStore();
const router = useRouter();
const route = useRoute();

const nav = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, match: ['/dashboard'] },
  { to: '/contacts', label: 'Contactos', icon: Users, match: ['/contacts'] },
  { to: '/opportunities', label: 'Oportunidades', icon: Kanban, match: ['/opportunities', '/pipelines'] },
];
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
    <aside class="flex w-64 flex-col bg-slate-900 text-slate-400">
      <div class="flex h-16 items-center gap-3 px-5">
        <div class="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 font-bold text-white shadow-lg shadow-indigo-900/50">C</div>
        <span class="text-lg font-semibold tracking-tight text-white">CRM</span>
      </div>

      <nav class="flex-1 space-y-1 px-3 py-4">
        <RouterLink
          v-for="item in nav"
          :key="item.to"
          :to="item.to"
          class="group relative flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors duration-200"
          :class="isActive(item.match)
            ? 'bg-gradient-to-r from-indigo-600 to-indigo-500 text-white shadow-md shadow-indigo-900/40'
            : 'hover:bg-slate-800 hover:text-white'"
        >
          <component :is="item.icon" class="h-5 w-5" />
          {{ item.label }}
        </RouterLink>
      </nav>

      <div class="border-t border-slate-800 p-3">
        <div class="flex items-center gap-3 rounded-lg px-2 py-2">
          <div class="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-sm font-semibold text-white">{{ initials }}</div>
          <div class="min-w-0 flex-1">
            <p class="truncate text-sm font-medium text-white">{{ auth.user?.name ?? 'Usuario' }}</p>
            <p class="truncate text-xs text-slate-500">{{ auth.user?.email }}</p>
          </div>
          <button class="cursor-pointer rounded-md p-1.5 text-slate-500 transition-colors duration-200 hover:bg-slate-800 hover:text-red-400" @click="logout" aria-label="Cerrar sesión">
            <LogOut class="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>

    <!-- Columna derecha: header + contenido -->
    <div class="flex flex-1 flex-col overflow-hidden">
      <header class="flex h-16 flex-shrink-0 items-center justify-between border-b border-slate-200 bg-white px-6">
        <h1 class="text-xl font-semibold tracking-tight text-slate-900">{{ title }}</h1>
        <div class="flex items-center gap-3">
          <div class="relative hidden sm:block">
            <Search class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input placeholder="Buscar…" class="w-56 rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm transition-colors focus:border-primary focus:bg-white focus:ring-2 focus:ring-primary/20 focus:outline-none" />
          </div>
          <button class="relative cursor-pointer rounded-lg border border-slate-200 p-2 text-slate-500 transition-colors duration-200 hover:bg-slate-50 hover:text-slate-700" aria-label="Notificaciones">
            <Bell class="h-5 w-5" />
            <span class="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-cta"></span>
          </button>
          <div class="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-sm font-semibold text-white">{{ initials }}</div>
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
