<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { User, Lock, Save, Check, Eye, EyeOff, ExternalLink, X, Link2 } from 'lucide-vue-next';
import { api } from '../../api';
import { useAuthStore } from '../../stores/auth';
import { useDialog } from '../../composables/useDialog';
import Spinner from '../../components/Spinner.vue';

const { alert, confirm } = useDialog();
const authStore = useAuthStore();
const route = useRoute();

// ── Toast ─────────────────────────────────────────────────────────────────────
const toast     = ref('');
const toastType = ref<'success' | 'error'>('success');
let toastTimer: ReturnType<typeof setTimeout>;
function showToast(msg: string, type: 'success' | 'error' = 'success') {
  toast.value = msg; toastType.value = type;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.value = ''; }, 4000);
}

// ── Estado ────────────────────────────────────────────────────────────────────
const loading      = ref(true);
const savingProfile = ref(false);
const savedProfile  = ref(false);
const profileError  = ref('');

const savingPwd  = ref(false);
const savedPwd   = ref(false);
const pwdError   = ref('');

const form = ref({
  name: '',
  email: '',
  role: '',
  avatarColor: '' as string | null,
  createdAt: '',
});

const pwd = ref({
  current:  '',
  next:     '',
  confirm:  '',
  showCurrent: false,
  showNext:    false,
  showConfirm: false,
});

// ── Avatar ────────────────────────────────────────────────────────────────────
const COLORS = [
  '#F69008', '#60D0FA', '#10B981', '#8B5CF6',
  '#EF4444', '#F59E0B', '#3B82F6', '#EC4899', '#6366F1',
];

const initials = computed(() => {
  const n = form.value.name || 'U';
  return n.split(' ').map((w: string) => w[0]).slice(0, 2).join('').toUpperCase();
});

const avatarBg = computed(() => form.value.avatarColor ?? '#F69008');

// ── Rol ───────────────────────────────────────────────────────────────────────
const roleLabel: Record<string, string> = { owner: 'Owner', admin: 'Administrador', member: 'Miembro' };
const roleBadge: Record<string, string> = {
  owner:  'bg-sky-100 text-sky-700',
  admin:  'bg-amber-100 text-amber-700',
  member: 'bg-slate-100 text-slate-600',
};

// ── Carga inicial ─────────────────────────────────────────────────────────────
onMounted(async () => {
  try {
    const [u] = await Promise.all([
      api.get<{ id: string; name: string; email: string; role: string; avatarColor: string | null; createdAt: string }>('/me'),
      loadConnections(),
    ]);
    form.value = { name: u.name, email: u.email, role: u.role, avatarColor: u.avatarColor ?? null, createdAt: u.createdAt ?? '' };
  } finally {
    loading.value = false;
  }
  const connected = route.query.connected as string | undefined;
  if (connected === 'google') showToast('¡Google Calendar conectado!');
  else if (connected === 'zoom') showToast('¡Zoom conectado!');
});

// ── Guardar perfil ────────────────────────────────────────────────────────────
async function saveProfile() {
  profileError.value = '';
  if (!form.value.name.trim()) {
    profileError.value = 'El nombre no puede estar vacío';
    return;
  }
  savingProfile.value = true;
  try {
    const updated = await api.patch<{ name: string; avatarColor: string | null }>('/me', {
      name: form.value.name.trim(),
      avatarColor: form.value.avatarColor,
    });
    // Reflejar en el store para que header/sidebar actualicen de inmediato
    if (authStore.user) {
      authStore.user.name = updated.name;
      authStore.user.avatarColor = updated.avatarColor ?? null;
    }
    savedProfile.value = true;
    setTimeout(() => { savedProfile.value = false; }, 2000);
  } catch (e) {
    profileError.value = e instanceof Error ? e.message : 'No se pudo guardar';
  } finally {
    savingProfile.value = false;
  }
}

