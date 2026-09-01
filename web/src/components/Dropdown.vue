<script setup lang="ts">
import { ref, onBeforeUnmount, nextTick } from 'vue';
// Menú flotante genérico. El menú se teletransporta al <body> con posición fija,
// así se superpone a todo y no lo recorta ningún contenedor con overflow.
const props = withDefaults(defineProps<{ align?: 'left' | 'right'; width?: string; triggerClass?: string }>(), {
  align: 'left', width: '', triggerClass: 'inline-flex',
});
const open = ref(false);
const triggerEl = ref<HTMLElement | null>(null);
const menuEl = ref<HTMLElement | null>(null);
const pos = ref({ top: 0, left: 0, minWidth: 0 });

function updatePos() {
  const el = triggerEl.value;
  if (!el) return;
  const r = el.getBoundingClientRect();
  const w = props.width ? parseInt(props.width) : r.width;
  let left = props.align === 'right' ? r.right - w : r.left;
  left = Math.max(8, Math.min(left, window.innerWidth - w - 8));
  let top = r.bottom + 6;
  const menuH = menuEl.value?.offsetHeight || 300;
  if (top + menuH > window.innerHeight - 8 && r.top - 6 - menuH > 8) top = r.top - 6 - menuH;
  pos.value = { top, left, minWidth: w };
}

async function toggle() {
  open.value = !open.value;
  if (open.value) { await nextTick(); updatePos(); await nextTick(); updatePos(); listen(true); } else listen(false);
}
function close() { open.value = false; listen(false); }

// Cierra al hacer clic fuera del trigger y del menú (sin overlay, no bloquea otros clics).
function onDocClick(e: MouseEvent) {
  const t = e.target as Node;
  if (triggerEl.value?.contains(t) || menuEl.value?.contains(t)) return;
  close();
}
function listen(on: boolean) {
  const fn = on ? window.addEventListener : window.removeEventListener;
  fn('scroll', updatePos, true);
  fn('resize', updatePos);
  const dfn = on ? document.addEventListener : document.removeEventListener;
  dfn('click', onDocClick as EventListener, true);
}
onBeforeUnmount(() => listen(false));
</script>

<template>
  <div ref="triggerEl" :class="triggerClass" @click="toggle">
    <slot name="trigger" :open="open" />
    <Teleport to="body">
      <Transition name="dropdown">
        <div
          v-if="open"
          ref="menuEl"
          class="fixed z-[60] overflow-hidden rounded-lg border border-slate-200 bg-white p-1 shadow-dropdown"
          :style="{ top: pos.top + 'px', left: pos.left + 'px', minWidth: pos.minWidth + 'px' }"
          @click="close"
        >
          <slot :close="close" />
        </div>
      </Transition>
    </Teleport>
  </div>
</template>
