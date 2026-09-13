<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue';
import { RouterLink, RouterView, useRouter, useRoute } from 'vue-router';
import {
  LayoutGrid, BookUser, TrendingUp, ListChecks,
  CalendarDays, MessagesSquare, LogOut, Search,
  SlidersHorizontal, ChevronLeft, ChevronRight, ChevronDown, Zap,
} from 'lucide-vue-next';
import { useAuthStore } from '../stores/auth';
import NotificationsDropdown from '../components/NotificationsDropdown.vue';

const auth   = useAuthStore();
const router = useRouter();
const route  = useRoute();

const navMain = [
  { to: '/dashboard',     label: 'Dashboard',    icon: LayoutGrid,     match: ['/dashboard'],                   module: null as string | null },
  { to: '/contacts',      label: 'Contactos',    icon: BookUser,       match: ['/contacts'],                    module: 'contacts' },
  { to: '/opportunities', label: 'Leads',        icon: TrendingUp,     match: ['/opportunities', '/pipelines'], module: 'opportunities' },
  { to: '/tasks',         label: 'Tareas',       icon: ListChecks,     match: ['/tasks'],                       module: 'tasks' },
];
const navTools = [
  { to: '/calendar',      label: 'Calendario',      icon: CalendarDays,   match: ['/calendar'],        module: null as string | null },
  { to: '/conversations', label: 'Mensajes',         icon: MessagesSquare, match: ['/conversations'],   module: null as string | null },
  { to: '/automations',   label: 'Automatizaciones', icon: Zap,            match: ['/automations'],     module: null as string | null },
];

const allNav       = [...navMain, ...navTools];
const visibleMain  = computed(() => navMain.filter(i => !i.module || auth.can(i.module)));
const visibleTools = computed(() => navTools.filter(i => !i.module || auth.can(i.module)));
const isActive     = (m: string[]) => m.some(p => route.path.startsWith(p));

const title = computed(() => (route.meta.title as string) ?? 'Rocco');
const initials = computed(() => {
  const n = auth.user?.name ?? 'U';
  return n.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
});

const breadcrumb = computed(() => {
  const crumbs: { label: string; to?: string }[] = [];
  const matched = allNav.find(n => n.match.some(p => route.path.startsWith(p)));
  if (matched && route.path !== matched.to) {
    crumbs.push({ label: matched.label, to: matched.to });
    crumbs.push({ label: title.value });
  }
  return crumbs;
});

// ── Sidebar ──────────────────────────────────────────────────────────────────
const isDark    = computed(() => ((auth.preferences.sidebarTheme as string) ?? 'dark') === 'dark');
const collapsed = computed(() => !!(auth.preferences.sidebarCollapsed as boolean));

function toggleSidebar() {
  auth.savePreferences({ sidebarCollapsed: !collapsed.value });
}

// ── User dropdown ─────────────────────────────────────────────────────────────
const userMenuOpen = ref(false);
const userMenuRef  = ref<HTMLElement | null>(null);

function handleDocClick(e: MouseEvent) {
  if (userMenuRef.value && !userMenuRef.value.contains(e.target as Node)) {
    userMenuOpen.value = false;
  }
}
onMounted(()  => document.addEventListener('mousedown', handleDocClick));
onUnmounted(() => document.removeEventListener('mousedown', handleDocClick));

function logout() {
  auth.logout();
  router.push('/login');
}

// ── Theme tokens ──────────────────────────────────────────────────────────────
const s = computed(() => isDark.value
  ? {
      wrap:             'bg-[#111827] text-slate-400 shadow-xl',
      groupLabel:       'text-slate-600',
      activeItem:       'bg-[#F69008]/10 text-white font-semibold',
      inactiveItem:     'text-slate-400 hover:bg-[#1f2937] hover:text-white',
      accent:           'bg-[#F69008]',
      footerBorder:     'border-slate-800/60',
      settingsActive:   'bg-[#F69008]/10 text-white font-semibold',
      settingsInactive: 'text-slate-400 hover:bg-[#1f2937] hover:text-white',
      divider:          'bg-slate-800',
      navDivider:       'bg-slate-700/60',
      searchBg:         'bg-[#1f2937] border-slate-700 placeholder-slate-600 text-slate-300 focus:border-[#F69008]/50',
      searchIcon:       'text-slate-600',
    }
  : {
      wrap:             'bg-white border-r border-slate-200',
      groupLabel:       'text-slate-400',
      activeItem:       'bg-[#F69008]/10 text-[#F69008] font-semibold',
      inactiveItem:     'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
      accent:           'bg-[#F69008]',
      footerBorder:     'border-slate-200',
      settingsActive:   'bg-[#F69008]/10 text-[#F69008] font-semibold',
      settingsInactive: 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
      divider:          'bg-slate-100',
      navDivider:       'bg-slate-200',
      searchBg:         'bg-slate-50 border-slate-200 placeholder-slate-400 text-slate-700 focus:border-[#F69008]/60 focus:bg-white',
      searchIcon:       'text-slate-400',
    }
);
</script>

