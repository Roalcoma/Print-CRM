<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth';

const auth = useAuthStore();
const router = useRouter();

const mode = ref<'login' | 'register'>('login');
const email = ref('demo@crm.test');
const password = ref('demo1234');
const name = ref('');
const organizationName = ref('');
const error = ref('');
const loading = ref(false);

async function submit() {
  error.value = '';
  loading.value = true;
  try {
    if (mode.value === 'login') {
      await auth.login(email.value, password.value);
    } else {
      await auth.register({
        organizationName: organizationName.value,
        name: name.value,
        email: email.value,
        password: password.value,
      });
    }
    router.push('/dashboard');
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Error inesperado';
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="flex min-h-screen items-center justify-center bg-slate-50 px-4">
    <div class="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
      <div class="mb-6 flex items-center gap-2">
        <div class="flex h-9 w-9 items-center justify-center rounded-lg bg-primary font-bold text-white">R</div>
        <span class="text-xl font-semibold text-slate-900">Rocco</span>
      </div>

      <h1 class="mb-1 text-lg font-semibold text-slate-900">
        {{ mode === 'login' ? 'Iniciar sesión' : 'Crear cuenta' }}
      </h1>
      <p class="mb-6 text-sm text-slate-500">
        {{ mode === 'login' ? 'Accede a tu panel' : 'Registra tu organización' }}
      </p>

      <form class="space-y-4" @submit.prevent="submit">
        <template v-if="mode === 'register'">
          <div>
            <label for="org" class="mb-1 block text-sm font-medium text-slate-700">Organización</label>
            <input id="org" v-model="organizationName" required
              class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-primary focus:ring-2 focus:ring-primary/30 focus:outline-none" />
          </div>
          <div>
            <label for="name" class="mb-1 block text-sm font-medium text-slate-700">Tu nombre</label>
            <input id="name" v-model="name" required
              class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-primary focus:ring-2 focus:ring-primary/30 focus:outline-none" />
          </div>
        </template>

        <div>
          <label for="email" class="mb-1 block text-sm font-medium text-slate-700">Email</label>
          <input id="email" v-model="email" type="email" required
            class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-primary focus:ring-2 focus:ring-primary/30 focus:outline-none" />
        </div>
        <div>
          <label for="password" class="mb-1 block text-sm font-medium text-slate-700">Contraseña</label>
          <input id="password" v-model="password" type="password" required
            class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-primary focus:ring-2 focus:ring-primary/30 focus:outline-none" />
        </div>

        <p v-if="error" class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{{ error }}</p>

        <button type="submit" :disabled="loading"
          class="w-full cursor-pointer rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white transition-colors duration-200 hover:bg-primary-dark disabled:opacity-60">
          {{ loading ? 'Procesando…' : mode === 'login' ? 'Entrar' : 'Crear cuenta' }}
        </button>
      </form>

      <button
        class="mt-4 w-full cursor-pointer text-center text-sm text-slate-500 hover:text-primary"
        @click="mode = mode === 'login' ? 'register' : 'login'"
      >
        {{ mode === 'login' ? '¿No tienes cuenta? Regístrate' : '¿Ya tienes cuenta? Inicia sesión' }}
      </button>
    </div>
  </div>
</template>
