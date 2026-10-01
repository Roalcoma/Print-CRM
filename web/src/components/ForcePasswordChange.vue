<script setup lang="ts">
// Modal bloqueante: el usuario entró con una contraseña temporal (creada por la agencia
// o por un admin) y debe cambiarla antes de usar el CRM.
import { ref } from 'vue';
import { KeyRound, LogOut } from 'lucide-vue-next';
import { api } from '../api';
import { useAuthStore } from '../stores/auth';
import Spinner from './Spinner.vue';

const auth = useAuthStore();
const current = ref('');
const next = ref('');
const confirm = ref('');
const error = ref('');
const saving = ref(false);

async function submit() {
  error.value = '';
  if (next.value.length < 8) { error.value = 'La nueva contraseña debe tener al menos 8 caracteres'; return; }
  if (next.value !== confirm.value) { error.value = 'Las contraseñas no coinciden'; return; }
  saving.value = true;
  try {
    await api.post('/me/password', { current_password: current.value, new_password: next.value });
    if (auth.user) auth.user.mustChangePassword = false;
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'No se pudo cambiar la contraseña';
  } finally { saving.value = false; }
}
</script>

<template>
  <Teleport to="body">
    <div class="fixed inset-0 z-[300] flex items-center justify-center bg-[#13243D]/70 p-4 backdrop-blur-sm">
      <form class="w-full max-w-md rounded-md border border-slate-200 bg-white p-6 shadow-2xl" @submit.prevent="submit">
        <div class="mb-4 flex items-center gap-3">
          <div class="flex h-10 w-10 items-center justify-center rounded-md bg-[#F69008]/10">
            <KeyRound class="h-5 w-5 text-[#F69008]" />
          </div>
          <div>
            <h2 class="text-base font-semibold text-[#13243D]">Cambia tu contraseña</h2>
            <p class="text-xs text-slate-500">Entraste con una contraseña temporal. Elige una nueva para continuar.</p>
          </div>
        </div>

        <div class="space-y-3">
          <div>
            <label class="mb-1 block text-xs font-medium text-slate-600">Contraseña temporal (la que usaste para entrar)</label>
            <input v-model="current" type="password" required autocomplete="current-password"
              class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-[#F69008] focus:outline-none" />
          </div>
          <div>
            <label class="mb-1 block text-xs font-medium text-slate-600">Nueva contraseña</label>
            <input v-model="next" type="password" required autocomplete="new-password" placeholder="Mínimo 8 caracteres"
              class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-[#F69008] focus:outline-none" />
          </div>
          <div>
            <label class="mb-1 block text-xs font-medium text-slate-600">Repite la nueva contraseña</label>
            <input v-model="confirm" type="password" required autocomplete="new-password"
              class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-[#F69008] focus:outline-none" />
          </div>
        </div>

        <p v-if="error" class="mt-3 rounded-md border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-600">{{ error }}</p>

        <div class="mt-5 flex items-center justify-between">
          <button type="button" class="flex cursor-pointer items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800" @click="auth.logout()">
            <LogOut class="h-3.5 w-3.5" /> Cerrar sesión
          </button>
          <button type="submit" :disabled="saving" class="btn btn-primary">
            <Spinner v-if="saving" :size="15" light />
            {{ saving ? 'Guardando…' : 'Guardar y continuar' }}
          </button>
        </div>
      </form>
    </div>
  </Teleport>
</template>
