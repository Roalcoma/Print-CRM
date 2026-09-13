<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import {
  Plus, Search, Copy, Check, ArrowLeft,
  UserRound, Shield, Mail, Lock, Users, Trash2,
} from 'lucide-vue-next';
import { api } from '../../api';
import type { User } from '../../types';
import { MODULES } from '../../modules';
import { useAuthStore } from '../../stores/auth';
import Spinner from '../../components/Spinner.vue';
import LoadingState from '../../components/LoadingState.vue';

const auth = useAuthStore();
const users = ref<User[]>([]);
const loading = ref(true);
const search = ref('');
const roleFilter = ref('');

async function load() { users.value = await api.get<User[]>('/users'); }
onMounted(async () => { try { await load(); } finally { loading.value = false; } });

const roleLabel: Record<string, string> = { owner: 'Owner', admin: 'Administrador', member: 'Miembro' };
const roleBadge: Record<string, string> = {
  owner:  'bg-[#60D0FA]/15 text-[#0284C7]',
  admin:  'bg-[#F69008]/10 text-[#D97706]',
  member: 'bg-slate-100 text-slate-600',
};
const moduleLabel = (k: string) => MODULES.find(m => m.key === k)?.label ?? k;

const filtered = computed(() => {
  const t = search.value.trim().toLowerCase();
  return users.value.filter(u =>
    (!roleFilter.value || u.role === roleFilter.value) &&
    (!t || u.name.toLowerCase().includes(t) || u.email.toLowerCase().includes(t)),
  );
});

const AVATAR_COLORS = [
  'from-[#F69008] to-[#D97706]', 'from-blue-500 to-cyan-600', 'from-emerald-500 to-teal-600',
  'from-amber-500 to-orange-600', 'from-rose-500 to-pink-600', 'from-purple-500 to-fuchsia-600',
];
function avatarColor(s: string) {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}
const initials = (n: string) => n.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();

const copied = ref<string | null>(null);
function copyEmail(email: string) {
  navigator.clipboard?.writeText(email);
  copied.value = email;
  setTimeout(() => { if (copied.value === email) copied.value = null; }, 1500);
}

const isSelf    = (u: User) => u.id === auth.user?.id;
const canManage = (u: User) => u.role !== 'owner';

// ── Vista: lista | formulario ─────────────────────────────────────────────────
type View = 'list' | 'form';
const view    = ref<View>('list');
const editing = ref<User | null>(null);
const saving  = ref(false);
const error   = ref('');
const form    = ref({ name: '', email: '', password: '', role: 'member' as 'admin' | 'member', permissions: [] as string[] });

function openCreate() {
  editing.value = null; error.value = '';
  form.value = { name: '', email: '', password: '', role: 'member', permissions: [] };
  view.value = 'form';
}
function openEdit(u: User) {
  if (!canManage(u)) return;
  editing.value = u; error.value = '';
  form.value = {
    name: u.name, email: u.email, password: '',
    role: u.role === 'admin' ? 'admin' : 'member',
    permissions: [...(u.permissions ?? [])],
  };
  view.value = 'form';
}
function goBack() { view.value = 'list'; error.value = ''; }

function toggleModule(key: string) {
  const i = form.value.permissions.indexOf(key);
  if (i >= 0) form.value.permissions.splice(i, 1); else form.value.permissions.push(key);
}

async function save() {
  error.value = ''; saving.value = true;
  try {
    const perms = form.value.role === 'admin' ? [] : form.value.permissions;
    if (editing.value) {
      const patch: Record<string, unknown> = { name: form.value.name, role: form.value.role, permissions: perms };
      if (form.value.password) patch.password = form.value.password;
      await api.patch(`/users/${editing.value.id}`, patch);
    } else {
      await api.post('/users', {
        name: form.value.name, email: form.value.email,
        password: form.value.password, role: form.value.role, permissions: perms,
      });
    }
    await load();
    view.value = 'list';
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'No se pudo guardar';
  } finally { saving.value = false; }
}

async function remove(u: User) {
  if (!confirm(`¿Eliminar a "${u.name}"?`)) return;
  try { await api.del(`/users/${u.id}`); await load(); view.value = 'list'; }
  catch (e) { alert(e instanceof Error ? e.message : 'No se pudo eliminar'); }
}
</script>

