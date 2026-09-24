<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { ArrowLeft, CheckCircle2, WifiOff, QrCode, Loader2, RefreshCw, Smartphone, MessageCircle } from 'lucide-vue-next';
import { api } from '../../api';
import { useDialog } from '../../composables/useDialog';
import type { WAInstance } from '../../types';
import Spinner from '../../components/Spinner.vue';
import { useWs } from '../../composables/useWs';

const { alert, confirm } = useDialog();
const router = useRouter();
const route = useRoute();
const { on } = useWs();

const id = route.params.id as string;
const instance = ref<WAInstance | null>(null);
const loading = ref(true);
const qrImage = ref<string | null>(null);
const loadingQr = ref(false);
const connecting = ref(false);
const disconnecting = ref(false);

const linkMode = ref<'qr' | 'code'>('qr');
const pairingPhone = ref('');
const pairingCode = ref('');
const pairingError = ref('');
const requestingCode = ref(false);

let qrTimer: ReturnType<typeof setInterval> | null = null;

on('wa:status', (raw) => {
  const { status, instanceId } = raw as { status: string; instanceId?: string };
  if (instanceId !== id) return;
  if (instance.value) instance.value.session_status = status as WAInstance['session_status'];
  if (status === 'qr' && linkMode.value === 'qr') fetchQr();
  if (status === 'connected') { qrImage.value = null; pairingCode.value = ''; stopQrPolling(); }
});

async function load() {
  loading.value = true;
  try {
    const res = await api.get<{ instances: WAInstance[] }>('/wa/instances');
    instance.value = res.instances.find(i => i.id === id) ?? null;
    if (!instance.value) { router.replace('/settings/whatsapp'); return; }
    const synced = await api.post<{ status: string }>(`/wa/instances/${id}/sync`, {}).catch(() => null);
    if (synced && instance.value) instance.value.session_status = synced.status as WAInstance['session_status'];
    if (instance.value?.session_status === 'qr') fetchQr();
  } finally {
    loading.value = false;
  }
}

async function connect() {
  connecting.value = true;
  try {
    await api.post(`/wa/instances/${id}/connect`, {});
    if (instance.value) instance.value.session_status = 'qr';
    await fetchQr();
    startQrPolling();
  } catch (e: unknown) {
    await alert(e instanceof Error ? e.message : 'Error al conectar');
  } finally {
    connecting.value = false;
  }
}

async function disconnect() {
  if (!await confirm('¿Desconectar este número de WhatsApp? Necesitarás escanear el QR de nuevo.', 'Desconectar WhatsApp')) return;
  disconnecting.value = true;
  try {
    await api.post(`/wa/instances/${id}/disconnect`, {});
    qrImage.value = null;
    stopQrPolling();
    await load();
  } catch (e: unknown) {
    await alert(e instanceof Error ? e.message : 'Error al desconectar');
  } finally {
    disconnecting.value = false;
  }
}

async function fetchQr() {
  loadingQr.value = true;
  try {
    const data = await api.get<{ qr: string }>(`/wa/instances/${id}/qr`);
    qrImage.value = data.qr;
  } catch {
    qrImage.value = null;
  } finally {
    loadingQr.value = false;
  }
}

function startQrPolling() {
  stopQrPolling();
  qrTimer = setInterval(() => {
    if (instance.value?.session_status === 'qr') fetchQr();
    else stopQrPolling();
  }, 20_000);
}
function stopQrPolling() {
  if (qrTimer) { clearInterval(qrTimer); qrTimer = null; }
}

async function requestPairingCode() {
  pairingError.value = '';
  const phone = pairingPhone.value.replace(/\D/g, '');
  if (phone.length < 6 || phone.length > 15) {
    pairingError.value = 'Ingresa el número en formato internacional (solo dígitos), ej: 584141234567';
    return;
  }
  requestingCode.value = true;
  try {
    const res = await api.post<{ pairingCode: string }>(`/wa/instances/${id}/pairing-code`, { phoneNumber: phone });
    pairingCode.value = res.pairingCode;
  } catch (e: unknown) {
    pairingError.value = e instanceof Error ? e.message : 'Error al solicitar código';
  } finally {
    requestingCode.value = false;
  }
}