<template>
  <div class="flex h-screen bg-[#F1F5F9] text-slate-900">

    <!-- ── Sidebar wrapper (relative so the floating toggle can overflow) ─── -->
    <div class="relative z-10 flex-shrink-0">

      <aside
        class="sidebar flex h-full flex-col overflow-hidden"
        :class="[s.wrap, collapsed ? 'sidebar--collapsed' : 'sidebar--expanded']"
      >
        <!-- Logo -->
        <div class="flex h-16 flex-shrink-0 items-center gap-2.5 px-4">
          <div class="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-[#F69008] to-[#D97706] text-sm font-bold text-white shadow-md">R</div>
          <span class="sidebar-label text-base font-semibold tracking-tight" :class="isDark ? 'text-white' : 'text-slate-900'">Rocco</span>
        </div>

        <!-- Search -->
        <div class="sidebar-search flex-shrink-0 px-3 pb-3">
          <div class="relative">
            <Search class="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2" :class="s.searchIcon" />
            <input
              placeholder="Buscar… ⌘K"
              class="w-full rounded-lg border py-1.5 pl-8 pr-3 text-xs transition-all focus:outline-none focus:ring-1 focus:ring-[#F69008]/30"
              :class="s.searchBg"
            />
          </div>
        </div>

        <!-- Top divider -->
        <div class="mx-3 mb-1 h-px flex-shrink-0" :class="s.divider"></div>

        <!-- Navigation (flex col so spacer pushes Settings to bottom) -->
        <nav class="flex flex-1 flex-col overflow-y-auto overflow-x-hidden px-2 py-1">

          <!-- Menú Principal -->
          <p class="sidebar-label mb-1 px-2 text-[10px] font-bold uppercase tracking-widest" :class="s.groupLabel">Menú</p>
          <div class="space-y-0.5">
            <RouterLink
              v-for="item in visibleMain" :key="item.to"
              :to="item.to"
              :title="collapsed ? item.label : undefined"
              class="nav-item group relative flex items-center rounded-md transition-all duration-150"
              :class="isActive(item.match) ? s.activeItem : s.inactiveItem"
            >
              <span v-if="isActive(item.match)" class="active-accent" :class="s.accent"></span>
              <component :is="item.icon" class="nav-icon h-[18px] w-[18px] flex-shrink-0" />
              <span class="nav-label">{{ item.label }}</span>
            </RouterLink>
          </div>

          <!-- Separator between groups -->
          <div class="nav-separator mx-auto h-px" :class="s.navDivider"></div>

          <!-- Herramientas -->
          <p class="sidebar-label mt-0.5 mb-1 px-2 text-[10px] font-bold uppercase tracking-widest" :class="s.groupLabel">Tools</p>
          <div class="space-y-0.5">
            <RouterLink
              v-for="item in visibleTools" :key="item.to"
              :to="item.to"
              :title="collapsed ? item.label : undefined"
              class="nav-item group relative flex items-center rounded-md transition-all duration-150"
              :class="isActive(item.match) ? s.activeItem : s.inactiveItem"
            >
              <span v-if="isActive(item.match)" class="active-accent" :class="s.accent"></span>
              <component :is="item.icon" class="nav-icon h-[18px] w-[18px] flex-shrink-0" />
              <span class="nav-label">{{ item.label }}</span>
            </RouterLink>
          </div>

          <!-- Spacer: empuja Settings al fondo -->
          <div class="flex-1"></div>

          <!-- Settings -->
          <div class="mb-1 h-px" :class="s.navDivider"></div>
          <RouterLink
            v-if="auth.isAdmin"
            to="/settings"
            :title="collapsed ? 'Ajustes' : undefined"
            class="nav-item mb-1 flex items-center rounded-md transition-all duration-150"
            :class="route.path.startsWith('/settings') ? s.settingsActive : s.settingsInactive"
          >
            <SlidersHorizontal class="nav-icon h-[18px] w-[18px] flex-shrink-0" />
            <span class="nav-label">Ajustes</span>
          </RouterLink>
        </nav>
      </aside>

      <!-- Floating toggle button (GHL style — círculo en el borde derecho, bajo) -->
      <button
        class="floating-toggle absolute right-0 z-20 flex cursor-pointer items-center justify-center rounded-full bg-[#F69008] text-white shadow-lg shadow-[#F69008]/30 ring-2 transition-all hover:bg-[#D97706] hover:shadow-[#D97706]/40 active:scale-95"
        :class="isDark ? 'ring-[#111827]' : 'ring-white'"
        style="top: 86%; transform: translate(50%, -50%)"
        @click="toggleSidebar"
        :title="collapsed ? 'Expandir panel' : 'Contraer panel'"
      >
        <component :is="collapsed ? ChevronRight : ChevronLeft" class="h-3.5 w-3.5" />
      </button>
    </div>

    <!-- ── Right column ───────────────────────────────────────────────────── -->
    <div class="flex flex-1 flex-col overflow-hidden">

      <!-- Header -->
      <header class="z-[5] flex h-16 flex-shrink-0 items-center justify-between border-b border-slate-200 bg-white px-6 shadow-toolbar">
        <!-- Page title / breadcrumb -->
        <div>
          <div v-if="breadcrumb.length" class="mb-0.5 flex items-center gap-1 text-xs text-slate-400">
            <RouterLink v-if="breadcrumb[0].to" :to="breadcrumb[0].to" class="transition-colors hover:text-primary">{{ breadcrumb[0].label }}</RouterLink>
            <span v-else>{{ breadcrumb[0].label }}</span>
            <span>/</span>
            <span class="font-medium text-slate-600">{{ breadcrumb[1]?.label }}</span>
          </div>
          <h1 class="text-xl font-semibold leading-tight tracking-tight text-slate-900">{{ title }}</h1>
        </div>

        <!-- Right controls -->
        <div class="flex items-center gap-3">
          <!-- Search bar -->
          <div class="relative hidden sm:block">
            <Search class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              placeholder="Buscar…"
              class="w-52 rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm transition-all focus:border-primary focus:bg-white focus:shadow-sm focus:ring-2 focus:ring-primary/20 focus:outline-none"
            />
          </div>

          <!-- Notifications -->
          <NotificationsDropdown />

          <!-- User dropdown -->
          <div ref="userMenuRef" class="relative">
            <button
              class="flex cursor-pointer items-center gap-2 rounded-xl border border-transparent px-2 py-1.5 transition-all hover:border-slate-200 hover:bg-slate-50"
              @click="userMenuOpen = !userMenuOpen"
            >
              <div class="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#F69008] to-[#D97706] text-xs font-semibold text-white shadow-sm">
                {{ initials }}
              </div>
              <div class="hidden text-left md:block">
                <p class="text-sm font-semibold leading-tight text-slate-800">{{ auth.user?.name ?? 'Usuario' }}</p>
                <p class="text-[11px] leading-tight text-slate-400">{{ auth.user?.role }}</p>
              </div>
              <ChevronDown
                class="h-3.5 w-3.5 flex-shrink-0 text-slate-400 transition-transform duration-200"
                :class="userMenuOpen ? 'rotate-180' : ''"
              />
            </button>

            <!-- Dropdown menu -->
            <Transition name="dropdown">
              <div
                v-if="userMenuOpen"
                class="absolute right-0 top-[calc(100%+6px)] z-50 w-56 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl shadow-slate-200/60"
              >
                <!-- User info -->
                <div class="border-b border-slate-100 px-3.5 py-3">
                  <div class="flex items-center gap-2.5">
                    <div class="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#F69008] to-[#D97706] text-sm font-semibold text-white">
                      {{ initials }}
                    </div>
                    <div class="min-w-0">
                      <p class="truncate text-sm font-semibold text-slate-800">{{ auth.user?.name ?? 'Usuario' }}</p>
                      <p class="truncate text-[11px] text-slate-400">{{ auth.user?.email }}</p>
                    </div>
                  </div>
                </div>
                <!-- Logout -->
                <button
                  class="flex w-full cursor-pointer items-center gap-2 px-3.5 py-2.5 text-sm text-red-500 transition-colors hover:bg-red-50"
                  @click="logout"
                >
                  <LogOut class="h-4 w-4" />
                  Cerrar sesión
                </button>
              </div>
            </Transition>
          </div>
        </div>
      </header>

      <!-- Main content -->
      <main class="relative flex-1 overflow-auto">
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
/* ── Sidebar ──────────────────────────────────────────────────────────────── */
.sidebar {
  transition: width 0.22s cubic-bezier(0.4, 0, 0.2, 1);
}
.sidebar--expanded  { width: 220px; }
.sidebar--collapsed { width: 64px; }

