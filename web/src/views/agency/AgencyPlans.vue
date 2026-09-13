<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { Plus, Pencil, X, Users, DollarSign, Check } from 'lucide-vue-next';
import { agencyApi } from '../../agencyApi';

interface Plan {
  id: string;
  name: string;
  slug: string;
  price_usd: string;
  max_users: number;
  is_active: boolean;
  sort_order: number;
  created_at: string;
}

const plans = ref<Plan[]>([]);
const loading = ref(true);
const showModal = ref(false);
const editingPlan = ref<Plan | null>(null);
const saving = ref(false);
const formError = ref('');

const form = ref({ name: '', slug: '', priceUsd: 0, maxUsers: 0 });

async function load() {
  loading.value = true;
  try {
    const res = await agencyApi.get<{ plans: Plan[] }>('/plans');
    plans.value = res.plans;
  } finally {
    loading.value = false;
  }
}
onMounted(load);

function openCreate() {
  editingPlan.value = null;
  form.value = { name: '', slug: '', priceUsd: 0, maxUsers: 0 };
  formError.value = '';
  showModal.value = true;
}

function openEdit(p: Plan) {
  editingPlan.value = p;
  form.value = { name: p.name, slug: p.slug, priceUsd: Number(p.price_usd), maxUsers: p.max_users };
  formError.value = '';
  showModal.value = true;
}

async function save() {
  formError.value = '';
  saving.value = true;
  try {
    if (editingPlan.value) {
      const updated = await agencyApi.patch<Plan>(`/plans/${editingPlan.value.id}`, {
        name: form.value.name,
        priceUsd: form.value.priceUsd,
        maxUsers: form.value.maxUsers,
      });
      plans.value = plans.value.map(p => p.id === updated.id ? updated : p);
    } else {
      const created = await agencyApi.post<Plan>('/plans', form.value);
      plans.value = [...plans.value, created];
    }
    showModal.value = false;
  } catch (e) {
    formError.value = e instanceof Error ? e.message : 'Error al guardar';
  } finally {
    saving.value = false;
  }
}

async function toggleActive(p: Plan) {
  const updated = await agencyApi.patch<Plan>(`/plans/${p.id}`, { isActive: !p.is_active });
  plans.value = plans.value.map(x => x.id === updated.id ? updated : x);
}

function userLabel(n: number) {
  if (n === 0) return 'Solo owner';
  if (n >= 999) return 'Ilimitados';
  return `Owner + ${n} usuario${n > 1 ? 's' : ''}`;
}
</script>