// ── Cambiar contraseña ────────────────────────────────────────────────────────
async function changePassword() {
  pwdError.value = '';
  if (!pwd.value.current) { pwdError.value = 'Ingresa tu contraseña actual'; return; }
  if (pwd.value.next.length < 8) { pwdError.value = 'La nueva contraseña debe tener al menos 8 caracteres'; return; }
  if (pwd.value.next !== pwd.value.confirm) { pwdError.value = 'Las contraseñas nuevas no coinciden'; return; }

  savingPwd.value = true;
  try {
    await api.post('/me/password', {
      current_password: pwd.value.current,
      new_password: pwd.value.next,
    });
    pwd.value = { current: '', next: '', confirm: '', showCurrent: false, showNext: false, showConfirm: false };
    savedPwd.value = true;
    setTimeout(() => { savedPwd.value = false; }, 2000);
  } catch (e) {
    pwdError.value = e instanceof Error ? e.message : 'No se pudo cambiar la contraseña';
  } finally {
    savingPwd.value = false;
  }
}

// ── Fecha legible ─────────────────────────────────────────────────────────────
const memberSince = computed(() => {
  if (!form.value.createdAt) return '';
  return new Date(form.value.createdAt).toLocaleDateString('es-VE', {
    year: 'numeric', month: 'long', day: 'numeric',
  });
});

// ── Conexiones (Google Calendar / Zoom) ───────────────────────────────────────
const googleConnected     = ref(false);
const zoomConnected       = ref(false);
const connectingGoogle    = ref(false);
const connectingZoom      = ref(false);
const disconnectingGoogle = ref(false);
const disconnectingZoom   = ref(false);

async function loadConnections() {
  try {
    const s = await api.get<{ google_connected: boolean; zoom_connected: boolean }>('/calendar/settings');
    googleConnected.value = s.google_connected;
    zoomConnected.value   = s.zoom_connected;
  } catch { /* silencioso */ }
}

async function connectGoogle() {
  connectingGoogle.value = true;
  try {
    const res = await api.get<{ url?: string; error?: string }>('/calendar/google/connect');
    if (res.url) { window.location.href = res.url; }
    else { showToast(res.error ?? 'No se pudo conectar', 'error'); connectingGoogle.value = false; }
  } catch (e) {
    showToast(e instanceof Error ? e.message : 'Error al conectar', 'error');
    connectingGoogle.value = false;
  }
}
async function disconnectGoogle() {
  if (!await confirm('¿Desconectar Google Calendar?', 'Desconectar')) return;
  disconnectingGoogle.value = true;
  try {
    await api.get('/calendar/google/disconnect');
    googleConnected.value = false;
    showToast('Google Calendar desconectado');
  } catch { showToast('Error al desconectar', 'error'); }
  finally { disconnectingGoogle.value = false; }
}
async function connectZoom() {
  connectingZoom.value = true;
  try {
    const res = await api.get<{ url?: string; error?: string }>('/calendar/zoom/connect');
    if (res.url) { window.location.href = res.url; }
    else { showToast(res.error ?? 'No se pudo conectar', 'error'); connectingZoom.value = false; }
  } catch (e) {
    showToast(e instanceof Error ? e.message : 'Error al conectar', 'error');
    connectingZoom.value = false;
  }
}
async function disconnectZoom() {
  if (!await confirm('¿Desconectar Zoom?', 'Desconectar')) return;
  disconnectingZoom.value = true;
  try {
    await api.get('/calendar/zoom/disconnect');
    zoomConnected.value = false;
    showToast('Zoom desconectado');
  } catch { showToast('Error al desconectar', 'error'); }
  finally { disconnectingZoom.value = false; }
}
</script>

