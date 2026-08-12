<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { Building2, Check } from 'lucide-vue-next';
import { api } from '../../api';
import Spinner from '../../components/Spinner.vue';
import LoadingState from '../../components/LoadingState.vue';

interface Org { id: string; name: string; created_at: string }
const org = ref<Org | null>(null);
const name = ref('');
const loading = ref(true);
const saving = ref(false);
const saved = ref(false);
const error = ref('');

onMounted(async () => {
  try {
    org.value = await api.get<Org>('/organization');
    name.value = org.value.name;
  } finally { loading.value = false; }
});

async function save() {
  error.value = ''; saved.value = false; saving.value = true;
  try {
    org.value = await api.patch<Org>('/organization', { name: name.value });
    saved.value = true;
    setTimeout(() => { saved.value = false; }, 2000);
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'No se pudo guardar';
  } finally { saving.value = false; }
}

const createdAt = () => org.value ? new Date(org.value.created_at).toLocaleDateString('es-VE', { day: '2-digit', month: 'long', year: 'numeric' }) : '';
</script>

<template>
  <div class="p-8">
    <div class="mx-auto max-w-2xl">
      <div class="mb-6">
        <h3 class="text-xl font-semibold text-slate-900">Perfil del negocio</h3>
        <p class="mt-1 text-sm text-slate-500">Información general de tu organización.</p>
      </div>

      <LoadingState v-if="loading" label="Cargando…" />

      <div v-else class="rounded-lg border border-slate-200 bg-white p-6 shadow-card">
        <div class="mb-6 flex items-center gap-4 border-b border-slate-100 pb-6">
          <div class="flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br from-[#F69008] to-[#D97706] text-white shadow-sm shadow-[#F69008]/30">
            <Building2 class="h-7 w-7" />
          </div>
          <div>
            <p class="font-semibold text-slate-900">{{ org?.name }}</p>
            <p class="text-xs text-slate-500">Creada el {{ createdAt() }}</p>
          </div>
        </div>

        <div class="max-w-md">
          <label class="mb-1.5 block text-sm font-medium text-slate-700">Nombre del negocio</label>
          <input v-model="name" class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none" />
          <p v-if="error" class="mt-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{{ error }}</p>
          <div class="mt-4 flex items-center gap-3">
            <button :disabled="saving || !name.trim() || name === org?.name" class="flex cursor-pointer items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-primary/30 transition-all hover:bg-primary-dark hover:shadow-md disabled:opacity-50" @click="save">
              <Spinner v-if="saving" :size="16" light /> Guardar cambios
            </button>
            <span v-if="saved" class="flex items-center gap-1 text-sm font-medium text-emerald-600"><Check class="h-4 w-4" /> Guardado</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
