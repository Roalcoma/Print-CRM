<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import { Megaphone, Plus, Trash2, Loader2, CheckCircle2, AlertCircle, X } from 'lucide-vue-next';
import { api } from '../../api';
import BizSelect from '../../components/BizSelect.vue';

interface SocialConnection {
  id: string;
  platform: 'facebook' | 'instagram';
  page_name: string;
  page_picture: string | null;
  status: string;
}

interface LeadForm {
  id: string;
  name: string;
  status: string;
  leads_count?: number;
}

interface Pipeline {
  id: string;
  name: string;
  stages: Stage[];
}

interface Stage {
  id: string;
  name: string;
  pipeline_id: string;
}

interface LeadFormConfig {
  id: string;
  social_connection_id: string;
  form_id: string;
  form_name: string;
  pipeline_id: string | null;
  stage_id: string | null;
  field_map: Record<string, string>;
  auto_create_contact: boolean;
  auto_create_opportunity: boolean;
  page_name: string;
  pipeline_name: string | null;
  stage_name: string | null;
}

// ─── Estado principal ─────────────────────────────────────────────────────────
const configs = ref<LeadFormConfig[]>([]);
const connections = ref<SocialConnection[]>([]);
const pipelines = ref<Pipeline[]>([]);
const loading = ref(true);
const deleting = ref<string | null>(null);

// ─── Estado del formulario de nueva config ───────────────────────────────────
const showForm = ref(false);
const saving = ref(false);
const loadingForms = ref(false);

const form = ref({
  social_connection_id: '',
  form_id: '',
  form_name: '',
  pipeline_id: '',
  stage_id: '',
  auto_create_contact: true,
  auto_create_opportunity: true,
  field_map: {
    full_name: 'name',
    phone_number: 'phone',
    email: 'email',
  } as Record<string, string>,
});

const availableForms = ref<LeadForm[]>([]);
const customMappingKey = ref('');
const customMappingValue = ref('');

// ─── Computed ─────────────────────────────────────────────────────────────────
const fbConnections = computed(() => connections.value.filter(c => c.platform === 'facebook'));
const selectedPipeline = computed(() => pipelines.value.find(p => p.id === form.value.pipeline_id));
const stages = computed(() => selectedPipeline.value?.stages ?? []);

// Campos comunes de formularios Lead Ads para sugerencias
const commonFormFields = ['full_name', 'first_name', 'last_name', 'email', 'phone_number',
  'company_name', 'job_title', 'city', 'state'];
const crmFields = [
  { value: 'name',  label: 'Nombre' },
  { value: 'phone', label: 'Teléfono' },
  { value: 'email', label: 'Email' },
];

// ─── Toast ────────────────────────────────────────────────────────────────────
const toast = ref('');
const toastType = ref<'success' | 'error'>('success');
let toastTimer: ReturnType<typeof setTimeout>;
function showToast(msg: string, type: 'success' | 'error' = 'success') {
  toast.value = msg;
  toastType.value = type;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.value = ''; }, 4000);
}

// ─── Carga inicial ────────────────────────────────────────────────────────────
async function load() {
  loading.value = true;
  try {
    const [configsRes, connRes, pipRes] = await Promise.all([
      api.get<{ configs: LeadFormConfig[] }>('/lead-ads/configs'),
      api.get<{ connections: SocialConnection[] }>('/social/connections'),
      api.get<Pipeline[]>('/pipelines'),
    ]);
    configs.value = configsRes.configs;
    connections.value = connRes.connections;
    pipelines.value = pipRes;
  } catch {
    showToast('Error al cargar datos', 'error');
  } finally {
    loading.value = false;
  }
}

// Cargar formularios cuando cambia la conexión seleccionada
watch(() => form.value.social_connection_id, async (connId) => {
  availableForms.value = [];
  form.value.form_id = '';
  form.value.form_name = '';
  if (!connId) return;
  loadingForms.value = true;
  try {
    const res = await api.get<{ forms: LeadForm[] }>(`/lead-ads/forms/${connId}`);
    availableForms.value = res.forms;
  } catch {
    showToast('Error al cargar formularios de Lead Ads', 'error');
  } finally {
    loadingForms.value = false;
  }
});

