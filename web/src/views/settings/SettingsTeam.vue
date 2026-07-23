<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { Plus, Pencil, Trash2, X, Search, Copy, Check, UserRound } from 'lucide-vue-next';
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
const roleBadge: Record<string, string> = { owner: 'bg-violet-50 text-violet-700', admin: 'bg-indigo-50 text-indigo-700', member: 'bg-slate-100 text-slate-600' };
const moduleLabel = (k: string) => MODULES.find(m => m.key === k)?.label ?? k;

const filtered = computed(() => {
  const t = search.value.trim().toLowerCase();
  return users.value.filter(u =>
    (!roleFilter.value || u.role === roleFilter.value) &&
    (!t || u.name.toLowerCase().includes(t) || u.email.toLowerCase().includes(t)),
  );
});

// Avatar con color determinístico por nombre (estilo GHL).
const AVATAR_COLORS = [
  'from-indigo-500 to-violet-600', 'from-blue-500 to-cyan-600', 'from-emerald-500 to-teal-600',
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

// ── Modal crear/editar ────────────────────────────────────────────────────────
const showForm = ref(false);
const editing = ref<User | null>(null);
const saving = ref(false);
const error = ref('');
const form = ref({ name: '', email: '', password: '', role: 'member' as 'admin' | 'member', permissions: [] as string[] });

function openCreate() {
  editing.value = null; error.value = '';
  form.value = { name: '', email: '', password: '', role: 'member', permissions: [] };
  showForm.value = true;
}
function openEdit(u: User) {
  editing.value = u; error.value = '';
  form.value = { name: u.name, email: u.email, password: '', role: (u.role === 'admin' ? 'admin' : 'member'), permissions: [...(u.permissions ?? [])] };
  showForm.value = true;
}
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
      await api.post('/users', { name: form.value.name, email: form.value.email, password: form.value.password, role: form.value.role, permissions: perms });
    }
    await load();
    showForm.value = false;
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'No se pudo guardar';
  } finally {
    saving.value = false;
  }
}
async function remove(u: User) {
  if (!confirm(`¿Eliminar a "${u.name}"?`)) return;
  try { await api.del(`/users/${u.id}`); await load(); }
  catch (e) { alert(e instanceof Error ? e.message : 'No se pudo eliminar'); }
}
const isSelf = (u: User) => u.id === auth.user?.id;
const canManage = (u: User) => u.role !== 'owner';
</script>

