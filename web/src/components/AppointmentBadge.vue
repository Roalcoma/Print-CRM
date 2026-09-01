<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { CalendarDays } from 'lucide-vue-next';
import { api } from '../api';
import type { Appointment } from '../types';

const props = defineProps<{
  opportunityId?: string;
  contactId?: string;
}>();

const next = ref<Appointment | null>(null);

function fmtBadge(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('es-VE', { day: 'numeric', month: 'short' }) + ', ' +
    d.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit', hour12: true });
}

onMounted(async () => {
  try {
    let url = '';
    if (props.opportunityId) url = `/appointments?opportunityId=${props.opportunityId}`;
    else if (props.contactId) url = `/appointments?contactId=${props.contactId}`;
    else return;

    const all = await api.get<Appointment[]>(url);
    const now = new Date();
    next.value = all.find(a => a.status === 'scheduled' && new Date(a.start_at) > now) ?? null;
  } catch {
    // silently ignore
  }
});
</script>

<template>
  <span
    v-if="next"
    class="inline-flex items-center gap-1 rounded-full border border-[#60D0FA]/30 bg-[#60D0FA]/15 px-2 py-0.5 text-xs font-medium text-[#0284C7]"
    :title="next.title"
  >
    <CalendarDays class="h-3 w-3 flex-shrink-0" />
    {{ fmtBadge(next.start_at) }}
  </span>
</template>
