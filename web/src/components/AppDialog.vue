<script setup lang="ts">
import { computed } from 'vue';
import { AlertCircle, Trash2, X } from 'lucide-vue-next';
import { dialogState } from '../composables/useDialog';

const d = computed(() => dialogState.value);

function resolve(value: boolean) {
  dialogState.value?.resolve(value);
  dialogState.value = null;
}
</script>

<template>
  <Teleport to="body">
    <Transition name="dialog-fade">
      <div v-if="d" class="fixed inset-0 z-[200] flex items-center justify-center p-4">
        <!-- Backdrop -->
        <div class="absolute inset-0 bg-black/40 backdrop-blur-sm" @click="resolve(false)" />

        <!-- Panel -->
        <div class="relative w-full max-w-sm rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200">
          <!-- Header -->
          <div class="flex items-start gap-3.5 p-6 pb-4">
            <div
              class="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full"
              :class="d.type === 'confirm' ? 'bg-red-100' : 'bg-primary/10'"
            >
              <Trash2 v-if="d.type === 'confirm'" class="h-5 w-5 text-red-600" />
              <AlertCircle v-else class="h-5 w-5 text-primary" />
            </div>
            <div class="min-w-0 flex-1 pt-0.5">
              <p class="text-[15px] font-semibold text-slate-900">
                {{ d.title ?? (d.type === 'confirm' ? 'Confirmar acción' : 'Aviso') }}
              </p>
              <p class="mt-1 text-sm leading-relaxed text-slate-500">{{ d.message }}</p>
            </div>
            <button
              class="flex-shrink-0 rounded-lg p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
              @click="resolve(false)"
            >
              <X class="h-4 w-4" />
            </button>
          </div>

          <!-- Footer -->
          <div class="flex justify-end gap-2.5 border-t border-slate-100 px-6 py-4">
            <button v-if="d.type === 'confirm'" class="btn btn-ghost" @click="resolve(false)">
              Cancelar
            </button>
            <button
              class="btn"
              :class="d.type === 'confirm' ? 'btn-danger' : 'btn-primary'"
              @click="resolve(true)"
            >
              {{ d.type === 'confirm' ? (d.confirmLabel ?? 'Confirmar') : 'Aceptar' }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.dialog-fade-enter-active,
.dialog-fade-leave-active { transition: opacity 0.15s ease; }
.dialog-fade-enter-active .relative,
.dialog-fade-leave-active .relative { transition: transform 0.15s ease, opacity 0.15s ease; }
.dialog-fade-enter-from,
.dialog-fade-leave-to { opacity: 0; }
.dialog-fade-enter-from .relative { transform: scale(0.95); opacity: 0; }
.dialog-fade-leave-to .relative  { transform: scale(0.95); opacity: 0; }
</style>
