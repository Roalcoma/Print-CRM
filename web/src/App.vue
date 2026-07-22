<script setup lang="ts">
import { useAuthStore } from './stores/auth';

// Al abrir/recargar la app, rehidrata la sesión desde la cuenta.
useAuthStore().init();
</script>

<template>
  <RouterView />
</template>