// Sincronizar form_name cuando se selecciona un formulario
watch(() => form.value.form_id, (fid) => {
  const f = availableForms.value.find(f => f.id === fid);
  if (f) form.value.form_name = f.name;
});

// Limpiar stage_id si cambia el pipeline
watch(() => form.value.pipeline_id, () => { form.value.stage_id = ''; });

// ─── Mapeo de campos ──────────────────────────────────────────────────────────
function addCustomMapping() {
  const key = customMappingKey.value.trim();
  const val = customMappingValue.value.trim();
  if (!key || !val) return;
  form.value.field_map[key] = val;
  customMappingKey.value = '';
  customMappingValue.value = '';
}

function removeMapping(key: string) {
  delete form.value.field_map[key];
}

// ─── Guardar configuración ────────────────────────────────────────────────────
async function save() {
  if (!form.value.social_connection_id || !form.value.form_id) {
    return showToast('Selecciona una conexión y un formulario', 'error');
  }
  saving.value = true;
  try {
    await api.post('/lead-ads/configs', {
      ...form.value,
      pipeline_id: form.value.pipeline_id || null,
      stage_id: form.value.stage_id || null,
    });
    showToast('Formulario configurado');
    showForm.value = false;
    resetForm();
    await load();
  } catch (e: unknown) {
    showToast(e instanceof Error ? e.message : 'Error al guardar', 'error');
  } finally {
    saving.value = false;
  }
}

function resetForm() {
  form.value = {
    social_connection_id: '',
    form_id: '',
    form_name: '',
    pipeline_id: '',
    stage_id: '',
    auto_create_contact: true,
    auto_create_opportunity: true,
    field_map: { full_name: 'name', phone_number: 'phone', email: 'email' },
  };
  availableForms.value = [];
}

// ─── Eliminar configuración ────────────────────────────────────────────────────
async function deleteConfig(cfg: LeadFormConfig) {
  if (deleting.value) return;
  deleting.value = cfg.id;
  try {
    await api.del(`/lead-ads/configs/${cfg.id}`);
    configs.value = configs.value.filter(c => c.id !== cfg.id);
    showToast('Configuración eliminada');
  } catch {
    showToast('Error al eliminar', 'error');
  } finally {
    deleting.value = null;
  }
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('es-VE', { day: '2-digit', month: 'short', year: 'numeric' });
}

onMounted(load);
</script>

