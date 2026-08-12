<script setup lang="ts">
import { computed } from 'vue';
import { Check } from 'lucide-vue-next';
import { useAuthStore } from '../../stores/auth';

const auth = useAuthStore();
const current = computed(() => (auth.preferences.sidebarTheme as string) ?? 'dark');

async function select(theme: 'dark' | 'light') {
  await auth.savePreferences({ sidebarTheme: theme });
}

const options = [
  {
    key: 'dark' as const,
    label: 'Oscuro',
    description: 'Sidebar con fondo oscuro, estilo premium.',
    sidebar: 'bg-gradient-to-b from-slate-900 to-slate-950',
    activeItem: 'bg-[#F69008]',
    item: 'bg-slate-800',
    text: 'text-white',
    subtext: 'text-slate-500',
    border: 'border-slate-800',
  },
  {
    key: 'light' as const,
    label: 'Claro',
    description: 'Sidebar con fondo blanco, estilo limpio.',
    sidebar: 'bg-white border-r border-slate-200',
    activeItem: 'bg-[#F69008]/15',
    item: 'bg-slate-100',
    text: 'text-slate-900',
    subtext: 'text-slate-400',
    border: 'border-slate-200',
  },
];
</script>

<template>
  <div class="mx-auto max-w-2xl px-8 py-8">
    <div class="mb-6">
      <h3 class="text-base font-semibold text-slate-900">Apariencia</h3>
      <p class="mt-1 text-sm text-slate-500">Elige el estilo visual de la barra lateral del CRM.</p>
    </div>

    <div class="grid grid-cols-2 gap-4">
      <button
        v-for="opt in options"
        :key="opt.key"
        type="button"
        class="group relative cursor-pointer overflow-hidden rounded-xl border-2 text-left transition-all duration-200"
        :class="current === opt.key
          ? 'border-primary shadow-md shadow-primary/20'
          : 'border-slate-200 hover:border-primary/40'"
        @click="select(opt.key)"
      >
        <!-- Checkmark -->
        <div
          class="absolute right-2.5 top-2.5 flex h-5 w-5 items-center justify-center rounded-full transition-all"
          :class="current === opt.key ? 'bg-primary text-white' : 'bg-slate-100 text-transparent'"
        >
          <Check class="h-3 w-3" />
        </div>

        <!-- Preview mini de la sidebar -->
        <div class="flex h-36 overflow-hidden rounded-t-lg">
          <!-- Mini sidebar -->
          <div class="flex w-16 flex-col gap-1.5 p-2" :class="opt.sidebar">
            <!-- Logo mini -->
            <div class="mb-1 flex h-5 w-5 items-center justify-center rounded bg-gradient-to-br from-[#F69008] to-[#D97706] text-[8px] font-bold text-white">C</div>
            <!-- Items mini -->
            <div class="h-3 w-full rounded-sm" :class="opt.activeItem"></div>
            <div class="h-3 w-full rounded-sm opacity-40" :class="opt.item"></div>
            <div class="h-3 w-full rounded-sm opacity-40" :class="opt.item"></div>
            <div class="h-3 w-full rounded-sm opacity-40" :class="opt.item"></div>
          </div>
          <!-- Mini contenido -->
          <div class="flex-1 bg-slate-50 p-2">
            <div class="mb-2 h-3 w-24 rounded bg-slate-200"></div>
            <div class="grid grid-cols-2 gap-1.5">
              <div class="h-10 rounded bg-white shadow-sm"></div>
              <div class="h-10 rounded bg-white shadow-sm"></div>
            </div>
          </div>
        </div>

        <!-- Etiqueta -->
        <div class="border-t px-4 py-3" :class="current === opt.key ? 'border-primary/20 bg-primary/5' : 'border-slate-100 bg-white'">
          <p class="text-sm font-semibold" :class="current === opt.key ? 'text-primary' : 'text-slate-800'">{{ opt.label }}</p>
          <p class="text-xs text-slate-500">{{ opt.description }}</p>
        </div>
      </button>
    </div>
  </div>
</template>
