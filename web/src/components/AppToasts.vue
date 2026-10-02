<script setup lang="ts">
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-vue-next';
import { toasts, dismissToast } from '../composables/useToast';
</script>

<template>
  <Teleport to="body">
    <div class="pointer-events-none fixed bottom-4 right-4 z-[300] flex w-[calc(100%-2rem)] max-w-sm flex-col gap-2"
         role="status" aria-live="polite">
      <TransitionGroup name="app-toast">
        <div v-for="t in toasts" :key="t.id"
             class="pointer-events-auto flex items-start gap-2.5 rounded-xl px-4 py-3 text-sm font-medium text-white shadow-xl ring-1 ring-black/5"
             :class="t.kind === 'error' ? 'bg-red-600' : t.kind === 'success' ? 'bg-emerald-600' : 'bg-[#13243D]'">
          <AlertCircle v-if="t.kind === 'error'" class="mt-0.5 h-4 w-4 flex-shrink-0" />
          <CheckCircle2 v-else-if="t.kind === 'success'" class="mt-0.5 h-4 w-4 flex-shrink-0" />
          <Info v-else class="mt-0.5 h-4 w-4 flex-shrink-0 text-[#F69008]" />
          <p class="min-w-0 flex-1 break-words leading-snug">{{ t.message }}</p>
          <button class="-mr-1 flex-shrink-0 rounded p-0.5 opacity-70 transition-opacity hover:opacity-100"
                  aria-label="Cerrar aviso" @click="dismissToast(t.id)">
            <X class="h-4 w-4" />
          </button>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<style>
.app-toast-enter-active, .app-toast-leave-active { transition: all 0.25s ease; }
.app-toast-enter-from, .app-toast-leave-to { opacity: 0; transform: translateY(8px); }
</style>
