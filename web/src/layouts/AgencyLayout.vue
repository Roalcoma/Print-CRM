<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { RouterLink, RouterView, useRouter, useRoute } from 'vue-router';
import { LayoutDashboard, Users, LogOut, ChevronRight, Menu, CreditCard, ChevronsUpDown, UserCog } from 'lucide-vue-next';
import { useAgencyStore } from '../stores/agency';
import AccountSwitcher from '../components/AccountSwitcher.vue';

const agency = useAgencyStore();
const router = useRouter();
const route = useRoute();

const mobileOpen = ref(false);
const isMobile = ref(false);
const switcherOpen = ref(false);

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
  { to: '/agency/profile',   label: 'Mi perfil',    icon: UserCog,         match: '/agency/profile' },
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
  <div class="flex h-screen bg-[#F1F5F9] text-slate-900">
    <!-- Backdrop móvil -->
    <Transition name="backdrop">
      <div v-if="mobileOpen" class="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm md:hidden" @click="mobileOpen = false"></div>
    </Transition>

    <!-- Sidebar -->
    <Transition name="mobile-drawer">
      <aside v-show="!isMobile || mobileOpen"
        class="flex w-[220px] flex-shrink-0 flex-col bg-[#111827] shadow-2xl"
        :class="isMobile ? 'fixed inset-y-0 left-0 z-[60]' : ''">
      <!-- Logo -->
      <div class="flex h-16 items-center gap-3 border-b border-slate-800/60 px-5">
        <img src="/isotipo.png" alt="Rocco" class="h-9 w-9 flex-shrink-0 object-contain" />
        <div class="leading-tight">
          <p class="text-[15px] font-bold tracking-wide text-white">Rocco</p>
          <p class="text-[10px] text-slate-500 uppercase tracking-widest">Backoffice</p>
        </div>
      </div>

      <!-- Account switcher trigger -->
      <div class="mx-3 mt-3 mb-1">
        <button
          class="flex w-full items-center gap-2.5 rounded-lg border border-white/10 px-2.5 py-2 transition-colors cursor-pointer hover:bg-white/8"
          @click="switcherOpen = true"
        >
          <div class="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-[#F69008]/20 text-[11px] font-bold text-[#F69008]">
            {{ initials }}
          </div>
          <div class="min-w-0 flex-1 text-left">
            <p class="truncate text-[12px] font-semibold leading-tight text-white">
              {{ agency.admin?.name ?? 'Admin' }}
            </p>
            <p class="truncate text-[10px] leading-tight text-slate-500">Agencia</p>
          </div>
          <ChevronsUpDown class="h-3.5 w-3.5 flex-shrink-0 text-slate-500" />
        </button>
      </div>

      <!-- Navigation -->
      <nav class="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        <p class="mb-2 px-2 text-[10px] font-bold uppercase tracking-widest text-slate-600">Panel</p>
        <RouterLink
          v-for="item in nav"
          :key="item.to"
          :to="item.to"
          class="relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-medium transition-all duration-150 overflow-hidden"
          :class="isActive(item.match)
            ? 'bg-[#F69008]/10 text-white font-semibold'
            : 'text-slate-400 hover:bg-slate-800/60 hover:text-white'"
        >
          <span v-if="isActive(item.match)" class="absolute left-0 top-0 h-full w-1 bg-[#F69008] rounded-r"></span>
          <component :is="item.icon" class="h-4 w-4 flex-shrink-0" />
          <span>{{ item.label }}</span>
          <ChevronRight v-if="isActive(item.match)" class="ml-auto h-3 w-3 text-[#F69008]" />
        </RouterLink>
      </nav>

      <!-- Footer -->
      <div class="border-t border-slate-800/60 p-3">
        <div class="flex items-center gap-2.5 rounded-lg px-2 py-2">
          <div class="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#F69008] to-[#D97706] text-xs font-bold text-white shadow-sm">
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
    <div class="flex flex-1 flex-col overflow-hidden bg-[#F1F5F9]">
      <!-- Header -->
      <header class="flex h-16 flex-shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 shadow-sm sm:px-6">
        <div class="flex items-center gap-3">
          <button v-if="isMobile" class="cursor-pointer rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-900 transition-colors" @click="mobileOpen = true">
            <Menu class="h-5 w-5" />
          </button>
          <h1 class="text-base font-semibold text-slate-900 tracking-tight sm:text-lg">{{ title }}</h1>
        </div>
        <div class="flex items-center gap-2 text-sm text-slate-500">
          <div class="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></div>
          <span class="hidden sm:inline">{{ agency.admin?.email }}</span>
        </div>
      </header>

      <main class="flex-1 overflow-auto">
        <RouterView />
      </main>
    </div>
  </div>

  <!-- Account switcher modal -->
  <Teleport to="body">
    <Transition name="switcher-fade">
      <div
        v-if="switcherOpen"
        class="fixed inset-0 z-[200] flex items-start justify-start"
        @click.self="switcherOpen = false"
      >
        <div class="absolute inset-0 bg-black/20 backdrop-blur-[2px]" @click="switcherOpen = false" />
        <div
          class="relative ml-4 mt-[88px] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl shadow-slate-900/15"
          style="z-index: 1;"
        >
          <AccountSwitcher hide-agency-switch @close="switcherOpen = false" />
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.switcher-fade-enter-active { transition: opacity 0.15s ease; }
.switcher-fade-leave-active { transition: opacity 0.1s ease; }
.switcher-fade-enter-from,
.switcher-fade-leave-to    { opacity: 0; }
</style>

