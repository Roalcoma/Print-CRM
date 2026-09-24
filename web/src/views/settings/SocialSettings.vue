<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { useRoute } from 'vue-router';
import { Share2, Facebook, Instagram, CheckCircle2, AlertCircle, Loader2, Unlink, ExternalLink } from 'lucide-vue-next';
import { api } from '../../api';

interface SocialConnection {
  id: string;
  platform: 'facebook' | 'instagram';
  page_id: string;
  page_name: string;
  page_picture: string | null;
  instagram_business_id: string | null;
  status: string;
  token_expires_at: string | null;
  created_at: string;
}

const route = useRoute();
const connections = ref<SocialConnection[]>([]);
const loading = ref(true);
const connecting = ref(false);
const disconnecting = ref<string | null>(null);

const toast = ref('');
const toastType = ref<'success' | 'error'>('success');
let toastTimer: ReturnType<typeof setTimeout>;
function showToast(msg: string, type: 'success' | 'error' = 'success') {
  toast.value = msg;
  toastType.value = type;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.value = ''; }, 4000);
}

const webhookUrl = `${window.location.origin}/api/meta/webhook`;
const fbConnections = computed(() => connections.value.filter(c => c.platform === 'facebook'));
const igConnections = computed(() => connections.value.filter(c => c.platform === 'instagram'));

async function loadConnections() {
  try {
    const res = await api.get<{ connections: SocialConnection[] }>('/social/connections');
    connections.value = res.connections;
  } catch {
    showToast('Error al cargar conexiones', 'error');
  } finally {
    loading.value = false;
  }
}

async function connectFacebook() {
  connecting.value = true;
  try {
    const res = await api.get<{ url: string }>('/social/facebook/auth-url');
    window.location.href = res.url;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Error al iniciar conexión';
    showToast(msg, 'error');
    connecting.value = false;
  }
}

async function connectInstagram() {
  connecting.value = true;
  try {
    const res = await api.get<{ url: string }>('/social/instagram/auth-url');
    window.location.href = res.url;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Error al iniciar conexión';
    showToast(msg, 'error');
    connecting.value = false;
  }
}

async function disconnect(conn: SocialConnection) {
  if (disconnecting.value) return;
  disconnecting.value = conn.id;
  try {
    await api.del(`/social/connections/${conn.id}`);
    connections.value = connections.value.filter(c => c.id !== conn.id);
    showToast(`${conn.page_name} desconectado`);
  } catch {
    showToast('Error al desconectar', 'error');
  } finally {
    disconnecting.value = null;
  }
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('es-VE', { day: '2-digit', month: 'short', year: 'numeric' });
}

onMounted(() => {
  loadConnections();
  if (route.query.connected === 'facebook') {
    showToast('Facebook conectado correctamente');
  } else if (route.query.connected === 'instagram') {
    showToast('Instagram conectado correctamente');
  } else if (route.query.error === 'oauth_denied') {
    showToast('Autorización cancelada', 'error');
  } else if (route.query.error) {
    showToast('Error al conectar con Facebook', 'error');
  }
});
</script>

