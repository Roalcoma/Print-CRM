<script setup lang="ts">
import { ref, onMounted } from 'vue';
import {
  Building2, Check, Phone, Globe, Mail, MapPin, Briefcase,
  Loader2,
} from 'lucide-vue-next';
import { api } from '../../api';
import LoadingState from '../../components/LoadingState.vue';
import BizSelect from '../../components/BizSelect.vue';
import { TIMEZONES } from '../../utils/timezones';

interface Org {
  id: string; name: string; created_at: string;
  phone?: string; website?: string; business_email?: string;
  address?: string; city?: string; country?: string;
  industry?: string; description?: string;
  timezone?: string; currency?: string; logo_url?: string;
}

const org     = ref<Org | null>(null);
const loading = ref(true);
const saving  = ref(false);
const saved   = ref(false);
const error   = ref('');

const form = ref({
  name: '', phone: '', website: '', business_email: '',
  address: '', city: '', country: '', industry: '',
  description: '', timezone: '', currency: '',
});

const INDUSTRIES = [
  'Tecnología', 'Ventas y comercio', 'Servicios profesionales', 'Salud',
  'Educación', 'Inmobiliaria', 'Construcción', 'Manufactura',
  'Transporte y logística', 'Alimentos y bebidas', 'Marketing y publicidad',
  'Finanzas y seguros', 'Turismo y hospitalidad', 'Entretenimiento', 'Otro',
];

const CURRENCIES = [
  { value: 'USD', label: 'Dólar estadounidense (USD)' },
  { value: 'VES', label: 'Bolívar venezolano (VES)' },
  { value: 'COP', label: 'Peso colombiano (COP)' },
  { value: 'EUR', label: 'Euro (EUR)' },
  { value: 'MXN', label: 'Peso mexicano (MXN)' },
  { value: 'PEN', label: 'Sol peruano (PEN)' },
  { value: 'CLP', label: 'Peso chileno (CLP)' },
];

onMounted(async () => {
  try {
    org.value = await api.get<Org>('/organization');
    const o = org.value;
    form.value = {
      name:           o.name           ?? '',
      phone:          o.phone          ?? '',
      website:        o.website        ?? '',
      business_email: o.business_email ?? '',
      address:        o.address        ?? '',
      city:           o.city           ?? '',
      country:        o.country        ?? 'Venezuela',
      industry:       o.industry       ?? '',
      description:    o.description    ?? '',
      timezone:       o.timezone       ?? 'America/Caracas',
      currency:       o.currency       ?? 'USD',
    };
  } finally { loading.value = false; }
});

async function save() {
  error.value = ''; saved.value = false; saving.value = true;
  try {
    org.value = await api.patch<Org>('/organization', form.value);
    saved.value = true;
    setTimeout(() => { saved.value = false; }, 2500);
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'No se pudo guardar';
  } finally { saving.value = false; }
}

const createdAt = () => org.value
  ? new Date(org.value.created_at).toLocaleDateString('es-VE', { day: '2-digit', month: 'long', year: 'numeric' })
  : '';

const initials = () => {
  const n = org.value?.name ?? '';
  return n.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase() || '?';
};
</script>