/* ── Floating toggle ──────────────────────────────────────────────────────── */
.floating-toggle {
  width: 26px;
  height: 26px;
}

/* ── Nav items ────────────────────────────────────────────────────────────── */
.nav-item {
  display: flex;
  flex-direction: row;
  align-items: center;
  padding: 0.45rem 0.75rem;
  gap: 0.625rem;
}

.sidebar--collapsed .nav-item {
  flex-direction: column;
  padding: 0.45rem 0.25rem;
  gap: 0.2rem;
  justify-content: center;
  align-items: center;
}

.nav-icon { flex-shrink: 0; }

/* ── Nav label (shows in both modes — repositioned when collapsed) ─────────── */
.nav-label {
  font-size: 13px;
  line-height: 1.2;
  white-space: nowrap;
  overflow: hidden;
  max-width: 180px;
  opacity: 1;
  text-overflow: ellipsis;
  transition: font-size 0.18s ease, max-width 0.22s ease;
}
.sidebar--collapsed .nav-label {
  font-size: 9px;
  max-width: 56px;
  text-align: center;
  line-height: 1.1;
}

/* ── Sidebar-label (logo text, group labels) — hides when collapsed ───────── */
.sidebar-label {
  overflow: hidden;
  max-width: 180px;
  opacity: 1;
  white-space: nowrap;
  transition: max-width 0.22s ease, opacity 0.15s ease, margin 0.22s ease;
}
.sidebar--collapsed .sidebar-label {
  max-width: 0;
  opacity: 0;
  margin: 0;
  pointer-events: none;
}

