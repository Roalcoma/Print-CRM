<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { Users, Kanban, DollarSign } from 'lucide-vue-next';
import { api } from '../api';
import type { Contact, Pipeline, Opportunity } from '../types';
import LoadingState from '../components/LoadingState.vue';
import { useAuthStore } from '../stores/auth';

const auth = useAuthStore();
const contacts = ref(0);
const openOpps = ref(0);
const openValue = ref(0);
const loading = ref(true);

onMounted(async () => {
  try {
    // Solo consulta los módulos a los que el usuario tiene acceso.
    if (auth.can('contacts')) {
      contacts.value = (await api.get<Contact[]>('/contacts')).length;
    }
    if (auth.can('opportunities')) {
      const pipelines = await api.get<Pipeline[]>('/pipelines');
      if (pipelines[0]) {
        const opps = await api.post<Opportunity[]>('/opportunities/query', { pipelineId: pipelines[0].id });
        const open = opps.filter(o => o.status === 'open');
        openOpps.value = open.length;
        openValue.value = open.reduce((sum, o) => sum + Number(o.value), 0);
      }
    }
  } finally {
    loading.value = false;
  }
});

const money = (n: number) => n.toLocaleString('es-VE', { style: 'currency', currency: 'USD' });
</script>

<template>
  <LoadingState v-if="loading" label="Cargando dashboard…" />
  <div v-else class="p-8">
    <div class="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
      <div v-if="auth.can('contacts')" class="group rounded-lg border border-slate-200 bg-white p-5 shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:shadow-elevated">
        <div class="flex items-center justify-between">
          <p class="text-sm font-medium text-slate-500">Contactos</p>
          <div class="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-600 transition-colors group-hover:bg-blue-100">
            <Users class="h-5 w-5" />
          </div>
        </div>
        <p class="mt-3 text-3xl font-semibold text-slate-900">{{ contacts }}</p>
      </div>
      <template v-if="auth.can('opportunities')">
        <div class="group rounded-lg border border-slate-200 bg-white p-5 shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:shadow-elevated">
          <div class="flex items-center justify-between">
            <p class="text-sm font-medium text-slate-500">Oportunidades abiertas</p>
            <div class="flex h-10 w-10 items-center justify-center rounded-lg bg-[#F69008]/10 text-[#D97706] transition-colors group-hover:bg-[#F69008]/20">
              <Kanban class="h-5 w-5" />
            </div>
          </div>
          <p class="mt-3 text-3xl font-semibold text-slate-900">{{ openOpps }}</p>
        </div>
        <div class="group rounded-lg border border-slate-200 bg-white p-5 shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:shadow-elevated">
          <div class="flex items-center justify-between">
            <p class="text-sm font-medium text-slate-500">Valor en pipeline</p>
            <div class="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 transition-colors group-hover:bg-emerald-100">
              <DollarSign class="h-5 w-5" />
            </div>
          </div>
          <p class="mt-3 text-3xl font-semibold text-cta">{{ money(openValue) }}</p>
        </div>
      </template>
    </div>
  </div>
</template>
