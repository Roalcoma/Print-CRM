<script setup lang="ts">
// Tarjeta del anuncio de Meta (click-to-WhatsApp) del que vino un lead.
import { computed, ref } from 'vue';
import { Megaphone, ExternalLink, Copy, Check } from 'lucide-vue-next';
import type { AdRef } from '../types';

const props = defineProps<{ ad: AdRef; compact?: boolean }>();

const platform = computed(() =>
  props.ad.source_app === 'instagram' ? 'Instagram' : props.ad.source_app === 'facebook' ? 'Facebook' : 'Meta');
const adUrl = computed(() => props.ad.source_url ?? props.ad.media_url);

const copied = ref(false);
async function copyId() {
  if (!props.ad.source_id) return;
  try { await navigator.clipboard.writeText(props.ad.source_id); } catch { return; }
  copied.value = true;
  setTimeout(() => { copied.value = false; }, 1500);
}
</script>

<template>
  <div class="overflow-hidden rounded-md border border-[#F69008]/30 bg-[#F69008]/[0.04] text-xs">
    <div class="flex items-center gap-1.5 border-b border-[#F69008]/20 px-3 py-1.5 font-semibold text-[#b86a00]">
      <Megaphone class="h-3.5 w-3.5" />
      Llegó desde un anuncio de {{ platform }}
    </div>
    <div class="flex gap-3 p-3">
      <img v-if="ad.thumbnail" :src="ad.thumbnail" alt=""
        class="flex-shrink-0 rounded object-cover" :class="compact ? 'h-12 w-12' : 'h-16 w-16'" />
      <div class="min-w-0 flex-1">
        <p v-if="ad.title" class="font-semibold text-slate-800" :class="compact ? 'truncate' : ''">{{ ad.title }}</p>
        <p v-if="ad.body && !compact" class="mt-0.5 line-clamp-3 whitespace-pre-line text-slate-600">{{ ad.body }}</p>
        <div class="mt-2 flex flex-wrap items-center gap-2">
          <a v-if="adUrl" :href="adUrl" target="_blank" rel="noopener"
            class="inline-flex items-center gap-1 rounded-md bg-[#F69008] px-2.5 py-1 font-semibold text-white transition-colors hover:bg-[#dd8007]">
            <ExternalLink class="h-3 w-3" /> Ver anuncio
          </a>
          <button v-if="ad.source_id" type="button" :title="`ID del anuncio: ${ad.source_id}`"
            class="inline-flex cursor-pointer items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 font-mono text-[11px] text-slate-500 transition-colors hover:border-slate-300 hover:text-slate-700"
            @click.stop="copyId">
            <Check v-if="copied" class="h-3 w-3 text-emerald-500" /><Copy v-else class="h-3 w-3" />
            {{ compact ? 'Copiar ID' : `ID ${ad.source_id}` }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