<template>
  <div class="p-8">
    <div class="mx-auto max-w-5xl">
      <div class="mb-6">
        <h3 class="text-xl font-semibold text-slate-900">Mi equipo</h3>
        <p class="mt-1 text-sm text-slate-500">Gestiona los usuarios de tu equipo y sus permisos por módulo.</p>
      </div>

      <!-- Toolbar -->
      <div class="mb-4 flex flex-wrap items-center gap-3">
        <select v-model="roleFilter" class="cursor-pointer rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none">
          <option value="">Todos los roles</option>
          <option value="owner">Owner</option>
          <option value="admin">Administrador</option>
          <option value="member">Miembro</option>
        </select>
        <div class="relative flex-1 sm:max-w-xs">
          <Search class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input v-model="search" placeholder="Nombre o email…" class="w-full rounded-md border border-slate-300 py-2 pl-9 pr-3 text-sm shadow-sm focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none" />
        </div>
        <button class="ml-auto flex cursor-pointer items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-primary/30 transition-all hover:bg-primary-dark hover:shadow-md" @click="openCreate">
          <Plus class="h-4 w-4" /> Añadir usuario
        </button>
      </div>

      <LoadingState v-if="loading" label="Cargando usuarios…" />

      <div v-else class="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-card">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-slate-200 bg-slate-50/80 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <th class="px-4 py-3">Nombre</th>
              <th class="px-2 py-3">Email</th>
              <th class="px-2 py-3">Rol</th>
              <th class="px-2 py-3">Módulos</th>
              <th class="w-24 px-4 py-3 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="u in filtered" :key="u.id" class="border-b border-slate-100 transition-colors last:border-0 hover:bg-indigo-50/40">
              <td class="px-4 py-3">
                <div class="flex items-center gap-3">
                  <div class="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-xs font-semibold text-white shadow-sm" :class="avatarColor(u.name)">{{ initials(u.name) }}</div>
                  <p class="font-medium text-slate-900">{{ u.name }} <span v-if="isSelf(u)" class="text-xs font-normal text-slate-400">(tú)</span></p>
                </div>
              </td>
              <td class="px-2 py-3">
                <div class="flex items-center gap-1.5 text-slate-600">
                  {{ u.email }}
                  <button class="cursor-pointer rounded p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-primary" :title="copied === u.email ? 'Copiado' : 'Copiar email'" @click="copyEmail(u.email)">
                    <Check v-if="copied === u.email" class="h-3.5 w-3.5 text-emerald-500" />
                    <Copy v-else class="h-3.5 w-3.5" />
                  </button>
                </div>
              </td>
              <td class="px-2 py-3">
                <span class="rounded-full px-2.5 py-0.5 text-xs font-semibold" :class="roleBadge[u.role]">{{ roleLabel[u.role] }}</span>
              </td>
              <td class="px-2 py-3">
                <span v-if="u.role === 'owner' || u.role === 'admin'" class="text-xs text-slate-400">Acceso total</span>
                <div v-else-if="u.permissions?.length" class="flex flex-wrap gap-1">
                  <span v-for="k in u.permissions" :key="k" class="rounded-sm bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-600">{{ moduleLabel(k) }}</span>
                </div>
                <span v-else class="text-xs text-slate-400">Sin módulos</span>
              </td>
              <td class="px-4 py-3">
                <div class="flex items-center justify-end gap-1">
                  <button v-if="canManage(u)" class="cursor-pointer rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-primary" title="Editar" @click="openEdit(u)"><Pencil class="h-4 w-4" /></button>
                  <button v-if="canManage(u) && !isSelf(u)" class="cursor-pointer rounded-md p-1.5 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600" title="Eliminar" @click="remove(u)"><Trash2 class="h-4 w-4" /></button>
                  <span v-if="!canManage(u)" class="text-xs text-slate-300">—</span>
                </div>
              </td>
            </tr>
            <tr v-if="filtered.length === 0">
              <td colspan="5" class="px-4 py-12 text-center text-slate-400">{{ search || roleFilter ? 'Ningún usuario coincide.' : 'No hay usuarios.' }}</td>
            </tr>
          </tbody>
        </table>
        <div class="flex items-center justify-between border-t border-slate-200 bg-slate-50/50 px-4 py-2.5 text-xs text-slate-500">
          <span>{{ filtered.length }} usuario{{ filtered.length === 1 ? '' : 's' }}</span>
          <span>Página 1 de 1</span>
        </div>
      </div>
    </div>

    <!-- Modal crear/editar -->
    <Transition name="modal">
    <div v-if="showForm" class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" @click.self="showForm = false">
      <div class="modal-panel flex max-h-[90vh] w-full max-w-md flex-col rounded-md bg-white shadow-modal">
        <div class="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div class="flex items-center gap-3">
            <div class="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-sm"><UserRound class="h-5 w-5" /></div>
            <div>
              <h2 class="text-base font-semibold text-slate-900">{{ editing ? 'Editar usuario' : 'Añadir usuario' }}</h2>
              <p class="text-xs text-slate-500">Define su rol y a qué módulos accede</p>
            </div>
          </div>
          <button class="cursor-pointer rounded-md p-1 text-slate-400 hover:bg-slate-100" @click="showForm = false"><X class="h-5 w-5" /></button>
        </div>

        <div class="flex-1 space-y-4 overflow-auto px-6 py-5">
          <div>
            <label class="mb-1 block text-sm font-medium text-slate-700">Nombre</label>
            <input v-model="form.name" class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none" />
          </div>
          <div>
            <label class="mb-1 block text-sm font-medium text-slate-700">Email</label>
            <input v-model="form.email" type="email" :disabled="!!editing" class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none disabled:bg-slate-50 disabled:text-slate-500" />
          </div>
          <div>
            <label class="mb-1 block text-sm font-medium text-slate-700">{{ editing ? 'Nueva contraseña (opcional)' : 'Contraseña' }}</label>
            <input v-model="form.password" type="password" :placeholder="editing ? 'Dejar en blanco para no cambiar' : 'Mínimo 8 caracteres'" class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none" />
          </div>
          <div>
            <label class="mb-1 block text-sm font-medium text-slate-700">Rol</label>
            <select v-model="form.role" class="w-full cursor-pointer rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none">
              <option value="member">Miembro</option>
              <option value="admin">Administrador (acceso total)</option>
            </select>
          </div>
          <div v-if="form.role === 'member'">
            <label class="mb-2 block text-sm font-medium text-slate-700">Módulos permitidos</label>
            <div class="space-y-1.5">
              <label v-for="m in MODULES" :key="m.key" class="flex cursor-pointer items-center gap-2.5 rounded-md border border-slate-200 px-3 py-2 shadow-sm transition-colors hover:border-slate-300">
                <input type="checkbox" :checked="form.permissions.includes(m.key)" class="h-4 w-4 cursor-pointer rounded border-slate-300 text-primary focus:ring-primary/30" @change="toggleModule(m.key)" />
                <span class="text-sm font-medium text-slate-700">{{ m.label }}</span>
              </label>
            </div>
          </div>
          <p v-else class="rounded-md bg-indigo-50 px-3 py-2 text-xs text-indigo-600">Los administradores tienen acceso a todos los módulos.</p>
          <p v-if="error" class="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{{ error }}</p>
        </div>

        <div class="flex items-center justify-end gap-2 border-t border-slate-200 px-6 py-4">
          <button class="cursor-pointer rounded-md px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100" @click="showForm = false">Cancelar</button>
          <button :disabled="saving" class="flex cursor-pointer items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-primary/30 transition-all hover:bg-primary-dark hover:shadow-md disabled:opacity-60" @click="save"><Spinner v-if="saving" :size="16" light /> {{ saving ? 'Guardando…' : editing ? 'Guardar' : 'Crear usuario' }}</button>
        </div>
      </div>
    </div>
    </Transition>
  </div>
</template>
