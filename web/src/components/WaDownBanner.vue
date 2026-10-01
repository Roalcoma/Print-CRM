<script setup lang="ts">
// Aviso discreto para admins cuando un WhatsApp de la organización no está conectado
// (los mensajes y leads de WhatsApp no entran). Se actualiza en vivo con el evento `wa:status`.
import { ref, computed, onMounted } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import { WifiOff, X } from 'lucide-vue-next';
import { api } from '../api';
import { useWs } from '../composables/useWs';
import type { WAInstance } from '../types';

const route = useRoute();
const { on } = useWs();
const instances = ref<WAInstance[]>([]);
const inUse = ref(false);
const dismissed = ref('');

async function load() {
  try {
    const res = await api.get<{ instances: WAInstance[]; in_use?: boolean }>('/wa/instances?nocreate=1');
    instances.value = res.instances;
    inUse.value = !!res.in_use;
  } catch { /* sin aviso si falla */ }
}
onMounted(load);
on('wa:status', (raw) => {
  const { status, instanceId } = raw as { status: WAInstance['session_status']; instanceId?: string };
  const inst = instances.value.find(i => i.id === instanceId);
  if (inst) inst.session_status = status; else load();
});

// Solo 'disconnected': 'qr' es que el admin está vinculando ahora y 'connecting' suele ser un
// parpadeo de segundos (si se queda ahí, el monitor del servidor lo pasa a 'disconnected').
const down = computed(() => inUse.value ? instances.value.filter(i => i.session_status === 'disconnected') : []);
const key = computed(() => down.value.map(i => i.id).join(','));
const visible = computed(() => down.value.length > 0 && dismissed.value !== key.value
  && !route.path.startsWith('/settings/whatsapp'));
const names = computed(() => down.value.map(i => `«${i.display_name}»`).join(' y '));
</script>

<template>
  <div
    v-if="visible"
    role="status"
    class="flex items-center gap-2 border-b border-[#F69008]/30 bg-[#F69008]/10 px-4 py-2 text-sm text-[#13243D]"
  >
    <WifiOff class="h-4 w-4 flex-shrink-0 text-[#F69008]" />
    <p class="min-w-0 flex-1">
      WhatsApp {{ names }} {{ down.length > 1 ? 'no están conectados' : 'no está conectado' }}:
      los mensajes y leads de WhatsApp no están entrando.
      <RouterLink to="/settings/whatsapp" class="font-semibold underline hover:text-[#F69008]">Reconectar</RouterLink>
    </p>
    <button
      class="cursor-pointer rounded-md p-1 text-slate-500 hover:bg-[#F69008]/15"
      title="Ocultar"
      @click="dismissed = key"
    >
      <X class="h-4 w-4" />
    </button>
  </div>
</template>