<template>
  <div class="flex flex-col h-full overflow-auto">
    <!-- Toolbar -->
    <div class="page-toolbar">
      <div class="flex items-center gap-3">
        <Megaphone class="h-5 w-5 text-slate-400" />
        <h1 class="text-base font-semibold text-slate-800">Facebook Lead Ads</h1>
      </div>
      <button class="btn btn-primary btn-sm" @click="showForm = true">
        <Plus class="h-4 w-4" />
        Configurar formulario
      </button>
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

      <!-- Info de requisito -->
      <div class="rounded-xl border border-blue-100 bg-blue-50 px-5 py-4 text-sm text-blue-700">
        <p class="font-semibold mb-1">Requisito: página de Facebook conectada</p>
        <p class="text-blue-600">Necesitas tener al menos una página de Facebook vinculada en
          <a href="/settings/social" class="underline font-medium">Redes Sociales</a>
          y haber solicitado el permiso <code class="bg-blue-100 px-1 rounded">leads_retrieval</code>
          en tu app de Meta Developers.
        </p>
      </div>

      <!-- Sin conexiones FB -->
      <div v-if="!loading && fbConnections.length === 0" class="rounded-xl border border-slate-200 bg-white py-12 px-4 text-center">
        <div class="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 mx-auto mb-3">
          <Megaphone class="h-6 w-6 text-slate-300" />
        </div>
        <p class="text-sm font-medium text-slate-500">Sin páginas de Facebook conectadas</p>
        <p class="text-xs text-slate-400 mt-1 max-w-xs mx-auto">Conecta una página de Facebook en Ajustes → Redes Sociales para poder usar Lead Ads.</p>
        <a href="/settings/social" class="btn btn-primary mt-4 inline-flex">Ir a Redes Sociales</a>
      </div>

      <!-- Loading -->
      <div v-else-if="loading" class="flex justify-center py-12">
        <Loader2 class="h-6 w-6 animate-spin text-slate-300" />
      </div>

      <template v-else>
        <!-- Lista de configuraciones -->
        <div v-if="configs.length" class="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div class="px-5 py-4 border-b border-slate-100">
            <h3 class="font-semibold text-slate-800">Formularios configurados</h3>
            <p class="text-sm text-slate-500 mt-0.5">Cuando llegue un lead de estos formularios, se creará el contacto y la oportunidad automáticamente.</p>
          </div>
          <div class="divide-y divide-slate-100">
            <div v-for="cfg in configs" :key="cfg.id" class="flex items-center gap-4 px-5 py-4">
              <div class="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-[#1877F2]/10">
                <Megaphone class="h-4 w-4 text-[#1877F2]" />
              </div>
              <div class="flex-1 min-w-0">
                <p class="text-sm font-semibold text-slate-800 truncate">{{ cfg.form_name || cfg.form_id }}</p>
                <p class="text-xs text-slate-400 mt-0.5">
                  Página: <span class="text-slate-600">{{ cfg.page_name }}</span>
                  <template v-if="cfg.pipeline_name">
                    · Pipeline: <span class="text-slate-600">{{ cfg.pipeline_name }}</span>
                    → <span class="text-slate-600">{{ cfg.stage_name }}</span>
                  </template>
                </p>
              </div>
              <div class="flex items-center gap-2 flex-shrink-0">
                <span class="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
                  <span class="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
                  Activo
                </span>
                <button
                  class="flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:border-red-200 hover:text-red-600 hover:bg-red-50 transition-colors"
                  :disabled="deleting === cfg.id"
                  @click="deleteConfig(cfg)"
                >
                  <Loader2 v-if="deleting === cfg.id" class="h-3.5 w-3.5 animate-spin" />
                  <Trash2 v-else class="h-3.5 w-3.5" />
                  Eliminar
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- Estado vacío -->
        <div v-else class="rounded-xl border border-dashed border-slate-300 bg-white py-12 px-4 text-center">
          <Megaphone class="h-8 w-8 text-slate-200 mx-auto mb-3" />
          <p class="text-sm font-medium text-slate-500">Sin formularios configurados</p>
          <p class="text-xs text-slate-400 mt-1">Haz clic en "Configurar formulario" para empezar.</p>
        </div>
      </template>
    </div>

    <!-- ─── Panel lateral: nuevo formulario ─────────────────────────────────── -->
    <Transition name="slide">
      <div v-if="showForm" class="fixed inset-0 z-40 flex">
        <div class="flex-1 bg-black/30" @click="showForm = false; resetForm()" />
        <div class="w-full max-w-lg bg-white shadow-2xl flex flex-col overflow-hidden">

          <!-- Header del panel -->
          <div class="flex items-center justify-between px-6 py-4 border-b border-slate-200">
            <h2 class="font-semibold text-slate-800">Configurar formulario Lead Ads</h2>
            <button class="text-slate-400 hover:text-slate-600" @click="showForm = false; resetForm()">
              <X class="h-5 w-5" />
            </button>
          </div>

          <div class="flex-1 overflow-auto p-6 space-y-6">

            <!-- 1. Seleccionar conexión FB -->
            <div>
              <label class="form-label">Página de Facebook</label>
              <BizSelect v-model="form.social_connection_id" placeholder="Seleccionar página…" input-class="input" :options="fbConnections.map(c => ({ value: c.id, label: c.page_name }))" />
            </div>

            <!-- 2. Seleccionar formulario -->
            <div>
              <label class="form-label">Formulario Lead Ads</label>
              <BizSelect v-model="form.form_id" input-class="input" :disabled="!form.social_connection_id || loadingForms"
                :placeholder="loadingForms ? 'Cargando formularios…' : 'Seleccionar formulario…'"
                :options="availableForms.map(f => ({ value: f.id, label: f.leads_count != null ? `${f.name} (${f.leads_count} leads)` : f.name }))" />
              <p v-if="form.social_connection_id && availableForms.length === 0 && !loadingForms" class="text-xs text-amber-600 mt-1">
                No se encontraron formularios. Verifica que la app de Meta tenga el permiso <code>leads_retrieval</code>.
              </p>
            </div>

            <!-- 3. Pipeline y etapa destino -->
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="form-label">Pipeline destino</label>
                <BizSelect v-model="form.pipeline_id" placeholder="Sin pipeline" input-class="input" :options="pipelines.map(p => ({ value: p.id, label: p.name }))" />
              </div>
              <div>
                <label class="form-label">Etapa inicial</label>
                <BizSelect v-model="form.stage_id" placeholder="Sin etapa" input-class="input" :disabled="!form.pipeline_id" :options="stages.map(s => ({ value: s.id, label: s.name }))" />
              </div>
            </div>

            <!-- 4. Mapeo de campos -->
            <div>
              <label class="form-label">Mapeo de campos del formulario</label>
              <p class="text-xs text-slate-500 mb-3">
                Indica qué campo del formulario de Meta corresponde a cada campo del CRM.
                El nombre exacto lo encuentras en Meta → Forms Library → tu formulario → Fields.
              </p>

              <!-- Filas de mapeo existentes -->
              <div class="space-y-2">
                <div
                  v-for="(crmField, formField) in form.field_map"
                  :key="formField"
                  class="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2"
                >
                  <code class="flex-1 text-xs text-slate-700 font-mono">{{ formField }}</code>
                  <span class="text-slate-400 text-xs">→</span>
                  <span class="text-xs text-primary font-medium">{{ crmFields.find(f => f.value === crmField)?.label ?? crmField }}</span>
                  <button class="text-slate-300 hover:text-red-400 ml-1" @click="removeMapping(formField)">
                    <X class="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              <!-- Añadir mapeo personalizado -->
              <div class="mt-3 flex gap-2 items-end">
                <div class="flex-1">
                  <label class="form-label text-[11px]">Campo del formulario</label>
                  <input
                    v-model="customMappingKey"
                    list="form-fields-list"
                    class="input text-sm"
                    placeholder="ej: full_name"
                    @keydown.enter.prevent="addCustomMapping"
                  />
                  <datalist id="form-fields-list">
                    <option v-for="f in commonFormFields" :key="f" :value="f" />
                  </datalist>
                </div>
                <div class="flex-1">
                  <label class="form-label text-[11px]">Campo del CRM</label>
                  <BizSelect v-model="customMappingValue" placeholder="Seleccionar…" input-class="input text-sm" :options="crmFields" />
                </div>
                <button
                  class="btn btn-secondary btn-sm flex-shrink-0"
                  :disabled="!customMappingKey || !customMappingValue"
                  @click="addCustomMapping"
                >
                  <Plus class="h-4 w-4" />
                </button>
              </div>
            </div>

            <!-- 5. Opciones de automatización -->
            <div class="space-y-3">
              <label class="form-label">Automatización</label>
              <label class="flex items-center gap-3 cursor-pointer select-none">
                <input type="checkbox" v-model="form.auto_create_contact" class="h-4 w-4 rounded accent-primary" />
                <span class="text-sm text-slate-700">Crear contacto automáticamente</span>
              </label>
              <label class="flex items-center gap-3 cursor-pointer select-none">
                <input type="checkbox" v-model="form.auto_create_opportunity" class="h-4 w-4 rounded accent-primary" />
                <span class="text-sm text-slate-700">Crear oportunidad en el pipeline</span>
              </label>
            </div>
          </div>

          <!-- Footer del panel -->
          <div class="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-200 bg-slate-50">
            <button class="btn btn-secondary" @click="showForm = false; resetForm()">Cancelar</button>
            <button class="btn btn-primary" :disabled="saving" @click="save">
              <Loader2 v-if="saving" class="h-4 w-4 animate-spin" />
              {{ saving ? 'Guardando…' : 'Guardar configuración' }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.toast-enter-active { transition: all 0.2s ease; }
.toast-leave-active { transition: all 0.15s ease; }
.toast-enter-from  { opacity: 0; transform: translateY(-8px); }
.toast-leave-to    { opacity: 0; transform: translateY(-8px); }

.slide-enter-active { transition: all 0.25s ease; }
.slide-leave-active { transition: all 0.2s ease; }
.slide-enter-from  { opacity: 0; }
.slide-leave-to    { opacity: 0; }
.slide-enter-from .max-w-lg { transform: translateX(100%); }
.slide-leave-to   .max-w-lg { transform: translateX(100%); }
</style>