<template>
  <div class="space-y-5 p-4 sm:p-6">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <div>
        <h2 class="text-xl font-bold text-white">Planes</h2>
        <p class="text-sm text-slate-400 mt-0.5">Catálogo de planes disponibles para las cuentas CRM</p>
      </div>
      <button
        class="flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-500 transition-colors cursor-pointer shadow-lg shadow-violet-900/40"
        @click="openCreate"
      >
        <Plus class="h-4 w-4" />
        Nuevo Plan
      </button>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <div v-for="i in 3" :key="i" class="h-40 rounded-xl bg-slate-800/50 animate-pulse"></div>
    </div>

    <!-- Plan cards -->
    <div v-else class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <div
        v-for="plan in plans"
        :key="plan.id"
        class="relative rounded-xl border bg-slate-900/60 p-5 flex flex-col gap-4 transition-all"
        :class="plan.is_active ? 'border-slate-700/60' : 'border-slate-800/30 opacity-50'"
      >
        <!-- Header -->
        <div class="flex items-start justify-between">
          <div>
            <h3 class="text-base font-bold text-white">{{ plan.name }}</h3>
            <p class="text-xs text-slate-500 font-mono mt-0.5">{{ plan.slug }}</p>
          </div>
          <button
            class="rounded-md p-1.5 text-slate-500 hover:bg-slate-800 hover:text-slate-200 transition-colors cursor-pointer"
            @click="openEdit(plan)"
            title="Editar"
          >
            <Pencil class="h-3.5 w-3.5" />
          </button>
        </div>

        <!-- Price -->
        <div class="flex items-end gap-1">
          <span class="text-3xl font-bold text-white">${{ Number(plan.price_usd).toFixed(0) }}</span>
          <span class="text-sm text-slate-400 mb-1">/mes</span>
        </div>

        <!-- Features -->
        <ul class="space-y-1.5 flex-1">
          <li class="flex items-center gap-2 text-sm text-slate-300">
            <Users class="h-3.5 w-3.5 text-violet-400 flex-shrink-0" />
            {{ userLabel(plan.max_users) }}
          </li>
          <li class="flex items-center gap-2 text-sm text-slate-300">
            <DollarSign class="h-3.5 w-3.5 text-emerald-400 flex-shrink-0" />
            Facturación manual
          </li>
        </ul>

        <!-- Active toggle -->
        <button
          class="w-full rounded-lg border py-2 text-xs font-semibold transition-all cursor-pointer"
          :class="plan.is_active
            ? 'border-slate-700 text-slate-400 hover:border-red-700/60 hover:text-red-400'
            : 'border-emerald-700/60 text-emerald-400 hover:bg-emerald-900/20'"
          @click="toggleActive(plan)"
        >
          {{ plan.is_active ? 'Desactivar plan' : 'Activar plan' }}
        </button>
      </div>
    </div>

    <!-- Modal -->
    <Teleport to="body">
      <div v-if="showModal" class="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" @click="showModal = false"></div>
        <div class="relative z-10 w-full max-w-md rounded-2xl border border-slate-700/60 bg-slate-900 shadow-2xl">
          <div class="flex items-center justify-between border-b border-slate-800/60 px-6 py-4">
            <h3 class="font-bold text-white">{{ editingPlan ? 'Editar Plan' : 'Nuevo Plan' }}</h3>
            <button class="text-slate-500 hover:text-slate-300 cursor-pointer" @click="showModal = false">
              <X class="h-5 w-5" />
            </button>
          </div>

          <form class="p-6 space-y-4" @submit.prevent="save">
            <div>
              <label class="mb-1 block text-xs font-medium text-slate-400">Nombre *</label>
              <input v-model="form.name" required placeholder="Ej: Starter"
                class="w-full rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm text-slate-200 focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 focus:outline-none" />
            </div>

            <div v-if="!editingPlan">
              <label class="mb-1 block text-xs font-medium text-slate-400">Slug * <span class="text-slate-600">(único, sin espacios)</span></label>
              <input v-model="form.slug" required placeholder="ej: starter"
                pattern="[a-z0-9_-]+"
                class="w-full rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm text-slate-200 font-mono focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 focus:outline-none" />
            </div>

            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="mb-1 block text-xs font-medium text-slate-400">Precio (USD/mes)</label>
                <div class="relative">
                  <span class="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">$</span>
                  <input v-model.number="form.priceUsd" type="number" min="0" step="1"
                    class="w-full rounded-lg border border-slate-700 bg-slate-800/60 pl-7 pr-3 py-2 text-sm text-slate-200 focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 focus:outline-none" />
                </div>
              </div>
              <div>
                <label class="mb-1 block text-xs font-medium text-slate-400">Usuarios extra <span class="text-slate-600">(+ owner)</span></label>
                <input v-model.number="form.maxUsers" type="number" min="0"
                  class="w-full rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm text-slate-200 focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 focus:outline-none" />
              </div>
            </div>

            <p class="text-xs text-slate-500">
              <Check class="inline h-3 w-3 text-violet-400 mr-1" />
              {{ userLabel(form.maxUsers) }}
            </p>

            <div v-if="formError" class="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">{{ formError }}</div>

            <div class="flex gap-2 pt-1">
              <button type="button" class="flex-1 rounded-lg border border-slate-700 py-2 text-sm text-slate-400 hover:text-slate-200 cursor-pointer transition-colors" @click="showModal = false">Cancelar</button>
              <button type="submit" :disabled="saving"
                class="flex-1 rounded-lg bg-violet-600 py-2 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-60 cursor-pointer transition-colors">
                {{ saving ? 'Guardando…' : 'Guardar' }}
              </button>
            </div>
          </form>
        </div>
      </div>
    </Teleport>
  </div>
</template>
