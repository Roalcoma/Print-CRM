<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { CheckCircle2, XCircle, Loader2, QrCode, RefreshCw, Wifi, WifiOff, AlertTriangle, Smartphone } from 'lucide-vue-next';
import { api } from '../../api';
import type { WASettings } from '../../types';
import Spinner from '../../components/Spinner.vue';
import { useWs } from '../../composables/useWs';

const { on } = useWs();

const settings = ref<WASettings | null>(null);
const form = ref({ evo_url: '', evo_api_key: '', instance_name: '' });
const saving = ref(false);
const loading = ref(true);
const qrImage = ref<string | null>(null);
const loadingQr = ref(false);
const connecting = ref(false);

const linkMode = ref<'qr' | 'code'>('qr');
const pairingPhone = ref('');
const pairingCode = ref('');
const pairingError = ref('');
const requestingCode = ref(false);

let qrTimer: ReturnType<typeof setInterval> | null = null;

on('wa:status', (raw) => {
  const { status } = raw as { status: string };
  if (settings.value) settings.value.session_status = status as WASettings['session_status'];
  if (status === 'qr' && linkMode.value === 'qr') fetchQr();
  if (status === 'connected') { qrImage.value = null; pairingCode.value = ''; stopQrPolling(); }
});

async function load() {
  loading.value = true;
  try {
    settings.value = await api.get<WASettings>('/wa/settings');
    form.value.evo_url = settings.value.evo_url;
    form.value.instance_name = settings.value.instance_name;
    if (settings.value.evo_url && settings.value.has_api_key) {
      const synced = await api.post<{ status: string }>('/wa/sync', {}).catch(() => null);
      if (synced && synced.status !== settings.value.session_status) {
        settings.value.session_status = synced.status as WASettings['session_status'];
      }
    }
    if (settings.value.session_status === 'qr') fetchQr();
  } finally {
    loading.value = false;
  }
}

async function save() {
  saving.value = true;
  try {
    const payload: Record<string, string> = {
      evo_url: form.value.evo_url,
      instance_name: form.value.instance_name,
    };
    if (form.value.evo_api_key) payload.evo_api_key = form.value.evo_api_key;
    await api.patch('/wa/settings', payload);
    await load();
  } finally {
    saving.value = false;
  }
}

async function connect() {
  connecting.value = true;
  try {
    await api.post('/wa/connect', {});
    // No llamamos load() porque el sync sobreescribiría el status 'qr' con el estado
    // real de Evolution API ('connecting' → 'disconnected'). Actualizamos directo.
    if (settings.value) settings.value.session_status = 'qr';
    await fetchQr();
    startQrPolling();
  } catch (e: unknown) {
    alert(e instanceof Error ? e.message : 'Error al conectar');
  } finally {
    connecting.value = false;
  }
}

async function disconnect() {
  if (!confirm('¿Desconectar WhatsApp? Necesitarás escanear el QR de nuevo.')) return;
  await api.post('/wa/disconnect', {});
  qrImage.value = null;
  stopQrPolling();
  await load();
}

