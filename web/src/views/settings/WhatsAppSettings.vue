<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { Plus, Trash2, CheckCircle2, WifiOff, Loader2, QrCode, Star, MessageCircle, Settings2 } from 'lucide-vue-next';
import { api } from '../../api';
import { useDialog } from '../../composables/useDialog';
import type { WAInstance } from '../../types';
import Spinner from '../../components/Spinner.vue';
import { useWs } from '../../composables/useWs';

const { alert, confirm } = useDialog();
const router = useRouter();
const { on } = useWs();

const instances = ref<WAInstance[]>([]);
const loading = ref(true);
const creating = ref(false);
const deletingId = ref<string | null>(null);

on('wa:status', (raw) => {
  const { status, instanceId } = raw as { status: string; instanceId?: string };
  const inst = instances.value.find(i => i.id === instanceId);
  if (inst) inst.session_status = status as WAInstance['session_status'];
});

async function load() {
  loading.value = true;
  try {
    const res = await api.get<{ instances: WAInstance[] }>('/wa/instances');
    instances.value = res.instances;
  } finally {
    loading.value = false;
  }
}

async function addInstance() {
  creating.value = true;
  try {
    await api.post('/wa/instances', {});
    await load();
  } catch (e: unknown) {
    await alert(e instanceof Error ? e.message : 'Error al crear instancia');
  } finally {
    creating.value = false;
  }
}

async function deleteInstance(id: string) {
  if (!await confirm('¿Eliminar esta instancia de WhatsApp?', 'Eliminar instancia')) return;
  deletingId.value = id;
  try {
    await api.del(`/wa/instances/${id}`);
    await load();
  } catch (e: unknown) {
    await alert(e instanceof Error ? e.message : 'Error al eliminar');
  } finally {
    deletingId.value = null;
  }
}

async function makeDefault(id: string) {
  await api.post(`/wa/instances/${id}/default`, {});
  instances.value.forEach(i => { i.is_default = i.id === id; });
}

onMounted(load);

const statusMeta: Record<string, { label: string; cls: string }> = {
  connected:    { label: 'Conectado',    cls: 'bg-emerald-100 text-emerald-700' },
  connecting:   { label: 'Conectando…', cls: 'bg-blue-100 text-blue-700' },
  qr:           { label: 'Esperando QR', cls: 'bg-amber-100 text-amber-700' },
  disconnected: { label: 'Desconectado', cls: 'bg-slate-100 text-slate-500' },
};
function statusInfo(s: string) {
  return statusMeta[s] ?? { label: s, cls: 'bg-slate-100 text-slate-500' };
}
</script>

<template>
  <div class="space-y-6 p-4 sm:p-6">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <div>
        <h2 class="text-base font-semibold text-slate-900">WhatsApp</h2>
        <p class="mt-0.5 text-sm text-slate-500">Conecta hasta 2 números de WhatsApp a tu CRM.</p>
      </div>
      <button
        v-if="instances.length < 2"
        :disabled="creating"
        class="flex cursor-pointer items-center gap-1.5 rounded-lg bg-[#25D366] px-3 py-2 text-sm font-semibold text-white disabled:opacity-60 hover:bg-[#1ea855] transition-colors"
        @click="addInstance"
      >
        <Spinner v-if="creating" :size="14" light />
        <Plus v-else class="h-4 w-4" />
        Agregar número
      </button>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="flex justify-center py-16">
      <Spinner :size="32" />
    </div>

    <!-- Lista de instancias -->
    <div v-else class="space-y-3">
      <div
        v-for="inst in instances"
        :key="inst.id"
        class="flex items-center gap-4 rounded-xl border border-slate-200 bg-white px-4 py-3.5 shadow-sm"
      >
        <!-- Ícono -->
        <div class="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-[#25D366]/10">
          <MessageCircle class="h-5 w-5 text-[#25D366]" />
        </div>

        <!-- Info -->
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-2 flex-wrap">
            <p class="text-sm font-semibold text-slate-800">{{ inst.display_name }}</p>
            <span
              class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium"
              :class="statusInfo(inst.session_status).cls"
            >
              <CheckCircle2 v-if="inst.session_status === 'connected'" class="h-3 w-3" />
              <Loader2 v-else-if="inst.session_status === 'connecting'" class="h-3 w-3 animate-spin" />
              <QrCode v-else-if="inst.session_status === 'qr'" class="h-3 w-3" />
              <WifiOff v-else class="h-3 w-3" />
              {{ statusInfo(inst.session_status).label }}
            </span>
            <button
              v-if="!inst.is_default && instances.length > 1"
              class="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-600 hover:bg-amber-100 cursor-pointer transition-colors"
              title="Marcar como predeterminada"
              @click="makeDefault(inst.id)"
            >
              <Star class="h-3 w-3" />
              Predeterminada
            </button>
            <span
              v-else-if="inst.is_default && instances.length > 1"
              class="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700"
            >
              <Star class="h-3 w-3 fill-amber-500" />
              Principal
            </span>
          </div>
          <p class="mt-0.5 text-xs text-slate-400">Instancia #{{ inst.instance_name || 'sin configurar' }}</p>
        </div>

        <!-- Acciones -->
        <div class="flex flex-shrink-0 items-center gap-2">
          <button
            class="flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:border-slate-300 hover:bg-slate-50 transition-colors"
            @click="router.push(`/settings/whatsapp/${inst.id}`)"
          >
            <Settings2 class="h-3.5 w-3.5" />
            Gestionar
          </button>
          <button
            v-if="instances.length > 1"
            class="flex cursor-pointer items-center justify-center rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500 transition-colors"
            :disabled="deletingId === inst.id"
            @click="deleteInstance(inst.id)"
          >
            <Spinner v-if="deletingId === inst.id" :size="14" />
            <Trash2 v-else class="h-4 w-4" />
          </button>
        </div>
      </div>

      <!-- Estado vacío (no debería ocurrir, se auto-crea) -->
      <div v-if="instances.length === 0" class="py-12 text-center text-slate-400">
        <MessageCircle class="mx-auto mb-2 h-8 w-8 opacity-30" />
        <p class="text-sm">No hay instancias configuradas.</p>
      </div>
    </div>
  </div>
</template>
