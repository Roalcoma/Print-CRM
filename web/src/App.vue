<script setup lang="ts">
import { useAuthStore } from './stores/auth';
import AppDialog from './components/AppDialog.vue';

useAuthStore().init();
</script>

<template>
  <RouterView />
  <AppDialog />
</template>
