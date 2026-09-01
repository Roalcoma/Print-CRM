<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { RouterLink, RouterView, useRouter, useRoute } from 'vue-router';
import { LayoutDashboard, Users, LogOut, Building2, ChevronRight } from 'lucide-vue-next';
import { useAgencyStore } from '../stores/agency';

const agency = useAgencyStore();
const router = useRouter();
const route = useRoute();

onMounted(async () => {
  await agency.init();
  if (!agency.isLoggedIn) {
    router.push('/agency/login');
  }
});

const nav = [
  { to: '/agency/dashboard', label: 'Dashboard', icon: LayoutDashboard, match: '/agency/dashboard' },
  { to: '/agency/clients',   label: 'Clientes',   icon: Users,           match: '/agency/clients' },
];

const isActive = (path: string) => route.path.startsWith(path);
const title = computed(() => (route.meta.title as string) ?? 'Agency');
const initials = computed(() => {
  const n = agency.admin?.name ?? 'A';
  return n.split(' ').map((w: string) => w[0]).slice(0, 2).join('').toUpperCase();
});

function logout() {
  agency.logout();
  router.push('/agency/login');
}
</script>

<template>
  <div class="flex h-screen bg-slate-950 text-slate-100">
    <!-- Sidebar -->
    <aside class="flex w-[220px] flex-shrink-0 flex-col bg-[#0f172a] shadow-2xl">
      <!-- Logo -->
      <div class="flex h-16 items-center gap-3 border-b border-slate-800/60 px-5">
        <div class="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 shadow-lg shadow-violet-900/50">
          <Building2 class="h-5 w-5 text-white" />
        </div>
        <div class="leading-tight">
          <p class="text-[13px] font-bold tracking-wide text-white">AGENCY</p>
          <p class="text-[10px] text-slate-500 uppercase tracking-widest">Backoffice</p>
        </div>
      </div>

      <!-- Navigation -->
      <nav class="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        <p class="mb-2 px-2 text-[10px] font-bold uppercase tracking-widest text-slate-600">Panel</p>
        <RouterLink
          v-for="item in nav"
          :key="item.to"
          :to="item.to"
          class="flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-medium transition-all duration-150"
          :class="isActive(item.match)
            ? 'bg-violet-600/20 text-violet-300 border border-violet-600/30'
            : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'"
        >
          <component :is="item.icon" class="h-4 w-4 flex-shrink-0" />
          <span>{{ item.label }}</span>
          <ChevronRight v-if="isActive(item.match)" class="ml-auto h-3 w-3 text-violet-400" />
        </RouterLink>
      </nav>

      <!-- Footer -->
      <div class="border-t border-slate-800/60 p-3">
        <div class="flex items-center gap-2.5 rounded-lg px-2 py-2">
          <div class="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 text-xs font-bold text-white shadow-sm">
            {{ initials }}
          </div>
          <div class="min-w-0 flex-1">
            <p class="truncate text-[12px] font-semibold text-slate-200 leading-tight">{{ agency.admin?.name ?? 'Admin' }}</p>
            <p class="truncate text-[10px] text-slate-500 leading-tight">{{ agency.admin?.role }}</p>
          </div>
          <button
            class="cursor-pointer rounded-md p-1.5 text-slate-500 transition-colors hover:bg-slate-800 hover:text-red-400"
            @click="logout"
            aria-label="Cerrar sesión"
          >
            <LogOut class="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>

    <!-- Main content -->
    <div class="flex flex-1 flex-col overflow-hidden bg-slate-950">
      <!-- Header -->
      <header class="flex h-16 flex-shrink-0 items-center justify-between border-b border-slate-800/60 bg-slate-900/50 px-6 backdrop-blur-sm">
        <h1 class="text-lg font-semibold text-white tracking-tight">{{ title }}</h1>
        <div class="flex items-center gap-2 text-sm text-slate-400">
          <div class="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></div>
          <span>{{ agency.admin?.email }}</span>
        </div>
      </header>

      <main class="flex-1 overflow-auto">
        <RouterView />
      </main>
    </div>
  </div>
</template>
