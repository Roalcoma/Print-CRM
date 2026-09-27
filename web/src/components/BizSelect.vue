<script setup lang="ts">
// Reemplazo estándar del <select> nativo: dropdown propio con estilo Rocco.
// Soporta valores string o number (el valor emitido conserva su tipo), grupos
// de opciones (equivalente a <optgroup>), búsqueda en listas largas y disabled.
import { computed, ref, nextTick, type Directive } from 'vue';
import { ChevronDown, Check, Search } from 'lucide-vue-next';
import Dropdown from './Dropdown.vue';

type Value = string | number;
interface Option { value: Value; label: string; group?: string }

const props = defineProps<{
  modelValue: Value | null | undefined;
  options: readonly Option[] | readonly string[];
  placeholder?: string;
  /** Clases del botón disparador; por defecto el estilo `biz-input` global */
  inputClass?: string;
  disabled?: boolean;
  /** Muestra buscador; por defecto se activa solo con más de 12 opciones */
  searchable?: boolean;
}>();
const emit = defineEmits<{ 'update:modelValue': [v: any] }>();

const normalized = computed<Option[]>(() =>
  props.options.map(o => typeof o === 'string' ? { value: o, label: o } : o)
);
const selected = computed(() => normalized.value.find(o => o.value === props.modelValue));
const showSearch = computed(() => props.searchable ?? normalized.value.length > 12);

const query = ref('');
const filtered = computed(() => {
  const q = query.value.trim().toLowerCase();
  if (!q) return normalized.value;
  return normalized.value.filter(o =>
    o.label.toLowerCase().includes(q) || (o.group ?? '').toLowerCase().includes(q));
});

// El menú se monta al abrir: limpia la búsqueda y enfoca el input.
const vFocus: Directive<HTMLInputElement> = {
  mounted(el) { query.value = ''; nextTick(() => el.focus({ preventScroll: true })); },
};

function pick(val: Value) {
  emit('update:modelValue', val);
}
</script>

<template>
  <Dropdown width="100%" triggerClass="block w-full" :disabled="disabled">
    <template #trigger="{ open }">
      <button
        type="button"
        :disabled="disabled"
        class="flex w-full cursor-pointer items-center justify-between gap-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-[#F69008]/30 disabled:cursor-not-allowed disabled:opacity-50"
        :class="[inputClass ?? 'biz-input', open ? '!border-[#F69008] bg-white shadow-[0_0_0_3px_rgba(246,144,8,0.12)]' : '']"
      >
        <span class="truncate" :class="selected ? 'text-slate-900' : 'text-slate-400'">
          {{ selected?.label ?? placeholder ?? 'Seleccionar…' }}
        </span>
        <ChevronDown
          class="h-4 w-4 flex-shrink-0 text-slate-400 transition-transform duration-150"
          :class="open ? 'rotate-180 text-[#F69008]' : ''"
        />
      </button>
    </template>

    <template #default="{ close }">
    <!-- Buscador (no cierra el menú al hacer clic) -->
    <div v-if="showSearch" class="relative px-1 pb-1 pt-0.5" @click.stop>
      <Search class="pointer-events-none absolute left-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
      <input
        v-model="query"
        v-focus
        placeholder="Buscar…"
        class="w-full rounded-md border border-slate-200 bg-slate-50 py-1.5 pl-8 pr-2 text-[13px] text-slate-700 focus:border-[#F69008] focus:bg-white focus:outline-none"
        @keydown.enter.prevent="if (filtered[0]) { pick(filtered[0].value); close(); }"
      />
    </div>

    <!-- Lista de opciones -->
    <div class="max-h-64 overflow-y-auto py-1">
      <button
        v-if="placeholder && !query"
        type="button"
        class="flex w-full items-center px-3 py-2 text-[13px] text-slate-400 hover:bg-slate-50"
        @click="pick('')"
      >
        {{ placeholder }}
      </button>
      <template v-for="(opt, i) in filtered" :key="String(opt.value)">
        <p
          v-if="opt.group && opt.group !== filtered[i - 1]?.group"
          class="px-3 pb-1 pt-2.5 text-[10px] font-bold uppercase tracking-widest text-slate-400"
        >
          {{ opt.group }}
        </p>
        <button
          type="button"
          class="flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-[13px] transition-colors"
          :class="modelValue === opt.value
            ? 'bg-primary/8 font-semibold text-primary'
            : 'text-slate-700 hover:bg-slate-50'"
          @click="pick(opt.value)"
        >
          <span>{{ opt.label }}</span>
          <Check v-if="modelValue === opt.value" class="h-3.5 w-3.5 flex-shrink-0" />
        </button>
      </template>
      <p v-if="!filtered.length" class="px-3 py-3 text-center text-[13px] text-slate-400">Sin resultados</p>
    </div>
    </template>
  </Dropdown>
</template>
