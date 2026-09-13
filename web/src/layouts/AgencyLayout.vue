<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { RouterLink, RouterView, useRouter, useRoute } from 'vue-router';
import { LayoutDashboard, Users, LogOut, Building2, ChevronRight, Menu, ChevronDown, CreditCard } from 'lucide-vue-next';
import { useAgencyStore } from '../stores/agency';
import AccountSwitcher from '../components/AccountSwitcher.vue';
import Dropdown from '../components/Dropdown.vue';

const agency = useAgencyStore();
const router = useRouter();
const route = useRoute();

const mobileOpen = ref(false);
const isMobile = ref(false);

function checkMobile() {
  isMobile.value = window.innerWidth < 768;
  if (!isMobile.value) mobileOpen.value = false;
}

watch(() => route.path, () => { mobileOpen.value = false; });

onMounted(async () => {
  checkMobile();
  window.addEventListener('resize', checkMobile);
  await agency.init();
  if (!agency.isLoggedIn) {
    router.push('/agency/login');
  }
});

const nav = [
  { to: '/agency/dashboard', label: 'Dashboard',   icon: LayoutDashboard, match: '/agency/dashboard' },
  { to: '/agency/clients',   label: 'Cuentas CRM', icon: Users,           match: '/agency/clients' },
  { to: '/agency/plans',     label: 'Planes',       icon: CreditCard,      match: '/agency/plans' },
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

onUnmounted(() => window.removeEventListener('resize', checkMobile));
</script>

<template>
  <div class="flex h-screen bg-slate-950 text-slate-100">
    <!-- Backdrop móvil -->
    <Transition name="backdrop">
      <div v-if="mobileOpen" class="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm md:hidden" @click="mobileOpen = false"></div>
    </Transition>

    <!-- Sidebar -->
    <Transition name="mobile-drawer">
      <aside v-show="!isMobile || mobileOpen"
        class="flex w-[220px] flex-shrink-0 flex-col bg-[#0f172a] shadow-2xl"
        :class="isMobile ? 'fixed inset-y-0 left-0 z-[60]' : ''">
      <!-- Logo + Account Switcher -->
      <Dropdown width="300" triggerClass="block w-full">
        <template #trigger="{ open }">
          <div class="flex h-16 cursor-pointer items-center gap-3 border-b border-slate-800/60 px-5 hover:bg-slate-800/30 transition-colors">
            <div class="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 shadow-lg shadow-violet-900/50">
              <Building2 class="h-5 w-5 text-white" />
            </div>
            <div class="min-w-0 flex-1 leading-tight">
              <p class="text-[13px] font-bold tracking-wide text-white">AGENCY</p>
              <p class="text-[10px] text-slate-500 uppercase tracking-widest">Backoffice</p>
            </div>
            <ChevronDown class="h-4 w-4 flex-shrink-0 text-slate-600 transition-transform" :class="open ? 'rotate-180' : ''" />
          </div>
        </template>
        <AccountSwitcher @close="() => {}" />
      </Dropdown>

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
    </Transition>

    <!-- Main content -->
    <div class="flex flex-1 flex-col overflow-hidden bg-slate-950">
      <!-- Header -->
      <header class="flex h-16 flex-shrink-0 items-center justify-between border-b border-slate-800/60 bg-slate-900/50 px-4 backdrop-blur-sm sm:px-6">
        <div class="flex items-center gap-3">
          <button v-if="isMobile" class="cursor-pointer rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition-colors" @click="mobileOpen = true">
            <Menu class="h-5 w-5" />
          </button>
          <h1 class="text-base font-semibold text-white tracking-tight sm:text-lg">{{ title }}</h1>
        </div>
        <div class="flex items-center gap-2 text-sm text-slate-400">
          <div class="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></div>
          <span class="hidden sm:inline">{{ agency.admin?.email }}</span>
        </div>
      </header>

      <main class="flex-1 overflow-auto">
        <RouterView />
      </main>
    </div>
  </div>
</template>
