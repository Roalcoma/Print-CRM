<script setup lang="ts">
import { RouterLink, RouterView } from 'vue-router';
import { Building2, Users, GitBranch, Palette } from 'lucide-vue-next';

// Grupos de configuración. Escalable: se añaden secciones aquí a medida que crece.
const groups = [
  {
    title: 'Mi negocio',
    items: [
      { to: '/settings/business', label: 'Perfil del negocio', icon: Building2 },
      { to: '/settings/team', label: 'Mi equipo', icon: Users },
      { to: '/pipelines', label: 'Pipelines y etapas', icon: GitBranch, external: true },
    ],
  },
  {
    title: 'Personalización',
    items: [
      { to: '/settings/theme', label: 'Apariencia', icon: Palette },
    ],
  },
];
</script>

<template>
  <div class="flex h-full">
    <!-- Sub-menú de configuración -->
    <aside class="w-60 flex-shrink-0 overflow-auto border-r border-slate-200 bg-white">
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
              class="flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors"
              :class="item.external
                ? 'text-slate-600 hover:bg-slate-100'
                : 'text-slate-600 hover:bg-slate-100'"
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
    <div class="flex-1 overflow-auto bg-slate-50/50">
      <RouterView />
    </div>
  </div>
</template>