<template>
  <div class="flex h-full flex-col overflow-hidden">
    <!-- Barra superior -->
    <div class="flex flex-shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 py-3 sm:px-6 sm:py-3.5">
      <div>
        <h3 class="text-[15px] font-semibold text-slate-900">Perfil del negocio</h3>
        <p class="hidden text-[12px] text-slate-400 sm:block">Información general de tu organización</p>
      </div>
      <div class="flex items-center gap-2">
        <Transition name="fade">
          <span v-if="saved" class="hidden items-center gap-1.5 text-sm font-medium text-emerald-600 sm:flex">
            <Check class="h-4 w-4" /> Guardado
          </span>
        </Transition>
        <button :disabled="saving" class="btn btn-primary" @click="save">
          <Loader2 v-if="saving" class="h-4 w-4 animate-spin" />
          <Check v-else class="h-4 w-4" />
          Guardar cambios
        </button>
      </div>
    </div>

    <LoadingState v-if="loading" label="Cargando perfil…" />

    <!-- Cuerpo scrollable -->
    <div v-else class="flex-1 overflow-y-auto bg-slate-50">

      <!-- Banner hero -->
      <div class="relative overflow-hidden border-b border-slate-200 bg-white">
        <div class="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#F69008] via-[#FBBF24] to-[#F69008]"></div>
        <div class="px-4 py-5 sm:px-8 sm:py-7">
          <div class="flex items-center gap-5">
            <div class="flex h-20 w-20 flex-shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#F69008] to-[#D97706] text-2xl font-bold text-white shadow-lg shadow-[#F69008]/25 ring-4 ring-white">
              {{ initials() }}
            </div>
            <div class="min-w-0 flex-1">
              <p class="truncate text-xl font-bold text-slate-900">{{ org?.name || 'Tu negocio' }}</p>
              <p class="mt-0.5 text-sm text-slate-400">Cuenta creada el {{ createdAt() }}</p>
              <div v-if="form.industry" class="mt-2">
                <span class="inline-flex items-center gap-1 rounded-full bg-primary/10 px-3 py-0.5 text-xs font-semibold text-primary">
                  <Briefcase class="h-3 w-3" />
                  {{ form.industry }}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <p v-if="error" class="mx-4 mt-4 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600 sm:mx-6">{{ error }}</p>

      <!-- Grid de cards -->
      <div class="grid grid-cols-1 gap-4 p-4 sm:p-6 lg:grid-cols-2">

        <!-- ── Identidad ─────────────────────────────────── -->
        <div class="rounded-xl border border-slate-200 bg-white shadow-card">
          <div class="flex items-center gap-3 border-b border-slate-100 px-5 py-4">
            <div class="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
              <Building2 class="h-4 w-4 text-primary" />
            </div>
            <h4 class="text-[13px] font-semibold text-slate-700">Identidad</h4>
          </div>
          <div class="space-y-4 px-5 py-5">
            <div>
              <label class="biz-label">Nombre del negocio</label>
              <input v-model="form.name" class="biz-input" placeholder="Ej. Mi Empresa S.A." />
            </div>
            <div>
              <label class="biz-label">Sector / Industria</label>
              <BizSelect v-model="form.industry" :options="INDUSTRIES" placeholder="Selecciona una industria" />
            </div>
            <div>
              <label class="biz-label">Descripción del negocio</label>
              <textarea v-model="form.description" rows="3" class="biz-input resize-none" placeholder="Breve descripción de lo que hace tu empresa…"></textarea>
            </div>
          </div>
        </div>

        <!-- ── Contacto ──────────────────────────────────── -->
        <div class="rounded-xl border border-slate-200 bg-white shadow-card">
          <div class="flex items-center gap-3 border-b border-slate-100 px-5 py-4">
            <div class="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
              <Phone class="h-4 w-4 text-primary" />
            </div>
            <h4 class="text-[13px] font-semibold text-slate-700">Contacto</h4>
          </div>
          <div class="space-y-4 px-5 py-5">
            <div>
              <label class="biz-label">Teléfono</label>
              <div class="biz-icon-wrap">
                <Phone class="biz-icon" />
                <input v-model="form.phone" class="biz-input biz-input-icon" placeholder="+58 412 0000000" />
              </div>
            </div>
            <div>
              <label class="biz-label">Email del negocio</label>
              <div class="biz-icon-wrap">
                <Mail class="biz-icon" />
                <input v-model="form.business_email" type="email" class="biz-input biz-input-icon" placeholder="contacto@minegocio.com" />
              </div>
            </div>
            <div>
              <label class="biz-label">Sitio web</label>
              <div class="biz-icon-wrap">
                <Globe class="biz-icon" />
                <input v-model="form.website" class="biz-input biz-input-icon" placeholder="https://minegocio.com" />
              </div>
            </div>
          </div>
        </div>

        <!-- ── Ubicación ─────────────────────────────────── -->
        <div class="rounded-xl border border-slate-200 bg-white shadow-card">
          <div class="flex items-center gap-3 border-b border-slate-100 px-5 py-4">
            <div class="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
              <MapPin class="h-4 w-4 text-primary" />
            </div>
            <h4 class="text-[13px] font-semibold text-slate-700">Ubicación</h4>
          </div>
          <div class="space-y-4 px-5 py-5">
            <div>
              <label class="biz-label">Dirección</label>
              <textarea v-model="form.address" rows="2" class="biz-input resize-none" placeholder="Av. Principal, Edificio X, Piso 3"></textarea>
            </div>
            <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label class="biz-label">Ciudad</label>
                <input v-model="form.city" class="biz-input" placeholder="Caracas" />
              </div>
              <div>
                <label class="biz-label">País</label>
                <input v-model="form.country" class="biz-input" placeholder="Venezuela" />
              </div>
            </div>
          </div>
        </div>

        <!-- ── Preferencias ──────────────────────────────── -->
        <div class="rounded-xl border border-slate-200 bg-white shadow-card">
          <div class="flex items-center gap-3 border-b border-slate-100 px-5 py-4">
            <div class="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
              <Briefcase class="h-4 w-4 text-primary" />
            </div>
            <h4 class="text-[13px] font-semibold text-slate-700">Preferencias</h4>
          </div>
          <div class="space-y-4 px-5 py-5">
            <div>
              <label class="biz-label">Zona horaria</label>
              <BizSelect v-model="form.timezone" :options="TIMEZONES" />
            </div>
            <div>
              <label class="biz-label">Moneda principal</label>
              <BizSelect v-model="form.currency" :options="CURRENCIES" />
            </div>
          </div>
        </div>

      </div>
    </div>
  </div>
</template>

<style>
.biz-label {
  display: block;
  margin-bottom: 6px;
  font-size: 13px;
  font-weight: 500;
  color: #475569;
}

.biz-input {
  width: 100%;
  border-radius: 8px;
  border: 1.5px solid #E2E8F0;
  padding: 9px 12px;
  font-size: 13px;
  color: #0F172A;
  background: #F8FAFC;
  transition: border-color 0.15s, box-shadow 0.15s, background 0.15s;
  outline: none;
  font-family: inherit;
  line-height: 1.4;
}
.biz-input:focus {
  border-color: #F69008;
  background: #ffffff;
  box-shadow: 0 0 0 3px rgba(246, 144, 8, 0.12);
}
.biz-input::placeholder { color: #94A3B8; }

/* Input con ícono a la izquierda */
.biz-icon-wrap {
  position: relative;
}
.biz-icon {
  position: absolute;
  left: 11px;
  top: 50%;
  transform: translateY(-50%);
  width: 15px;
  height: 15px;
  color: #94A3B8;
  pointer-events: none;
  flex-shrink: 0;
}
.biz-input-icon {
  padding-left: 34px;
}

</style>
