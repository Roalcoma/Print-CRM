<script setup lang="ts">
import { computed, ref } from 'vue';
import { RouterLink, RouterView, useRouter, useRoute } from 'vue-router';
import { LayoutDashboard, Users, Kanban, LogOut, Search, Settings, ListTodo, Calendar, MessageCircle } from 'lucide-vue-next';
import { useAuthStore } from '../stores/auth';
import NotificationsDropdown from '../components/NotificationsDropdown.vue';

const auth = useAuthStore();
const router = useRouter();
const route = useRoute();

const navMain = [
  { to: '/dashboard',      label: 'Dashboard',      icon: LayoutDashboard, match: ['/dashboard'],                          module: null as string | null },
  { to: '/contacts',       label: 'Contactos',       icon: Users,           match: ['/contacts'],                           module: 'contacts' },
  { to: '/opportunities',  label: 'Oportunidades',   icon: Kanban,          match: ['/opportunities', '/pipelines'],        module: 'opportunities' },
  { to: '/tasks',          label: 'Tareas',           icon: ListTodo,        match: ['/tasks'],                              module: 'tasks' },
];
const navTools = [
  { to: '/calendar',       label: 'Calendario',      icon: Calendar,        match: ['/calendar'],                           module: null as string | null },
  { to: '/conversations',  label: 'Conversaciones',  icon: MessageCircle,   match: ['/conversations'],                      module: null as string | null },
];

const allNav = [...navMain, ...navTools];
const visibleMain  = computed(() => navMain.filter(i => !i.module || auth.can(i.module)));
const visibleTools = computed(() => navTools.filter(i => !i.module || auth.can(i.module)));

const isActive = (m: string[]) => m.some(p => route.path.startsWith(p));

const title = computed(() => (route.meta.title as string) ?? 'CRM');
const initials = computed(() => {
  const n = auth.user?.name ?? 'U';
  return n.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
});

// Breadcrumb: muestra la ruta padre si es una sub-ruta
const breadcrumb = computed(() => {
  const crumbs: { label: string; to?: string }[] = [];
  const matched = allNav.find(n => n.match.some(p => route.path.startsWith(p)));
  if (matched && route.path !== matched.to) {
    crumbs.push({ label: matched.label, to: matched.to });
    crumbs.push({ label: title.value });
  }
  return crumbs;
});

// Sidebar theme
const isDark = computed(() => ((auth.preferences.sidebarTheme as string) ?? 'dark') === 'dark');

const sidebar = computed(() => isDark.value
  ? {
      wrap:           'bg-[#111827] text-slate-400 shadow-xl',
      groupLabel:     'text-slate-600',
      activeItem:     'bg-[#F69008]/10 text-white font-semibold',
      inactiveItem:   'text-slate-400 hover:bg-[#1f2937] hover:text-white',
      accent:         'bg-[#F69008]',
      footerBorder:   'border-slate-800/70',
      settingsActive: 'bg-[#F69008]/10 text-white font-semibold',
      settingsInactive:'text-slate-400 hover:bg-[#1f2937] hover:text-white',
      logout:         'text-slate-500 hover:bg-[#1f2937] hover:text-red-400',
      userName:       'text-white',
      userEmail:      'text-slate-500',
      searchBg:       'bg-[#1f2937] border-slate-700 placeholder-slate-600 text-slate-300 focus:border-[#F69008]/50 focus:bg-[#1f2937]',
      searchIcon:     'text-slate-600',
      divider:        'bg-slate-800',
    }
  : {
      wrap:           'bg-white border-r border-slate-200 text-slate-500',
      groupLabel:     'text-slate-400',
      activeItem:     'bg-[#F69008]/10 text-[#F69008] font-semibold',
      inactiveItem:   'text-slate-600 hover:bg-[#F69008]/8 hover:text-[#F69008]',
      accent:         'bg-[#F69008]',
      footerBorder:   'border-slate-200',
      settingsActive: 'bg-[#F69008]/10 text-[#F69008] font-semibold',
      settingsInactive:'text-slate-600 hover:bg-[#F69008]/8 hover:text-[#F69008]',
      logout:         'text-slate-400 hover:bg-slate-100 hover:text-red-500',
      userName:       'text-slate-800',
      userEmail:      'text-slate-400',
      searchBg:       'bg-slate-50 border-slate-200 placeholder-slate-400 text-slate-700 focus:border-[#F69008]/60 focus:bg-white',
      searchIcon:     'text-slate-400',
      divider:        'bg-slate-100',
    }
);

function logout() {
  auth.logout();
  router.push('/login');
}
</script>