async function fetchQr() {
  loadingQr.value = true;
  try {
    const data = await api.get<{ qr: string }>('/wa/qr');
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
    if (settings.value?.session_status === 'qr') fetchQr();
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
    const res = await api.post<{ pairingCode: string }>('/wa/pairing-code', { phoneNumber: phone });
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
  connected:    { label: 'Conectado',     icon: CheckCircle2, cls: 'text-emerald-600 bg-emerald-50' },
  connecting:   { label: 'Conectando…',   icon: Loader2,      cls: 'text-blue-600 bg-blue-50' },
  qr:           { label: 'Escanea el QR', icon: QrCode,       cls: 'text-amber-600 bg-amber-50' },
  disconnected: { label: 'Desconectado',  icon: WifiOff,      cls: 'text-slate-500 bg-slate-100' },
};
function statusInfo(s: string) {
  return statusMeta[s] ?? { label: s, icon: AlertTriangle, cls: 'text-slate-500 bg-slate-100' };
}
</script>

<template>
  <div class="mx-auto max-w-xl space-y-6 p-6">
    <div>
      <h1 class="text-lg font-semibold text-slate-900">Configuración de WhatsApp</h1>
      <p class="mt-1 text-sm text-slate-500">Conecta tu instancia de Evolution API para enviar y recibir mensajes de WhatsApp.</p>
    </div>

    <div v-if="loading" class="flex items-center justify-center py-12">
      <Spinner :size="32" />
    </div>

    <template v-else-if="settings">
      <!-- Estado de sesión -->
      <div class="rounded-xl border border-slate-200 bg-white p-4">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2.5">
            <div class="flex h-9 w-9 items-center justify-center rounded-lg" :class="statusInfo(settings.session_status).cls">
              <component :is="statusInfo(settings.session_status).icon" class="h-5 w-5" />
            </div>
            <div>
              <p class="text-sm font-semibold text-slate-800">{{ statusInfo(settings.session_status).label }}</p>
              <p class="text-xs text-slate-400">Instancia: {{ settings.instance_name }}</p>
            </div>
          </div>
          <div class="flex gap-2">
            <button
              v-if="settings.session_status === 'disconnected'"
              :disabled="connecting || !settings.has_api_key"
              class="flex cursor-pointer items-center gap-1.5 rounded-lg bg-[#25D366] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60 hover:bg-[#1ea855]"
              @click="connect"
            >
              <Spinner v-if="connecting" :size="12" light />
              <Wifi v-else class="h-3.5 w-3.5" />
              Conectar
            </button>
            <button
              v-if="settings.session_status !== 'disconnected'"
              class="cursor-pointer rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
              @click="disconnect"
            >
              Desconectar
            </button>
          </div>
        </div>

        <!-- Vinculación (QR o código) -->
        <Transition name="expand">
          <div v-if="settings.session_status === 'qr'" class="mt-4 space-y-3">
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

            <!-- Panel QR -->
            <div v-if="linkMode === 'qr'" class="flex flex-col items-center gap-3">
              <p class="text-center text-xs text-slate-500">WhatsApp → Dispositivos vinculados → Vincular dispositivo → Escanea este QR</p>
              <div class="relative rounded-xl border border-slate-200 p-3">
                <img v-if="qrImage" :src="qrImage" alt="QR WhatsApp" class="h-52 w-52 rounded-lg" />
                <div v-else class="flex h-52 w-52 items-center justify-center rounded-lg bg-slate-50">
                  <Spinner v-if="loadingQr" :size="32" />
                  <QrCode v-else class="h-12 w-12 text-slate-300" />
                </div>
              </div>
              <button class="flex cursor-pointer items-center gap-1.5 text-xs text-slate-500 hover:text-primary" @click="fetchQr">
                <RefreshCw class="h-3.5 w-3.5" /> Actualizar QR
              </button>
            </div>

            <!-- Panel código de teléfono -->
            <div v-else class="space-y-3">
              <p class="text-xs text-slate-500">
                WhatsApp → Dispositivos vinculados → Vincular dispositivo → <strong>Vincular con número de teléfono</strong>.
                Ingresa el número de tu cuenta de WhatsApp para obtener un código de 8 caracteres.
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
                  class="flex cursor-pointer items-center gap-1.5 rounded-lg bg-[#25D366] px-3 py-2 text-xs font-semibold text-white disabled:opacity-60 hover:bg-[#1ea855]"
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
      </div>

      <!-- Formulario de configuración -->
      <div class="rounded-xl border border-slate-200 bg-white p-4">
        <h2 class="mb-4 text-sm font-semibold text-slate-700">Configuración de Evolution API</h2>
        <form class="space-y-3" @submit.prevent="save">
          <div>
            <label class="mb-1 block text-xs font-medium text-slate-600">URL de Evolution API</label>
            <input
              v-model="form.evo_url"
              placeholder="http://localhost:8080"
              class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-primary focus:ring-2 focus:ring-primary/30 focus:outline-none"
            />
            <p class="mt-0.5 text-xs text-slate-400">La URL donde corre tu instancia de Evolution API (puerto por defecto: 8080).</p>
          </div>

          <div>
            <label class="mb-1 block text-xs font-medium text-slate-600">API Key global</label>
            <input
              v-model="form.evo_api_key"
              type="password"
              :placeholder="settings.has_api_key ? '••••••• (deja en blanco para no cambiar)' : 'Ingresa la API key de Evolution'"
              class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-primary focus:ring-2 focus:ring-primary/30 focus:outline-none"
            />
            <p class="mt-0.5 text-xs text-slate-400">La clave configurada en <code class="bg-slate-100 px-1 rounded">AUTHENTICATION_API_KEY</code> de Evolution API.</p>
          </div>

          <div>
            <label class="mb-1 block text-xs font-medium text-slate-600">Nombre de instancia</label>
            <input
              v-model="form.instance_name"
              placeholder="crm"
              class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-primary focus:ring-2 focus:ring-primary/30 focus:outline-none"
            />
            <p class="mt-0.5 text-xs text-slate-400">Nombre de la instancia en Evolution API. Se creará automáticamente si no existe.</p>
          </div>

          <div class="pt-1">
            <button type="submit" :disabled="saving" class="btn btn-primary">
              <Spinner v-if="saving" :size="14" light />
              {{ saving ? 'Guardando…' : 'Guardar configuración' }}
            </button>
          </div>
        </form>
      </div>

      <!-- Info del webhook -->
      <div class="rounded-xl border border-slate-200 bg-slate-50 p-4">
        <h2 class="mb-1 text-xs font-semibold text-slate-600 uppercase tracking-wide">Webhook (auto-configurado)</h2>
        <p class="text-xs text-slate-500">Al conectar, el CRM registra automáticamente el webhook en Evolution API para recibir mensajes en tiempo real.</p>
        <code class="mt-2 block break-all rounded bg-white px-2 py-1.5 text-[10px] text-slate-600 border border-slate-200">
          POST …/api/wa/webhook/{{ settings.webhook_secret }}
        </code>
      </div>
    </template>
  </div>
</template>
