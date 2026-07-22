<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { api } from '../api';
import type { Contact, Pipeline, Opportunity } from '../types';

const contacts = ref(0);
const openOpps = ref(0);
const openValue = ref(0);

onMounted(async () => {
  const [cs, pipelines] = await Promise.all([
    api.get<Contact[]>('/contacts'),
    api.get<Pipeline[]>('/pipelines'),
  ]);
  contacts.value = cs.length;

  if (pipelines[0]) {
    const opps = await api.post<Opportunity[]>('/opportunities/query', { pipelineId: pipelines[0].id });
    const open = opps.filter(o => o.status === 'open');
    openOpps.value = open.length;
    openValue.value = open.reduce((sum, o) => sum + Number(o.value), 0);
  }
});

const money = (n: number) => n.toLocaleString('es-VE', { style: 'currency', currency: 'USD' });
</script>

<template>
  <div class="p-8">
    <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <div class="rounded-xl border border-slate-200 bg-white p-5">
        <p class="text-sm font-medium text-slate-500">Contactos</p>
        <p class="mt-2 text-3xl font-semibold text-slate-900">{{ contacts }}</p>
      </div>
      <div class="rounded-xl border border-slate-200 bg-white p-5">
        <p class="text-sm font-medium text-slate-500">Oportunidades abiertas</p>
        <p class="mt-2 text-3xl font-semibold text-slate-900">{{ openOpps }}</p>
      </div>
      <div class="rounded-xl border border-slate-200 bg-white p-5">
        <p class="text-sm font-medium text-slate-500">Valor en pipeline</p>
        <p class="mt-2 text-3xl font-semibold text-cta">{{ money(openValue) }}</p>
      </div>
    </div>
  </div>
</template>