<template>
  <div class="flex h-full flex-col overflow-hidden">

    <!-- ════════════════════════════════════════════
         VISTA: LISTA DE USUARIOS
    ════════════════════════════════════════════ -->
    <template v-if="view === 'list'">
      <!-- Barra superior -->
      <div class="flex flex-shrink-0 items-center justify-between border-b border-slate-200 bg-white px-6 py-3.5">
        <div class="flex items-center gap-3">
          <div>
            <h3 class="text-[15px] font-semibold text-slate-900">Mi equipo</h3>
            <p class="text-[12px] text-slate-400">Gestiona usuarios y sus permisos por módulo</p>
          </div>
          <span class="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-500">{{ filtered.length }}</span>
        </div>
        <div class="flex items-center gap-3">
          <select
            v-model="roleFilter"
            class="cursor-pointer rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-600 focus:border-primary focus:outline-none"
          >
            <option value="">Todos los roles</option>
            <option value="owner">Owner</option>
            <option value="admin">Administrador</option>
            <option value="member">Miembro</option>
          </select>
          <div class="relative">
            <Search class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input v-model="search" placeholder="Nombre o email…" class="w-52 rounded-lg border border-slate-200 py-1.5 pl-9 pr-3 text-sm focus:border-primary focus:outline-none" />
          </div>
          <button
            class="flex cursor-pointer items-center gap-2 rounded-lg bg-primary px-4 py-1.5 text-sm font-semibold text-white shadow-sm shadow-primary/30 transition-all hover:bg-primary-dark"
            @click="openCreate"
          >
            <Plus class="h-4 w-4" /> Añadir usuario
          </button>
        </div>
      </div>

      <LoadingState v-if="loading" label="Cargando usuarios…" />

      <div v-else class="flex flex-1 flex-col overflow-hidden bg-white">
        <div class="flex-1 overflow-auto">
          <table class="w-full text-sm">
            <thead class="sticky top-0 z-10">
              <tr class="border-b border-slate-200 bg-slate-50/95 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 backdrop-blur">
                <th class="px-6 py-3.5">Nombre</th>
                <th class="px-3 py-3.5">Email</th>
                <th class="px-3 py-3.5">Rol</th>
                <th class="px-3 py-3.5">Módulos</th>
                <th class="w-24 px-6 py-3.5 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="u in filtered" :key="u.id"
                class="group border-b border-slate-100 transition-colors last:border-0 hover:bg-[#F69008]/4"
                :class="canManage(u) ? 'cursor-pointer' : ''"
                @click="openEdit(u)"
              >
                <td class="px-6 py-4">
                  <div class="flex items-center gap-3">
                    <div class="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-xs font-bold text-white shadow-sm" :class="avatarColor(u.name)">
                      {{ initials(u.name) }}
                    </div>
                    <div>
                      <p class="font-semibold text-slate-900">
                        {{ u.name }}
                        <span v-if="isSelf(u)" class="ml-1 text-xs font-normal text-slate-400">(tú)</span>
                      </p>
                    </div>
                  </div>
                </td>
                <td class="px-3 py-4" @click.stop>
                  <div class="flex items-center gap-1.5 text-slate-500">
                    {{ u.email }}
                    <button class="cursor-pointer rounded p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-primary" @click="copyEmail(u.email)">
                      <Check v-if="copied === u.email" class="h-3.5 w-3.5 text-emerald-500" />
                      <Copy v-else class="h-3.5 w-3.5" />
                    </button>
                  </div>
                </td>
                <td class="px-3 py-4">
                  <span class="rounded-full px-2.5 py-1 text-xs font-semibold" :class="roleBadge[u.role]">{{ roleLabel[u.role] }}</span>
                </td>
                <td class="px-3 py-4">
                  <span v-if="u.role === 'owner' || u.role === 'admin'" class="flex items-center gap-1 text-xs text-slate-400">
                    <Shield class="h-3.5 w-3.5" /> Acceso total
                  </span>
                  <div v-else-if="u.permissions?.length" class="flex flex-wrap gap-1">
                    <span v-for="k in u.permissions" :key="k" class="rounded-md bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">{{ moduleLabel(k) }}</span>
                  </div>
                  <span v-else class="text-xs text-slate-300">Sin acceso</span>
                </td>
                <td class="px-6 py-4" @click.stop>
                  <div class="flex items-center justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    <button v-if="canManage(u) && !isSelf(u)" class="cursor-pointer rounded-md p-1.5 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600" @click="remove(u)">
                      <Trash2 class="h-4 w-4" />
                    </button>
                  </div>
                </td>
              </tr>
              <tr v-if="filtered.length === 0">
                <td colspan="5" class="px-4 py-20 text-center text-slate-400">
                  {{ search || roleFilter ? 'Ningún usuario coincide.' : 'No hay usuarios todavía.' }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="flex flex-shrink-0 items-center justify-between border-t border-slate-100 bg-slate-50/60 px-6 py-2.5 text-xs text-slate-400">
          <span>{{ filtered.length }} usuario{{ filtered.length === 1 ? '' : 's' }}</span>
          <span>Página 1 de 1</span>
        </div>
      </div>
    </template>

    <!-- ════════════════════════════════════════════
         VISTA: FORMULARIO DE USUARIO
    ════════════════════════════════════════════ -->
    <template v-else>
      <!-- Barra de navegación / breadcrumb -->
      <div class="flex flex-shrink-0 items-center justify-between border-b border-slate-200 bg-white px-6 py-3.5">
        <div class="flex items-center gap-3">
          <button
            class="flex cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800"
            @click="goBack"
          >
            <ArrowLeft class="h-4 w-4" />
            Mi equipo
          </button>
          <span class="text-slate-300">/</span>
          <span class="text-sm font-medium text-slate-900">{{ editing ? editing.name : 'Nuevo usuario' }}</span>
        </div>
        <div class="flex items-center gap-2">
          <button
            v-if="editing && canManage(editing) && !isSelf(editing)"
            class="cursor-pointer rounded-lg px-3 py-2 text-sm font-medium text-red-500 transition-colors hover:bg-red-50 hover:text-red-600"
            @click="remove(editing)"
          >Eliminar usuario</button>
          <button
            class="cursor-pointer rounded-lg px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100"
            @click="goBack"
          >Cancelar</button>
          <button
            :disabled="saving"
            class="flex cursor-pointer items-center gap-2 rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-white shadow-sm shadow-primary/30 transition-all hover:bg-primary-dark disabled:opacity-60"
            @click="save"
          >
            <Spinner v-if="saving" :size="15" light />
            {{ saving ? 'Guardando…' : editing ? 'Guardar cambios' : 'Crear usuario' }}
          </button>
        </div>
      </div>

      <!-- Cuerpo del formulario -->
      <div class="flex-1 overflow-y-auto bg-[#F1F5F9]">
        <div class="mx-auto max-w-4xl px-6 py-8">

          <p v-if="error" class="mb-6 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600 border border-red-100">{{ error }}</p>

          <!-- Grid principal 2 columnas -->
          <div class="grid grid-cols-3 gap-6">

            <!-- Columna izquierda: Avatar + resumen -->
            <div class="col-span-1 space-y-4">
              <!-- Tarjeta de identidad -->
              <div class="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <div class="flex flex-col items-center text-center">
                  <div
                    class="mb-3 flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br text-2xl font-bold text-white shadow-md"
                    :class="form.name ? avatarColor(form.name) : 'from-slate-300 to-slate-400'"
                  >
                    {{ form.name ? initials(form.name) : '?' }}
                  </div>
                  <p class="text-[15px] font-semibold text-slate-900">{{ form.name || 'Nombre del usuario' }}</p>
                  <p class="mt-0.5 text-xs text-slate-400">{{ form.email || 'email@empresa.com' }}</p>
                  <span class="mt-3 rounded-full px-3 py-1 text-xs font-semibold" :class="roleBadge[form.role]">
                    {{ roleLabel[form.role] }}
                  </span>
                </div>
              </div>

              <!-- Módulos activos (preview) -->
              <div class="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <p class="mb-3 text-[11px] font-bold uppercase tracking-wider text-slate-400">Acceso a módulos</p>
                <div v-if="form.role === 'admin'" class="flex items-center gap-2 text-xs text-slate-500">
                  <Shield class="h-4 w-4 text-amber-500" /> Acceso total
                </div>
                <div v-else-if="form.permissions.length" class="flex flex-wrap gap-1.5">
                  <span v-for="k in form.permissions" :key="k" class="rounded-md bg-primary/10 px-2.5 py-1 text-[11px] font-semibold text-primary">
                    {{ moduleLabel(k) }}
                  </span>
                </div>
                <p v-else class="text-xs text-slate-400">Sin módulos asignados</p>
              </div>
            </div>

            <!-- Columna derecha: Campos -->
            <div class="col-span-2 space-y-5">

              <!-- Sección: Información personal -->
              <div class="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                <div class="mb-5 flex items-center gap-2.5 border-b border-slate-100 pb-4">
                  <UserRound class="h-4 w-4 text-primary" />
                  <h4 class="text-[13px] font-semibold text-slate-700">Información personal</h4>
                </div>
                <div class="grid grid-cols-2 gap-4">
                  <div class="col-span-2">
                    <label class="uf-label">Nombre completo</label>
                    <input v-model="form.name" class="uf-input" placeholder="Ej. María González" />
                  </div>
                  <div>
                    <label class="uf-label">Email de acceso</label>
                    <div class="relative">
                      <Mail class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <input v-model="form.email" type="email" :disabled="!!editing" class="uf-input pl-9 disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed" placeholder="correo@empresa.com" />
                    </div>
                  </div>
                  <div>
                    <label class="uf-label">{{ editing ? 'Nueva contraseña (opcional)' : 'Contraseña' }}</label>
                    <div class="relative">
                      <Lock class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <input v-model="form.password" type="password" class="uf-input pl-9" :placeholder="editing ? 'Dejar en blanco para no cambiar' : 'Mínimo 8 caracteres'" />
                    </div>
                  </div>
                </div>
              </div>

              <!-- Sección: Rol -->
              <div class="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                <div class="mb-5 flex items-center gap-2.5 border-b border-slate-100 pb-4">
                  <Shield class="h-4 w-4 text-primary" />
                  <h4 class="text-[13px] font-semibold text-slate-700">Rol del usuario</h4>
                </div>
                <div class="grid grid-cols-2 gap-3">
                  <label
                    class="flex cursor-pointer items-start gap-3 rounded-xl border-2 p-4 transition-all"
                    :class="form.role === 'member' ? 'border-primary bg-primary/5' : 'border-slate-200 hover:border-slate-300'"
                  >
                    <input type="radio" v-model="form.role" value="member" class="sr-only" />
                    <div class="mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full border-2 transition-colors" :class="form.role === 'member' ? 'border-primary' : 'border-slate-300'">
                      <div v-if="form.role === 'member'" class="h-2 w-2 rounded-full bg-primary"></div>
                    </div>
                    <div>
                      <p class="text-[13px] font-semibold text-slate-900">Miembro</p>
                      <p class="mt-0.5 text-xs leading-relaxed text-slate-500">Accede solo a los módulos que le asignes explícitamente.</p>
                    </div>
                  </label>
                  <label
                    class="flex cursor-pointer items-start gap-3 rounded-xl border-2 p-4 transition-all"
                    :class="form.role === 'admin' ? 'border-primary bg-primary/5' : 'border-slate-200 hover:border-slate-300'"
                  >
                    <input type="radio" v-model="form.role" value="admin" class="sr-only" />
                    <div class="mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full border-2 transition-colors" :class="form.role === 'admin' ? 'border-primary' : 'border-slate-300'">
                      <div v-if="form.role === 'admin'" class="h-2 w-2 rounded-full bg-primary"></div>
                    </div>
                    <div>
                      <p class="text-[13px] font-semibold text-slate-900">Administrador</p>
                      <p class="mt-0.5 text-xs leading-relaxed text-slate-500">Acceso completo a todos los módulos y configuraciones del negocio.</p>
                    </div>
                  </label>
                </div>
              </div>

              <!-- Sección: Permisos (solo miembro) -->
              <div v-if="form.role === 'member'" class="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                <div class="mb-1 flex items-center gap-2.5 border-b border-slate-100 pb-4">
                  <Users class="h-4 w-4 text-primary" />
                  <h4 class="text-[13px] font-semibold text-slate-700">Módulos permitidos</h4>
                  <span class="ml-auto text-xs text-slate-400">{{ form.permissions.length }} de {{ MODULES.length }} activos</span>
                </div>
                <p class="mb-4 text-xs text-slate-400">Elige a qué partes de la plataforma tendrá acceso este usuario.</p>
                <div class="grid grid-cols-1 gap-2">
                  <label
                    v-for="m in MODULES" :key="m.key"
                    class="flex cursor-pointer items-start gap-4 rounded-xl border-2 p-4 transition-all"
                    :class="form.permissions.includes(m.key) ? 'border-primary bg-primary/5' : 'border-slate-200 hover:border-slate-300'"
                    @click.prevent="toggleModule(m.key)"
                  >
                    <!-- Checkbox visual -->
                    <div
                      class="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md border-2 transition-all"
                      :class="form.permissions.includes(m.key) ? 'border-primary bg-primary' : 'border-slate-300 bg-white'"
                    >
                      <Check v-if="form.permissions.includes(m.key)" class="h-3 w-3 text-white" />
                    </div>
                    <div class="flex-1 min-w-0">
                      <p class="text-[13px] font-semibold text-slate-900">{{ m.label }}</p>
                      <p class="mt-1 text-xs leading-relaxed text-slate-500">{{ m.description }}</p>
                    </div>
                  </label>
                </div>
              </div>

              <div v-else class="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4">
                <Shield class="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-500" />
                <p class="text-sm text-amber-700 leading-relaxed">Los administradores tienen acceso completo a todos los módulos sin necesidad de asignar permisos individuales.</p>
              </div>

            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style>
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
