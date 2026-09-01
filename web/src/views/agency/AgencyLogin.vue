<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { Building2, Lock, Mail, Eye, EyeOff } from 'lucide-vue-next';
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
  <div class="flex min-h-screen bg-slate-950">
    <!-- Left panel: branding -->
    <div class="hidden lg:flex lg:w-1/2 flex-col items-center justify-center bg-gradient-to-br from-violet-900 via-indigo-900 to-slate-900 p-12 relative overflow-hidden">
      <!-- Decorative circles -->
      <div class="absolute -top-32 -left-32 h-96 w-96 rounded-full bg-violet-600/10 blur-3xl"></div>
      <div class="absolute -bottom-32 -right-32 h-96 w-96 rounded-full bg-indigo-600/10 blur-3xl"></div>

      <div class="relative z-10 text-center">
        <div class="mx-auto mb-8 flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 shadow-2xl shadow-violet-900/60">
          <Building2 class="h-10 w-10 text-white" />
        </div>
        <h2 class="mb-3 text-4xl font-bold text-white tracking-tight">Agency Panel</h2>
        <p class="text-slate-400 text-lg max-w-xs mx-auto leading-relaxed">
          Gestiona todos tus clientes de CRM desde un solo lugar.
        </p>

        <div class="mt-12 grid grid-cols-3 gap-4 text-center">
          <div class="rounded-xl bg-white/5 border border-white/10 p-4">
            <p class="text-2xl font-bold text-violet-300">∞</p>
            <p class="text-xs text-slate-500 mt-1">Clientes</p>
          </div>
          <div class="rounded-xl bg-white/5 border border-white/10 p-4">
            <p class="text-2xl font-bold text-emerald-300">24/7</p>
            <p class="text-xs text-slate-500 mt-1">Disponible</p>
          </div>
          <div class="rounded-xl bg-white/5 border border-white/10 p-4">
            <p class="text-2xl font-bold text-indigo-300">100%</p>
            <p class="text-xs text-slate-500 mt-1">Privado</p>
          </div>
        </div>
      </div>
    </div>

    <!-- Right panel: form -->
    <div class="flex w-full lg:w-1/2 flex-col items-center justify-center px-6 py-12">
      <div class="w-full max-w-sm">
        <!-- Mobile logo -->
        <div class="mb-8 flex items-center gap-3 lg:hidden">
          <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600">
            <Building2 class="h-5 w-5 text-white" />
          </div>
          <span class="text-xl font-bold text-white">Agency Panel</span>
        </div>

        <h1 class="mb-1 text-2xl font-bold text-white">Iniciar sesión</h1>
        <p class="mb-8 text-slate-400 text-sm">Accede al backoffice de agencia</p>

        <form class="space-y-5" @submit.prevent="submit">
          <div>
            <label class="mb-1.5 block text-sm font-medium text-slate-300">Email</label>
            <div class="relative">
              <Mail class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <input
                v-model="email"
                type="email"
                required
                autocomplete="email"
                class="w-full rounded-lg border border-slate-700 bg-slate-800/60 py-2.5 pl-10 pr-4 text-sm text-slate-100 placeholder-slate-500 focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 focus:outline-none transition-all"
                placeholder="admin@agencia.com"
              />
            </div>
          </div>

          <div>
            <label class="mb-1.5 block text-sm font-medium text-slate-300">Contraseña</label>
            <div class="relative">
              <Lock class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <input
                v-model="password"
                :type="showPass ? 'text' : 'password'"
                required
                autocomplete="current-password"
                class="w-full rounded-lg border border-slate-700 bg-slate-800/60 py-2.5 pl-10 pr-10 text-sm text-slate-100 placeholder-slate-500 focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 focus:outline-none transition-all"
                placeholder="••••••••"
              />
              <button
                type="button"
                class="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
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
            class="w-full cursor-pointer rounded-lg bg-gradient-to-r from-violet-600 to-indigo-600 py-2.5 text-sm font-semibold text-white shadow-lg shadow-violet-900/40 transition-all duration-200 hover:from-violet-500 hover:to-indigo-500 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {{ loading ? 'Verificando…' : 'Iniciar sesión' }}
          </button>
        </form>

        <p class="mt-8 text-center text-xs text-slate-600">
          Acceso exclusivo para administradores de la agencia
        </p>
      </div>
    </div>
  </div>
</template>
