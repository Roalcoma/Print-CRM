<script setup lang="ts">
import { ref } from 'vue';
import { User, Lock, Save } from 'lucide-vue-next';
import { agencyApi } from '../../agencyApi';
import { useAgencyStore } from '../../stores/agency';
import Spinner from '../../components/Spinner.vue';

const agency = useAgencyStore();
const name     = ref(agency.admin?.name ?? '');
const password = ref('');
const saving   = ref(false);
const success  = ref(false);
const error    = ref('');

async function save() {
  error.value = ''; success.value = false;
  const patch: Record<string, string> = {};
  if (name.value && name.value !== agency.admin?.name) patch.name = name.value;
  if (password.value) patch.password = password.value;
  if (!Object.keys(patch).length) return;
  saving.value = true;
  try {
    const updated = await agencyApi.patch<{ name: string }>('/auth/me', patch);
    if (agency.admin) agency.admin.name = updated.name;
    password.value = '';
    success.value = true;
    setTimeout(() => { success.value = false; }, 3000);
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'No se pudo guardar';
  } finally { saving.value = false; }
}
</script>

<template>
  <div class="flex h-full flex-col overflow-hidden">
    <div class="flex flex-shrink-0 items-center border-b border-slate-200 bg-white px-6 py-3.5">
      <h3 class="text-[15px] font-semibold text-slate-900">Mi perfil</h3>
    </div>

    <div class="flex-1 overflow-y-auto bg-[#F1F5F9] p-6">
      <div class="mx-auto max-w-lg space-y-5">

        <p v-if="error" class="rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">{{ error }}</p>
        <p v-if="success" class="rounded-lg border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">Cambios guardados correctamente.</p>

        <!-- Nombre -->
        <div class="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div class="mb-4 flex items-center gap-2 border-b border-slate-100 pb-3">
            <User class="h-4 w-4 text-blue-500" />
            <h4 class="text-[13px] font-semibold text-slate-700">Información personal</h4>
          </div>
          <div>
            <label class="mb-1.5 block text-[13px] font-medium text-slate-600">Nombre</label>
            <input v-model="name" class="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none" placeholder="Tu nombre" />
          </div>
          <div class="mt-4">
            <label class="mb-1 block text-[12px] text-slate-400">Email (no editable)</label>
            <p class="text-sm text-slate-500">{{ agency.admin?.email }}</p>
          </div>
        </div>

        <!-- Contraseña -->
        <div class="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div class="mb-4 flex items-center gap-2 border-b border-slate-100 pb-3">
            <Lock class="h-4 w-4 text-blue-500" />
            <h4 class="text-[13px] font-semibold text-slate-700">Cambiar contraseña</h4>
          </div>
          <div>
            <label class="mb-1.5 block text-[13px] font-medium text-slate-600">Nueva contraseña</label>
            <input v-model="password" type="password" class="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none" placeholder="Mínimo 8 caracteres" />
          </div>
        </div>

        <div class="flex justify-end">
          <button :disabled="saving" class="btn btn-primary flex items-center gap-2" @click="save">
            <Spinner v-if="saving" :size="14" light />
            <Save v-else class="h-4 w-4" />
            {{ saving ? 'Guardando…' : 'Guardar cambios' }}
          </button>
        </div>

      </div>
    </div>
  </div>
</template>
