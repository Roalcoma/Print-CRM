<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { Plus, Trash2, Search } from 'lucide-vue-next';
import { api } from '../api';
import type { Contact } from '../types';
import Spinner from '../components/Spinner.vue';
import LoadingState from '../components/LoadingState.vue';

const contacts = ref<Contact[]>([]);
const q = ref('');
const showForm = ref(false);
const form = ref({ first_name: '', last_name: '', email: '', phone: '' });
const saving = ref(false);
const loading = ref(true);

async function load() {
  contacts.value = await api.get<Contact[]>(`/contacts${q.value ? `?q=${encodeURIComponent(q.value)}` : ''}`);
}
onMounted(async () => { try { await load(); } finally { loading.value = false; } });

async function create() {
  saving.value = true;
  try {
    await api.post('/contacts', form.value);
    form.value = { first_name: '', last_name: '', email: '', phone: '' };
    showForm.value = false;
    await load();
  } finally {
    saving.value = false;
  }
}

async function remove(id: string) {
  if (!confirm('¿Eliminar este contacto?')) return;
  await api.del(`/contacts/${id}`);
  await load();
}
</script>

<template>
  <div class="p-8">
    <div class="mb-6 flex items-center justify-end">
      <button
        class="flex cursor-pointer items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-primary/30 transition-all duration-200 hover:bg-primary-dark hover:shadow-md"
        @click="showForm = !showForm"
      >
        <Plus class="h-4 w-4" /> Nuevo contacto
      </button>
    </div>

    <!-- Formulario inline -->
    <Transition name="expand">
    <form v-if="showForm" class="mb-6 grid grid-cols-1 gap-3 rounded-md border border-slate-200 bg-white p-5 shadow-card sm:grid-cols-2" @submit.prevent="create">
      <input v-model="form.first_name" placeholder="Nombre *" required class="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-primary focus:ring-2 focus:ring-primary/30 focus:outline-none" />
      <input v-model="form.last_name" placeholder="Apellido" class="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-primary focus:ring-2 focus:ring-primary/30 focus:outline-none" />
      <input v-model="form.email" type="email" placeholder="Email" class="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-primary focus:ring-2 focus:ring-primary/30 focus:outline-none" />
      <input v-model="form.phone" placeholder="Teléfono" class="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-primary focus:ring-2 focus:ring-primary/30 focus:outline-none" />
      <div class="sm:col-span-2">
        <button type="submit" :disabled="saving" class="flex cursor-pointer items-center gap-2 rounded-md bg-cta px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all duration-200 hover:opacity-90 hover:shadow-md disabled:opacity-60">
          <Spinner v-if="saving" :size="16" light /> {{ saving ? 'Guardando…' : 'Guardar' }}
        </button>
      </div>
    </form>
    </Transition>

    <!-- Buscador -->
    <div class="relative mb-4">
      <Search class="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <input v-model="q" @input="load" placeholder="Buscar contactos…"
        class="w-full max-w-sm rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm shadow-sm transition-all focus:border-primary focus:shadow-md focus:ring-2 focus:ring-primary/20 focus:outline-none" />
    </div>

    <LoadingState v-if="loading" label="Cargando contactos…" />

    <!-- Tabla -->
    <div v-else class="overflow-hidden rounded-md border border-slate-200 bg-white shadow-card">
      <table class="w-full text-sm">
        <thead class="border-b border-slate-200 bg-slate-50 text-left text-slate-500">
          <tr>
            <th class="px-4 py-3 font-medium">Nombre</th>
            <th class="px-4 py-3 font-medium">Email</th>
            <th class="px-4 py-3 font-medium">Teléfono</th>
            <th class="px-4 py-3"></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="c in contacts" :key="c.id" class="border-b border-slate-100 transition-colors duration-200 last:border-0 hover:bg-indigo-50/40">
            <td class="px-4 py-3 font-medium text-slate-900">{{ c.first_name }} {{ c.last_name }}</td>
            <td class="px-4 py-3 text-slate-600">{{ c.email || '—' }}</td>
            <td class="px-4 py-3 text-slate-600">{{ c.phone || '—' }}</td>
            <td class="px-4 py-3 text-right">
              <button class="cursor-pointer rounded p-1.5 text-slate-400 transition-colors duration-200 hover:bg-red-50 hover:text-red-600" @click="remove(c.id)" aria-label="Eliminar contacto">
                <Trash2 class="h-4 w-4" />
              </button>
            </td>
          </tr>
          <tr v-if="contacts.length === 0">
            <td colspan="4" class="px-4 py-10 text-center text-slate-400">No hay contactos todavía.</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