/* ── Search bar ───────────────────────────────────────────────────────────── */
.sidebar-search {
  overflow: hidden;
  max-height: 52px;
  opacity: 1;
  transition: max-height 0.22s ease, opacity 0.15s ease, padding 0.22s ease;
}
.sidebar--collapsed .sidebar-search {
  max-height: 0;
  opacity: 0;
  padding-bottom: 0;
}

/* ── Section separator (between nav groups, only in collapsed mode) ─────────── */
.nav-separator {
  width: 28px;
  max-height: 0;
  opacity: 0;
  margin: 0 auto;
  transition: opacity 0.22s ease, max-height 0.22s ease, margin 0.22s ease;
}
.sidebar--collapsed .nav-separator {
  opacity: 1;
  max-height: 1px;
  margin: 5px auto;
}

/* ── Active accent bar ─ left in expanded, bottom in collapsed ────────────── */
.active-accent {
  position: absolute;
  left: 0;
  top: 50%;
  width: 3px;
  height: 20px;
  transform: translateY(-50%);
  border-radius: 0 4px 4px 0;
  transition: left 0.22s ease, top 0.22s ease, bottom 0.22s ease,
              width 0.22s ease, height 0.22s ease, transform 0.22s ease,
              border-radius 0.22s ease;
}
.sidebar--collapsed .active-accent {
  left: 50%;
  top: auto;
  bottom: 0;
  width: 22px;
  height: 3px;
  transform: translateX(-50%);
  border-radius: 3px 3px 0 0;
}

/* ── User dropdown transition ─────────────────────────────────────────────── */
.dropdown-enter-active { transition: opacity 0.15s ease, transform 0.15s ease; }
.dropdown-leave-active { transition: opacity 0.1s ease, transform 0.1s ease; }
.dropdown-enter-from,
.dropdown-leave-to    { opacity: 0; transform: translateY(-6px); }

/* ── Page transition ──────────────────────────────────────────────────────── */
.page-enter-active,
.page-leave-active {
  transition: opacity 180ms ease;
  position: absolute;
  inset: 0;
  overflow: auto;
}
.page-enter-from,
.page-leave-to { opacity: 0; }
</style>
