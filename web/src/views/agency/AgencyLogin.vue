<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { Lock, Mail, Eye, EyeOff } from 'lucide-vue-next';
import { useAgencyStore } from '../../stores/agency';

const agency = useAgencyStore();
const router = useRouter();

const email = ref('agency@crm.local');
const password = ref('agency2024');
const showPass = ref(false);
const error = ref('');
const loading = ref(false);

async function submit() {
  error.value = '';
  loading.value = true;
  try {
    await agency.login(email.value, password.value);
    router.push('/agency/dashboard');
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Error inesperado';
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="flex min-h-screen bg-white">
    <!-- Left panel: branding -->
    <div class="hidden lg:flex lg:w-1/2 flex-col items-center justify-center bg-gradient-to-br from-[#111827] via-[#1c2333] to-[#111827] p-12 relative overflow-hidden">
      <!-- Decorative blobs -->
      <div class="absolute -top-32 -left-32 h-96 w-96 rounded-full bg-[#F69008]/10 blur-3xl"></div>
      <div class="absolute -bottom-32 -right-32 h-96 w-96 rounded-full bg-[#D97706]/10 blur-3xl"></div>

      <div class="relative z-10 text-center">
        <img src="/isotipo.png" alt="Rocco" class="mx-auto mb-6 h-24 w-24 object-contain drop-shadow-2xl" />
        <h2 class="mb-3 text-4xl font-bold text-white tracking-tight">Rocco</h2>
        <p class="text-slate-400 text-lg max-w-xs mx-auto leading-relaxed">
          Gestiona todos tus clientes de CRM desde un solo lugar.
        </p>

        <div class="mt-12 grid grid-cols-3 gap-4 text-center">
          <div class="rounded-xl bg-white/5 border border-white/10 p-4">
            <p class="text-2xl font-bold text-[#F69008]">∞</p>
            <p class="text-xs text-slate-500 mt-1">Clientes</p>
          </div>
          <div class="rounded-xl bg-white/5 border border-white/10 p-4">
            <p class="text-2xl font-bold text-emerald-300">24/7</p>
            <p class="text-xs text-slate-500 mt-1">Disponible</p>
          </div>
          <div class="rounded-xl bg-white/5 border border-white/10 p-4">
            <p class="text-2xl font-bold text-amber-300">100%</p>
            <p class="text-xs text-slate-500 mt-1">Privado</p>
          </div>
        </div>
      </div>
    </div>

    <!-- Right panel: form -->
    <div class="flex w-full lg:w-1/2 flex-col items-center justify-center bg-white px-6 py-12">
      <div class="w-full max-w-sm">
        <!-- Mobile logo -->
        <div class="mb-8 flex items-center gap-3 lg:hidden">
          <img src="/isotipo.png" alt="Rocco" class="h-10 w-10 object-contain" />
          <img src="/logo.png" alt="Rocco" class="h-7 object-contain" />
        </div>

        <h1 class="mb-1 text-2xl font-bold text-slate-900">Iniciar sesión</h1>
        <p class="mb-8 text-slate-500 text-sm">Accede al backoffice de agencia</p>

        <form class="space-y-5" @submit.prevent="submit">
          <div>
            <label class="mb-1.5 block text-sm font-medium text-slate-700">Email</label>
            <div class="relative">
              <Mail class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                v-model="email"
                type="email"
                required
                autocomplete="email"
                class="w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-10 pr-4 text-sm text-slate-900 placeholder-slate-400 focus:border-[#F69008] focus:ring-2 focus:ring-[#F69008]/20 focus:outline-none transition-all"
                placeholder="admin@agencia.com"
              />
            </div>
          </div>

          <div>
            <label class="mb-1.5 block text-sm font-medium text-slate-700">Contraseña</label>
            <div class="relative">
              <Lock class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                v-model="password"
                :type="showPass ? 'text' : 'password'"
                required
                autocomplete="current-password"
                class="w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-10 pr-10 text-sm text-slate-900 placeholder-slate-400 focus:border-[#F69008] focus:ring-2 focus:ring-[#F69008]/20 focus:outline-none transition-all"
                placeholder="••••••••"
              />
              <button
                type="button"
                class="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                @click="showPass = !showPass"
              >
                <Eye v-if="!showPass" class="h-4 w-4" />
                <EyeOff v-else class="h-4 w-4" />
              </button>
            </div>
          </div>

          <div
            v-if="error"
            class="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-sm text-red-400"
          >
            <span class="flex-1">{{ error }}</span>
          </div>

          <button
            type="submit"
            :disabled="loading"
            class="w-full cursor-pointer rounded-lg bg-[#F69008] hover:bg-[#D97706] py-2.5 text-sm font-semibold text-white shadow-lg shadow-orange-900/20 transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {{ loading ? 'Verificando…' : 'Iniciar sesión' }}
          </button>
        </form>

        <p class="mt-8 text-center text-xs text-slate-400">
          Acceso exclusivo para administradores de la agencia
        </p>
      </div>
    </div>
  </div>
</template>