onMounted(load);
onUnmounted(stopQrPolling);

const statusMeta: Record<string, { label: string; icon: unknown; cls: string }> = {
  connected:    { label: 'Conectado',     icon: CheckCircle2, cls: 'text-emerald-600 bg-emerald-50 border-emerald-200' },
  connecting:   { label: 'Conectando…',   icon: Loader2,      cls: 'text-blue-600 bg-blue-50 border-blue-200' },
  qr:           { label: 'Esperando QR',  icon: QrCode,       cls: 'text-amber-600 bg-amber-50 border-amber-200' },
  disconnected: { label: 'Desconectado',  icon: WifiOff,      cls: 'text-slate-500 bg-slate-50 border-slate-200' },
};
function statusInfo(s: string) {
  return statusMeta[s] ?? { label: s, icon: WifiOff, cls: 'text-slate-500 bg-slate-50 border-slate-200' };
}
</script>

<template>
  <div class="flex flex-col min-h-full bg-[#F1F5F9]">
    <!-- Toolbar -->
    <div class="page-toolbar">
      <div class="flex items-center gap-3">
        <button
          class="flex cursor-pointer items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm text-slate-600 hover:bg-white hover:text-slate-900 transition-colors"
          @click="router.push('/settings/whatsapp')"
        >
          <ArrowLeft class="h-4 w-4" />
          <span class="hidden sm:inline">Volver</span>
        </button>
        <span class="text-slate-300">/</span>
        <h1 class="text-base font-semibold text-slate-900">
          {{ instance?.display_name ?? 'WhatsApp' }}
        </h1>
      </div>
    </div>

    <!-- Content -->
    <div class="flex-1 overflow-auto">
      <div v-if="loading" class="flex justify-center py-24">
        <Spinner :size="36" />
      </div>

      <div v-else-if="instance" class="mx-auto max-w-xl space-y-4 p-4 sm:p-6">
        <!-- Estado de sesión -->
        <div class="rounded-xl border bg-white p-4" :class="statusInfo(instance.session_status).cls">
          <div class="flex items-center justify-between gap-3">
            <div class="flex items-center gap-3">
              <div class="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-white shadow-sm">
                <component :is="statusInfo(instance.session_status).icon" class="h-5 w-5"
                  :class="instance.session_status === 'connecting' ? 'animate-spin' : ''" />
              </div>
              <div>
                <p class="text-sm font-semibold">{{ statusInfo(instance.session_status).label }}</p>
                <p class="text-xs opacity-70">{{ instance.display_name }}</p>
              </div>
            </div>
            <div class="flex items-center gap-2">
              <button
                v-if="instance.session_status === 'disconnected'"
                :disabled="connecting"
                class="flex cursor-pointer items-center gap-1.5 rounded-lg bg-[#25D366] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60 hover:bg-[#1ea855] transition-colors"
                @click="connect"
              >
                <Spinner v-if="connecting" :size="12" light />
                <span v-else>Conectar</span>
              </button>
              <button
                v-if="instance.session_status !== 'disconnected'"
                :disabled="disconnecting"
                class="flex cursor-pointer items-center gap-1.5 rounded-lg border border-current/30 bg-white/60 px-3 py-1.5 text-xs font-semibold disabled:opacity-60 hover:bg-white transition-colors"
                @click="disconnect"
              >
                <Spinner v-if="disconnecting" :size="12" />
                <span v-else>Desconectar</span>
              </button>
            </div>
          </div>
        </div>

        <!-- Panel de vinculación (QR o código) -->
        <Transition name="expand">
          <div v-if="instance.session_status === 'qr'" class="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
            <h2 class="text-sm font-semibold text-slate-700">Vincular número</h2>

            <!-- Tabs QR / Código -->
            <div class="flex gap-1 rounded-lg bg-slate-100 p-1">
              <button
                class="flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-medium transition-colors"
                :class="linkMode === 'qr' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500 hover:text-slate-700'"
                @click="linkMode = 'qr'; fetchQr()"
              >
                <QrCode class="h-3.5 w-3.5" /> Escanear QR
              </button>
              <button
                class="flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-medium transition-colors"
                :class="linkMode === 'code' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500 hover:text-slate-700'"
                @click="linkMode = 'code'; pairingCode = ''; pairingError = ''"
              >
                <Smartphone class="h-3.5 w-3.5" /> Vincular con código
              </button>
            </div>

            <!-- QR -->
            <div v-if="linkMode === 'qr'" class="flex flex-col items-center gap-3">
              <p class="text-center text-xs text-slate-500">
                WhatsApp → Dispositivos vinculados → Vincular dispositivo → Escanea este QR
              </p>
              <div class="relative rounded-xl border border-slate-200 bg-slate-50 p-3">
                <img v-if="qrImage" :src="qrImage" alt="QR WhatsApp" class="h-52 w-52 rounded-lg" />
                <div v-else class="flex h-52 w-52 items-center justify-center">
                  <Spinner v-if="loadingQr" :size="32" />
                  <QrCode v-else class="h-14 w-14 text-slate-200" />
                </div>
              </div>
              <button
                class="flex cursor-pointer items-center gap-1.5 text-xs text-slate-400 hover:text-slate-700 transition-colors"
                @click="fetchQr"
              >
                <RefreshCw class="h-3.5 w-3.5" /> Actualizar QR
              </button>
            </div>

            <!-- Código de teléfono -->
            <div v-else class="space-y-3">
              <p class="text-xs text-slate-500">
                WhatsApp → Dispositivos vinculados → Vincular dispositivo →
                <strong>Vincular con número de teléfono</strong>.
                Ingresa el número de tu cuenta en formato internacional.
              </p>
              <div class="flex gap-2">
                <input
                  v-model="pairingPhone"
                  type="tel"
                  placeholder="584141234567 (solo dígitos)"
                  class="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-[#25D366] focus:ring-2 focus:ring-[#25D366]/30 focus:outline-none"
                  @keyup.enter="requestPairingCode"
                />
                <button
                  :disabled="requestingCode || !pairingPhone"
                  class="flex cursor-pointer items-center gap-1.5 rounded-lg bg-[#25D366] px-3 py-2 text-xs font-semibold text-white disabled:opacity-60 hover:bg-[#1ea855] transition-colors"
                  @click="requestPairingCode"
                >
                  <Spinner v-if="requestingCode" :size="12" light />
                  <span v-else>Obtener código</span>
                </button>
              </div>
              <p v-if="pairingError" class="text-xs text-red-500">{{ pairingError }}</p>
              <div v-if="pairingCode" class="rounded-xl border-2 border-[#25D366] bg-[#f0fdf4] p-4 text-center">
                <p class="mb-1 text-xs font-medium text-slate-500">Ingresa este código en WhatsApp</p>
                <p class="font-mono text-3xl font-bold tracking-widest text-slate-800">{{ pairingCode }}</p>
                <p class="mt-1 text-xs text-slate-400">El código expira en ~60 segundos</p>
              </div>
            </div>
          </div>
        </Transition>

        <!-- Conectado: info -->
        <div v-if="instance.session_status === 'connected'" class="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <div class="flex items-center gap-2.5">
            <MessageCircle class="h-5 w-5 text-emerald-600" />
            <div>
              <p class="text-sm font-semibold text-emerald-800">Número activo</p>
              <p class="text-xs text-emerald-600">Los mensajes de WhatsApp están siendo recibidos en tiempo real.</p>
            </div>
          </div>
        </div>
      </div>

      <!-- Instancia no encontrada -->
      <div v-else class="flex flex-col items-center justify-center py-24 text-slate-400">
        <MessageCircle class="mb-2 h-10 w-10 opacity-30" />
        <p class="text-sm">Instancia no encontrada</p>
        <button class="mt-2 text-xs text-primary hover:underline cursor-pointer" @click="router.push('/settings/whatsapp')">
          Volver
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.expand-enter-active, .expand-leave-active { transition: all 0.2s ease; }
.expand-enter-from, .expand-leave-to { opacity: 0; transform: translateY(-4px); }
</style>
