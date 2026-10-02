<script setup lang="ts">
import { useAuthStore } from './stores/auth';
import AppDialog from './components/AppDialog.vue';
import AppToasts from './components/AppToasts.vue';

useAuthStore().init();
</script>

<template>
  <RouterView />
  <AppDialog />
  <!-- Toasts globales: CRM, agencia y página pública de reservas -->
  <AppToasts />
</template>