<template>
  <div class="flex h-screen bg-slate-50 text-slate-900">
    <!-- Sidebar -->
    <aside class="z-10 flex w-[220px] flex-shrink-0 flex-col transition-colors duration-300" :class="sidebar.wrap">

      <!-- Logo -->
      <div class="flex h-16 items-center gap-2.5 px-4">
        <div class="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-[#F69008] to-[#D97706] text-sm font-bold text-white shadow-lg shadow-[#7C4A00]/40">C</div>
        <span class="text-base font-semibold tracking-tight" :class="isDark ? 'text-white' : 'text-slate-900'">CRM</span>
      </div>

      <!-- Search -->
      <div class="px-3 pb-3">
        <div class="relative">
          <Search class="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2" :class="sidebar.searchIcon" />
          <input
            placeholder="Buscar… ⌘K"
            class="w-full rounded-lg border py-1.5 pl-8 pr-3 text-xs transition-all focus:outline-none focus:ring-1 focus:ring-[#F69008]/30"
            :class="sidebar.searchBg"
          />
        </div>
      </div>

      <!-- Divider -->
      <div class="mx-3 mb-2 h-px" :class="sidebar.divider"></div>

      <!-- Navigation -->
      <nav class="flex-1 overflow-y-auto px-3 py-2">

        <!-- MENÚ PRINCIPAL -->
        <p class="mb-1.5 px-2 text-[10px] font-bold uppercase tracking-widest" :class="sidebar.groupLabel">Menú Principal</p>
        <div class="mb-4 space-y-0.5">
          <RouterLink
            v-for="item in visibleMain"
            :key="item.to"
            :to="item.to"
            class="group relative flex items-center gap-2.5 rounded-md px-3 py-2 text-[13px] transition-all duration-150"
            :class="isActive(item.match) ? sidebar.activeItem : sidebar.inactiveItem"
          >
            <span
              v-if="isActive(item.match)"
              class="absolute -left-3 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full"
              :class="sidebar.accent"
            ></span>
            <component :is="item.icon" class="h-[17px] w-[17px] flex-shrink-0" />
            <span>{{ item.label }}</span>
          </RouterLink>
        </div>

        <!-- HERRAMIENTAS -->
        <p class="mb-1.5 px-2 text-[10px] font-bold uppercase tracking-widest" :class="sidebar.groupLabel">Herramientas</p>
        <div class="space-y-0.5">
          <RouterLink
            v-for="item in visibleTools"
            :key="item.to"
            :to="item.to"
            class="group relative flex items-center gap-2.5 rounded-md px-3 py-2 text-[13px] transition-all duration-150"
            :class="isActive(item.match) ? sidebar.activeItem : sidebar.inactiveItem"
          >
            <span
              v-if="isActive(item.match)"
              class="absolute -left-3 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full"
              :class="sidebar.accent"
            ></span>
            <component :is="item.icon" class="h-[17px] w-[17px] flex-shrink-0" />
            <span>{{ item.label }}</span>
          </RouterLink>
        </div>
      </nav>

      <!-- Footer -->
      <div class="p-3" :class="`border-t ${sidebar.footerBorder}`">
        <RouterLink
          v-if="auth.isAdmin"
          to="/settings"
          class="mb-2 flex items-center gap-2.5 rounded-md px-3 py-2 text-[13px] transition-all duration-150"
          :class="route.path.startsWith('/settings') ? sidebar.settingsActive : sidebar.settingsInactive"
        >
          <span v-if="route.path.startsWith('/settings')" class="absolute -left-3 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full" :class="sidebar.accent"></span>
          <Settings class="h-[17px] w-[17px] flex-shrink-0" />
          Configuración
        </RouterLink>

        <!-- User card -->
        <div class="flex items-center gap-2.5 rounded-lg px-2 py-1.5">
          <div class="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#F69008] to-[#D97706] text-xs font-semibold text-white shadow-sm ring-2 ring-[#F69008]/20">
            {{ initials }}
          </div>
          <div class="min-w-0 flex-1">
            <p class="truncate text-[13px] font-medium leading-tight" :class="sidebar.userName">{{ auth.user?.name ?? 'Usuario' }}</p>
            <p class="truncate text-[11px] leading-tight" :class="sidebar.userEmail">{{ auth.user?.email }}</p>
          </div>
          <button
            class="cursor-pointer rounded-md p-1.5 transition-colors duration-150"
            :class="sidebar.logout"
            @click="logout"
            aria-label="Cerrar sesión"
          >
            <LogOut class="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>

    <!-- Right column: header + content -->
    <div class="flex flex-1 flex-col overflow-hidden">
      <header class="z-[5] flex h-16 flex-shrink-0 flex-col justify-center border-b border-slate-200 bg-white px-6 shadow-toolbar">
        <div class="flex items-center justify-between">
          <!-- Title + breadcrumb -->
          <div>
            <div v-if="breadcrumb.length" class="mb-0.5 flex items-center gap-1 text-xs text-slate-400">
              <RouterLink v-if="breadcrumb[0].to" :to="breadcrumb[0].to" class="hover:text-primary transition-colors">{{ breadcrumb[0].label }}</RouterLink>
              <span v-else>{{ breadcrumb[0].label }}</span>
              <span>/</span>
              <span class="text-slate-600 font-medium">{{ breadcrumb[1]?.label }}</span>
            </div>
            <h1 class="text-xl font-semibold tracking-tight text-slate-900 leading-tight">{{ title }}</h1>
          </div>

          <!-- Actions -->
          <div class="flex items-center gap-3">
            <div class="relative hidden sm:block">
              <Search class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                placeholder="Buscar…"
                class="w-56 rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm transition-all focus:border-primary focus:bg-white focus:shadow-sm focus:ring-2 focus:ring-primary/20 focus:outline-none"
              />
            </div>
            <NotificationsDropdown />
            <div class="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full bg-gradient-to-br from-[#F69008] to-[#D97706] text-sm font-semibold text-white shadow-sm ring-2 ring-transparent transition-all hover:ring-[#F69008]/40">
              {{ initials }}
            </div>
          </div>
        </div>
      </header>

      <main class="flex-1 overflow-auto relative">
        <RouterView v-slot="{ Component }">
          <Transition name="page">
            <component :is="Component" :key="route.path" />
          </Transition>
        </RouterView>
      </main>
    </div>
  </div>
</template>

<style scoped>
.page-enter-active,
.page-leave-active {
  transition: opacity 180ms ease;
  position: absolute;
  inset: 0;
  overflow: auto;
}
.page-enter-from,
.page-leave-to {
  opacity: 0;
}
</style>