<template>
  <div class="flex h-full flex-col overflow-hidden">

    <!-- Barra superior -->
    <div class="flex flex-shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 py-3 sm:px-6 sm:py-3.5">
      <div>
        <h3 class="text-[15px] font-semibold text-slate-900">Mi perfil</h3>
        <p class="hidden text-[12px] text-slate-400 sm:block">Administra tu información personal y contraseña</p>
      </div>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="flex flex-1 items-center justify-center bg-slate-50">
      <Spinner :size="28" />
    </div>

    <!-- Contenido -->
    <div v-else class="flex-1 overflow-y-auto bg-[#F1F5F9]">
      <div class="mx-auto max-w-3xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">

        <!-- ════════════════════════════
             SECCIÓN: Mi perfil
        ════════════════════════════ -->
        <div class="rounded-xl border border-slate-200 bg-white shadow-sm">
          <!-- Encabezado de sección -->
          <div class="flex items-center gap-2.5 border-b border-slate-100 px-6 py-4">
            <User class="h-4 w-4 text-primary" />
            <h4 class="text-[13px] font-semibold text-slate-700">Información personal</h4>
          </div>

          <div class="px-6 py-5">
            <!-- Avatar + selector de color -->
            <div class="mb-6 flex flex-col items-center gap-4 sm:flex-row sm:items-start sm:gap-6">
              <!-- Avatar preview -->
              <div
                class="flex h-20 w-20 flex-shrink-0 items-center justify-center rounded-full text-2xl font-bold text-white shadow-md"
                :style="{ backgroundColor: avatarBg }"
              >
                {{ initials }}
              </div>

              <div class="w-full">
                <p class="mb-2 text-[13px] font-medium text-slate-500">Color de avatar</p>
                <div class="flex flex-wrap gap-2">
                  <button
                    v-for="color in COLORS"
                    :key="color"
                    type="button"
                    class="h-8 w-8 cursor-pointer rounded-full transition-all duration-150 hover:scale-110 focus:outline-none"
                    :style="{ backgroundColor: color }"
                    :class="form.avatarColor === color
                      ? 'ring-2 ring-offset-2 ring-slate-500 scale-110'
                      : 'ring-1 ring-white'"
                    :title="color"
                    @click="form.avatarColor = color"
                  />
                </div>
                <p v-if="memberSince" class="mt-3 text-[11px] text-slate-400">Miembro desde {{ memberSince }}</p>
              </div>
            </div>

            <!-- Campos -->
            <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <!-- Nombre -->
              <div class="sm:col-span-2">
                <label class="uf-label">Nombre completo</label>
                <input
                  v-model="form.name"
                  class="uf-input"
                  placeholder="Tu nombre"
                />
              </div>
              <!-- Email (readonly) -->
              <div>
                <label class="uf-label">Email</label>
                <input
                  :value="form.email"
                  disabled
                  class="uf-input cursor-not-allowed opacity-60"
                />
              </div>
              <!-- Rol (readonly) -->
              <div>
                <label class="uf-label">Rol</label>
                <div class="flex items-center gap-2 pt-1">
                  <span
                    class="rounded-full px-3 py-1 text-xs font-semibold"
                    :class="roleBadge[form.role] ?? 'bg-slate-100 text-slate-600'"
                  >{{ roleLabel[form.role] ?? form.role }}</span>
                </div>
              </div>
            </div>

            <!-- Error -->
            <p v-if="profileError" class="mt-4 rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-600 border border-red-100">
              {{ profileError }}
            </p>

            <!-- Botón guardar -->
            <div class="mt-5 flex justify-end">
              <button
                :disabled="savingProfile"
                class="btn btn-primary flex items-center gap-2"
                @click="saveProfile"
              >
                <Spinner v-if="savingProfile" :size="15" light />
                <Check v-else-if="savedProfile" class="h-4 w-4" />
                <Save v-else class="h-4 w-4" />
                {{ savingProfile ? 'Guardando…' : savedProfile ? '¡Guardado!' : 'Guardar perfil' }}
              </button>
            </div>
          </div>
        </div>

        <!-- ════════════════════════════
             SECCIÓN: Cambiar contraseña
        ════════════════════════════ -->
        <div class="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div class="flex items-center gap-2.5 border-b border-slate-100 px-6 py-4">
            <Lock class="h-4 w-4 text-primary" />
            <h4 class="text-[13px] font-semibold text-slate-700">Cambiar contraseña</h4>
          </div>

          <div class="px-6 py-5">
            <div class="grid grid-cols-1 gap-4">
              <!-- Contraseña actual -->
              <div>
                <label class="uf-label">Contraseña actual</label>
                <div class="relative">
                  <input
                    v-model="pwd.current"
                    :type="pwd.showCurrent ? 'text' : 'password'"
                    class="uf-input pr-10"
                    placeholder="Tu contraseña actual"
                  />
                  <button
                    type="button"
                    class="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                    @click="pwd.showCurrent = !pwd.showCurrent"
                  >
                    <EyeOff v-if="pwd.showCurrent" class="h-4 w-4" />
                    <Eye v-else class="h-4 w-4" />
                  </button>
                </div>
              </div>
              <!-- Nueva contraseña -->
              <div>
                <label class="uf-label">Nueva contraseña</label>
                <div class="relative">
                  <input
                    v-model="pwd.next"
                    :type="pwd.showNext ? 'text' : 'password'"
                    class="uf-input pr-10"
                    placeholder="Mínimo 8 caracteres"
                  />
                  <button
                    type="button"
                    class="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                    @click="pwd.showNext = !pwd.showNext"
                  >
                    <EyeOff v-if="pwd.showNext" class="h-4 w-4" />
                    <Eye v-else class="h-4 w-4" />
                  </button>
                </div>
                <!-- Strength indicator -->
                <p v-if="pwd.next && pwd.next.length < 8" class="mt-1 text-[11px] text-amber-500">
                  La contraseña debe tener al menos 8 caracteres
                </p>
              </div>
              <!-- Confirmar contraseña -->
              <div>
                <label class="uf-label">Confirmar nueva contraseña</label>
                <div class="relative">
                  <input
                    v-model="pwd.confirm"
                    :type="pwd.showConfirm ? 'text' : 'password'"
                    class="uf-input pr-10"
                    placeholder="Repite la nueva contraseña"
                  />
                  <button
                    type="button"
                    class="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                    @click="pwd.showConfirm = !pwd.showConfirm"
                  >
                    <EyeOff v-if="pwd.showConfirm" class="h-4 w-4" />
                    <Eye v-else class="h-4 w-4" />
                  </button>
                </div>
                <p v-if="pwd.confirm && pwd.next !== pwd.confirm" class="mt-1 text-[11px] text-red-500">
                  Las contraseñas no coinciden
                </p>
              </div>
            </div>

            <!-- Error -->
            <p v-if="pwdError" class="mt-4 rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-600 border border-red-100">
              {{ pwdError }}
            </p>

            <!-- Botón -->
            <div class="mt-5 flex justify-end">
              <button
                :disabled="savingPwd"
                class="btn btn-primary flex items-center gap-2"
                @click="changePassword"
              >
                <Spinner v-if="savingPwd" :size="15" light />
                <Check v-else-if="savedPwd" class="h-4 w-4" />
                <Lock v-else class="h-4 w-4" />
                {{ savingPwd ? 'Cambiando…' : savedPwd ? '¡Contraseña cambiada!' : 'Cambiar contraseña' }}
              </button>
            </div>
          </div>
        </div>

        <!-- ════════════════════════════
             SECCIÓN: Conexiones
        ════════════════════════════ -->
        <div class="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div class="flex items-center gap-2.5 border-b border-slate-100 px-6 py-4">
            <Link2 class="h-4 w-4 text-primary" />
            <h4 class="text-[13px] font-semibold text-slate-700">Conexiones</h4>
          </div>

          <div class="divide-y divide-slate-100">
            <!-- Google Calendar -->
            <div class="flex items-center justify-between gap-4 px-6 py-5">
              <div class="flex items-center gap-4">
                <div class="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-white shadow ring-1 ring-slate-200">
                  <svg viewBox="0 0 24 24" class="h-5 w-5" fill="none">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                  </svg>
                </div>
                <div>
                  <p class="text-sm font-semibold text-slate-800">Google Calendar</p>
                  <p class="text-xs text-slate-500">Sincroniza tus citas con Google Calendar</p>
                  <div class="mt-1 flex items-center gap-1.5">
                    <span class="h-1.5 w-1.5 rounded-full" :class="googleConnected ? 'bg-emerald-500' : 'bg-slate-300'"></span>
                    <span class="text-[11px] font-medium" :class="googleConnected ? 'text-emerald-600' : 'text-slate-400'">
                      {{ googleConnected ? 'Conectado' : 'No conectado' }}
                    </span>
                  </div>
                </div>
              </div>
              <button
                v-if="!googleConnected"
                :disabled="connectingGoogle"
                class="flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition-all hover:border-slate-300 hover:shadow-md disabled:opacity-60 whitespace-nowrap"
                @click="connectGoogle"
              >
                <Spinner v-if="connectingGoogle" :size="13" />
                <ExternalLink v-else class="h-4 w-4" />
                {{ connectingGoogle ? 'Conectando…' : 'Conectar' }}
              </button>
              <button
                v-else
                :disabled="disconnectingGoogle"
                class="flex cursor-pointer items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-600 transition-all hover:border-red-300 disabled:opacity-60 whitespace-nowrap"
                @click="disconnectGoogle"
              >
                <Spinner v-if="disconnectingGoogle" :size="13" />
                <X v-else class="h-4 w-4" />
                {{ disconnectingGoogle ? 'Desconectando…' : 'Desconectar' }}
              </button>
            </div>

            <!-- Zoom -->
            <div class="flex items-center justify-between gap-4 px-6 py-5">
              <div class="flex items-center gap-4">
                <div class="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-[#2D8CFF] shadow">
                  <svg viewBox="0 0 24 24" class="h-5 w-5" fill="white">
                    <path d="M4.5 7.5A2.5 2.5 0 0 0 2 10v4a2.5 2.5 0 0 0 2.5 2.5h9A2.5 2.5 0 0 0 16 14v-4a2.5 2.5 0 0 0-2.5-2.5h-9zm11.5 2.086 4.243-2.829A.5.5 0 0 1 21 7.5v9a.5.5 0 0 1-.757.429L16 14.086V9.586z"/>
                  </svg>
                </div>
                <div>
                  <p class="text-sm font-semibold text-slate-800">Zoom</p>
                  <p class="text-xs text-slate-500">Genera links de videollamada automáticamente</p>
                  <div class="mt-1 flex items-center gap-1.5">
                    <span class="h-1.5 w-1.5 rounded-full" :class="zoomConnected ? 'bg-emerald-500' : 'bg-slate-300'"></span>
                    <span class="text-[11px] font-medium" :class="zoomConnected ? 'text-emerald-600' : 'text-slate-400'">
                      {{ zoomConnected ? 'Conectado' : 'No conectado' }}
                    </span>
                  </div>
                </div>
              </div>
              <button
                v-if="!zoomConnected"
                :disabled="connectingZoom"
                class="flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition-all hover:border-slate-300 hover:shadow-md disabled:opacity-60 whitespace-nowrap"
                @click="connectZoom"
              >
                <Spinner v-if="connectingZoom" :size="13" />
                <ExternalLink v-else class="h-4 w-4" />
                {{ connectingZoom ? 'Conectando…' : 'Conectar' }}
              </button>
              <button
                v-else
                :disabled="disconnectingZoom"
                class="flex cursor-pointer items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-600 transition-all hover:border-red-300 disabled:opacity-60 whitespace-nowrap"
                @click="disconnectZoom"
              >
                <Spinner v-if="disconnectingZoom" :size="13" />
                <X v-else class="h-4 w-4" />
                {{ disconnectingZoom ? 'Desconectando…' : 'Desconectar' }}
              </button>
            </div>
          </div>
        </div>

      </div>
    </div>

    <!-- Toast -->
    <Transition name="toast">
      <div
        v-if="toast"
        class="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-medium shadow-xl"
        :class="toastType === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'"
      >
        {{ toast }}
      </div>
    </Transition>
  </div>
</template>

<style>
.toast-enter-active, .toast-leave-active { transition: all 0.3s ease; }
.toast-enter-from, .toast-leave-to { opacity: 0; transform: translateY(8px); }
.uf-label {
  display: block; margin-bottom: 6px;
  font-size: 13px; font-weight: 500; color: #475569;
}
.uf-input {
  width: 100%; border-radius: 8px; border: 1.5px solid #E2E8F0;
  padding: 8px 12px; font-size: 13px; color: #0F172A;
  background: #F8FAFC; outline: none;
  transition: border-color 0.15s, box-shadow 0.15s, background 0.15s;
}
.uf-input:focus { border-color: #F69008; background: #fff; box-shadow: 0 0 0 3px rgba(246,144,8,0.12); }
.uf-input::placeholder { color: #94A3B8; }
</style>
