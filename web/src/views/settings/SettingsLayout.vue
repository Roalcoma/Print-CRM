<script setup lang="ts">
import { ref } from 'vue';
import { RouterLink, RouterView, useRoute } from 'vue-router';
import { Building2, Users, GitBranch, Palette, Calendar, MessageCircle, Share2, ChevronDown } from 'lucide-vue-next';

const route = useRoute();
const mobileNavOpen = ref(false);

const groups = [
  {
    title: 'Mi negocio',
    items: [
      { to: '/settings/business', label: 'Perfil del negocio', icon: Building2 },
      { to: '/settings/team', label: 'Mi equipo', icon: Users },
      { to: '/pipelines', label: 'Pipelines y etapas', icon: GitBranch },
    ],
  },
  {
    title: 'Personalización',
    items: [
      { to: '/settings/theme', label: 'Apariencia', icon: Palette },
      { to: '/settings/calendar', label: 'Calendario', icon: Calendar },
    ],
  },
  {
    title: 'Integraciones',
    items: [
      { to: '/settings/whatsapp', label: 'WhatsApp', icon: MessageCircle },
      { to: '/settings/social', label: 'Redes Sociales', icon: Share2 },
    ],
  },
];

const allItems = groups.flatMap(g => g.items);
const activeLabel = () => allItems.find(i => route.path.startsWith(i.to))?.label ?? 'Configuración';
</script>

<template>
  <div class="flex h-full flex-col md:flex-row">

    <!-- Sub-nav móvil: dropdown -->
    <div class="flex-shrink-0 border-b border-slate-200 bg-white md:hidden">
      <button
        class="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-slate-700"
        @click="mobileNavOpen = !mobileNavOpen"
      >
        <span>{{ activeLabel() }}</span>
        <ChevronDown class="h-4 w-4 text-slate-400 transition-transform" :class="mobileNavOpen && 'rotate-180'" />
      </button>
      <div v-if="mobileNavOpen" class="border-t border-slate-100 pb-2">
        <template v-for="g in groups" :key="g.title">
          <p class="px-4 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">{{ g.title }}</p>
          <RouterLink
            v-for="item in g.items"
            :key="item.to"
            :to="item.to"
            class="flex items-center gap-2.5 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
            active-class="!text-primary bg-primary/5"
            @click="mobileNavOpen = false"
          >
            <component :is="item.icon" class="h-[18px] w-[18px]" />
            {{ item.label }}
          </RouterLink>
        </template>
      </div>
    </div>

    <!-- Sub-menú de configuración (desktop) -->
    <aside class="hidden w-60 flex-shrink-0 overflow-auto border-r border-slate-200 bg-white md:block">
      <div class="px-5 py-5">
        <h2 class="text-lg font-semibold text-slate-900">Configuración</h2>
      </div>
      <nav class="space-y-6 px-3 pb-6">
        <div v-for="g in groups" :key="g.title">
          <p class="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-wider text-slate-400">{{ g.title }}</p>
          <div class="space-y-0.5">
            <RouterLink
              v-for="item in g.items"
              :key="item.to"
              :to="item.to"
              class="flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100"
              active-class="!bg-primary/10 !text-primary"
            >
              <component :is="item.icon" class="h-[18px] w-[18px]" />
              {{ item.label }}
            </RouterLink>
          </div>
        </div>
      </nav>
    </aside>

    <!-- Contenido de la sección -->
    <div class="flex flex-1 flex-col overflow-hidden bg-[#F1F5F9]">
      <RouterView />
    </div>
  </div>
</template>