<template>
  <div class="flex flex-col h-full overflow-auto">
    <!-- Toolbar -->
    <div class="page-toolbar">
      <div class="flex items-center gap-3">
        <Share2 class="h-5 w-5 text-slate-400" />
        <h1 class="text-base font-semibold text-slate-800">Redes Sociales</h1>
      </div>
      <div class="flex items-center gap-2">
        <button class="btn btn-secondary btn-sm" :disabled="!!connecting" @click="connectInstagram">
          <Loader2 v-if="connecting" class="h-4 w-4 animate-spin" />
          <Instagram v-else class="h-4 w-4" />
          {{ connecting ? 'Redirigiendo…' : 'Conectar Instagram' }}
        </button>
        <button class="btn btn-primary btn-sm" :disabled="!!connecting" @click="connectFacebook">
          <Loader2 v-if="connecting" class="h-4 w-4 animate-spin" />
          <Facebook v-else class="h-4 w-4" />
          {{ connecting ? 'Redirigiendo…' : 'Conectar Facebook' }}
        </button>
      </div>
    </div>

    <!-- Toast -->
    <Transition name="toast">
      <div
        v-if="toast"
        class="fixed top-4 right-4 z-50 flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-medium shadow-lg"
        :class="toastType === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-500 text-white'"
      >
        <CheckCircle2 v-if="toastType === 'success'" class="h-4 w-4" />
        <AlertCircle v-else class="h-4 w-4" />
        {{ toast }}
      </div>
    </Transition>

    <div class="flex-1 p-6 space-y-6 max-w-3xl">

      <!-- Loading -->
      <div v-if="loading" class="flex justify-center py-12">
        <Loader2 class="h-6 w-6 animate-spin text-slate-300" />
      </div>

      <template v-else>

        <!-- Facebook Messenger -->
        <div class="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div class="flex items-start gap-4 p-5 border-b border-slate-100">
            <div class="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-[#1877F2]/10">
              <Facebook class="h-5 w-5 text-[#1877F2]" />
            </div>
            <div class="flex-1">
              <h3 class="font-semibold text-slate-800">Facebook Pages</h3>
              <p class="text-sm text-slate-500 mt-0.5">Conecta tus páginas de Facebook para recibir mensajes de Messenger directamente en el CRM.</p>
            </div>
          </div>

          <!-- Lista de páginas conectadas -->
          <div v-if="fbConnections.length" class="divide-y divide-slate-100">
            <div
              v-for="conn in fbConnections"
              :key="conn.id"
              class="flex items-center gap-3 px-5 py-3.5"
            >
              <img
                v-if="conn.page_picture"
                :src="conn.page_picture"
                :alt="conn.page_name"
                class="h-9 w-9 rounded-full object-cover flex-shrink-0"
              />
              <div
                v-else
                class="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-[#1877F2]/10 text-sm font-bold text-[#1877F2]"
              >
                {{ conn.page_name[0] }}
              </div>
              <div class="flex-1 min-w-0">
                <p class="text-sm font-medium text-slate-800 truncate">{{ conn.page_name }}</p>
                <p v-if="conn.token_expires_at" class="text-xs text-slate-400">
                  Token válido hasta {{ formatDate(conn.token_expires_at) }}
                </p>
              </div>
              <span class="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
                <span class="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
                Activo
              </span>
              <button
                class="ml-2 flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:border-red-200 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                :disabled="disconnecting === conn.id"
                @click="disconnect(conn)"
              >
                <Loader2 v-if="disconnecting === conn.id" class="h-3.5 w-3.5 animate-spin" />
                <Unlink v-else class="h-3.5 w-3.5" />
                Desconectar
              </button>
            </div>
          </div>

          <!-- Estado vacío Facebook -->
          <div v-else class="flex flex-col items-center py-10 px-4 text-center">
            <div class="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 mb-3">
              <Facebook class="h-6 w-6 text-slate-300" />
            </div>
            <p class="text-sm font-medium text-slate-500">Sin páginas conectadas</p>
            <p class="text-xs text-slate-400 mt-1 max-w-xs">Haz clic en "Conectar cuenta" para vincular tus páginas de Facebook y empezar a recibir mensajes.</p>
            <button class="btn btn-primary mt-4" :disabled="connecting" @click="connectFacebook">
              <Loader2 v-if="connecting" class="h-4 w-4 animate-spin" />
              <Facebook v-else class="h-4 w-4" />
              Conectar con Facebook
            </button>
          </div>
        </div>

        <!-- Instagram Business -->
        <div class="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div class="flex items-start gap-4 p-5 border-b border-slate-100">
            <div class="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl"
              style="background: linear-gradient(135deg, #f9a825 0%, #e91e63 60%, #9c27b0 100%); opacity: 0.9;">
              <Instagram class="h-5 w-5 text-white" />
            </div>
            <div class="flex-1">
              <h3 class="font-semibold text-slate-800">Instagram Business</h3>
              <p class="text-sm text-slate-500 mt-0.5">Recibe DMs de Instagram Business directamente en el CRM. Conéctate con el botón "Conectar Instagram" o vincula tu cuenta a través de Facebook.</p>
            </div>
          </div>

          <!-- Lista de cuentas IG conectadas -->
          <div v-if="igConnections.length" class="divide-y divide-slate-100">
            <div
              v-for="conn in igConnections"
              :key="conn.id"
              class="flex items-center gap-3 px-5 py-3.5"
            >
              <img
                v-if="conn.page_picture"
                :src="conn.page_picture"
                :alt="conn.page_name"
                class="h-9 w-9 rounded-full object-cover flex-shrink-0"
              />
              <div
                v-else
                class="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
                style="background: linear-gradient(135deg, #f9a825, #e91e63);"
              >
                {{ conn.page_name[0] }}
              </div>
              <div class="flex-1 min-w-0">
                <p class="text-sm font-medium text-slate-800 truncate">{{ conn.page_name }}</p>
                <p class="text-xs text-slate-400">
                  {{ conn.token_expires_at ? `Token válido hasta ${formatDate(conn.token_expires_at)}` : 'Token sin expiración' }}
                </p>
              </div>
              <span class="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
                <span class="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
                Activo
              </span>
              <button
                class="ml-2 flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:border-red-200 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                :disabled="disconnecting === conn.id"
                @click="disconnect(conn)"
              >
                <Loader2 v-if="disconnecting === conn.id" class="h-3.5 w-3.5 animate-spin" />
                <Unlink v-else class="h-3.5 w-3.5" />
                Desconectar
              </button>
            </div>
          </div>

          <!-- Estado vacío Instagram -->
          <div v-else class="flex flex-col items-center py-10 px-4 text-center">
            <div class="flex h-12 w-12 items-center justify-center rounded-full mb-3"
              style="background: linear-gradient(135deg, #f9a825 0%, #e91e63 60%, #9c27b0 100%); opacity: 0.15;">
              <Instagram class="h-6 w-6 text-slate-400" />
            </div>
            <p class="text-sm font-medium text-slate-500">Sin cuentas de Instagram conectadas</p>
            <p class="text-xs text-slate-400 mt-1 max-w-xs">
              Instagram se conecta automáticamente cuando vinculas una página de Facebook que tenga una cuenta de
              <span class="font-medium">Instagram Business</span> asociada.
            </p>
            <a
              href="https://www.facebook.com/help/1148909221857370"
              target="_blank"
              class="mt-3 inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
            >
              ¿Cómo vincular Instagram a mi página de Facebook?
              <ExternalLink class="h-3 w-3" />
            </a>
          </div>
        </div>

        <!-- URL del webhook (referencia) -->
        <div class="rounded-xl border border-slate-200 bg-slate-50 px-5 py-4 text-sm text-slate-600">
          <p class="font-medium mb-1 text-slate-700">URL del Webhook</p>
          <p class="text-slate-500 mb-2">Registra esta URL en Meta Developers para recibir mensajes en tiempo real:</p>
          <code class="block bg-white border border-slate-200 px-3 py-2 rounded-lg text-xs font-mono text-slate-700 select-all">{{ webhookUrl }}</code>
        </div>

      </template>
    </div>
  </div>
</template>

<style scoped>
.toast-enter-active { transition: all 0.2s ease; }
.toast-leave-active { transition: all 0.15s ease; }
.toast-enter-from  { opacity: 0; transform: translateY(-8px); }
.toast-leave-to    { opacity: 0; transform: translateY(-8px); }
</style>
