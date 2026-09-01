<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { Bell } from 'lucide-vue-next';
import { api } from '../api';
import type { Notification } from '../types';

const open = ref(false);
const notifications = ref<Notification[]>([]);
const loading = ref(false);

const bellRef = ref<HTMLButtonElement | null>(null);
const panelTop = ref(0);
const panelRight = ref(0);

const unreadCount = computed(() => notifications.value.filter(n => n.read_at === null).length);

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Ahora';
  if (mins < 60) return `hace ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `hace ${hrs}h`;
  return `hace ${Math.floor(hrs / 24)}d`;
}

async function fetchNotifications() {
  try {
    const data = await api.get<Notification[]>('/notifications');
    notifications.value = data;
  } catch {
    // silently ignore polling errors
  }
}

function updatePanelPosition() {
  if (!bellRef.value) return;
  const rect = bellRef.value.getBoundingClientRect();
  panelTop.value = rect.bottom + 8;
  panelRight.value = window.innerWidth - rect.right;
}

async function toggle() {
  open.value = !open.value;
  if (open.value) {
    updatePanelPosition();
    if (!loading.value) {
      loading.value = true;
      await fetchNotifications();
      loading.value = false;
    }
  }
}

async function markRead(n: Notification) {
  if (n.read_at !== null) return;
  try {
    const updated = await api.patch<Notification>(`/notifications/${n.id}/read`, {});
    const idx = notifications.value.findIndex(x => x.id === n.id);
    if (idx !== -1) notifications.value[idx] = updated;
  } catch {
    // ignore
  }
}

async function markAllRead() {
  try {
    await api.post('/notifications/read-all', {});
    notifications.value = notifications.value.map(n => ({ ...n, read_at: n.read_at ?? new Date().toISOString() }));
  } catch {
    // ignore
  }
}

function onClickOutside(e: MouseEvent) {
  if (!open.value) return;
  const target = e.target as Node;
  const panel = document.getElementById('notifications-panel');
  if (bellRef.value?.contains(target)) return;
  if (panel?.contains(target)) return;
  open.value = false;
}

let intervalId: ReturnType<typeof setInterval> | null = null;

onMounted(() => {
  fetchNotifications();
  intervalId = setInterval(fetchNotifications, 60_000);
  document.addEventListener('click', onClickOutside, true);
});

onUnmounted(() => {
  if (intervalId) clearInterval(intervalId);
  document.removeEventListener('click', onClickOutside, true);
});
</script>

<template>
  <div class="relative">
    <button
      ref="bellRef"
      class="relative cursor-pointer rounded-lg border border-slate-200 p-2 text-slate-500 transition-all duration-200 hover:border-slate-300 hover:bg-slate-50 hover:text-primary hover:shadow-sm"
      aria-label="Notificaciones"
      @click="toggle"
    >
      <Bell class="h-5 w-5" />
      <span
        v-if="unreadCount > 0"
        class="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white ring-2 ring-white"
      >
        {{ unreadCount > 9 ? '9+' : unreadCount }}
      </span>
    </button>

    <Teleport to="body">
      <div
        v-if="open"
        id="notifications-panel"
        class="fixed z-50 w-80 rounded-xl border border-slate-200 bg-white shadow-xl"
        :style="{ top: panelTop + 'px', right: panelRight + 'px' }"
      >
        <!-- Header -->
        <div class="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <span class="text-sm font-semibold text-slate-800">Notificaciones</span>
          <button
            v-if="unreadCount > 0"
            class="text-xs font-medium text-primary hover:underline"
            @click="markAllRead"
          >
            Marcar todas
          </button>
        </div>

        <!-- List -->
        <ul class="max-h-96 overflow-y-auto divide-y divide-slate-100">
          <li v-if="notifications.length === 0" class="flex flex-col items-center gap-2 py-10 text-slate-400">
            <Bell class="h-8 w-8 opacity-40" />
            <span class="text-sm">No tienes notificaciones</span>
          </li>

          <li
            v-for="n in notifications"
            :key="n.id"
            class="flex cursor-pointer gap-3 px-4 py-3 transition-colors hover:bg-slate-50"
            @click="markRead(n)"
          >
            <!-- Unread indicator -->
            <div class="mt-1.5 flex-shrink-0">
              <span
                class="block h-2.5 w-2.5 rounded-full"
                :class="n.read_at === null ? 'bg-cta' : 'bg-slate-300'"
              />
            </div>

            <div class="min-w-0 flex-1">
              <p
                class="truncate text-sm leading-snug"
                :class="n.read_at === null ? 'font-semibold text-slate-800' : 'font-normal text-slate-600'"
              >
                {{ n.title }}
              </p>
              <p v-if="n.body" class="mt-0.5 line-clamp-2 text-xs text-slate-400">{{ n.body }}</p>
              <p class="mt-1 text-[11px] text-slate-400">{{ timeAgo(n.created_at) }}</p>
            </div>
          </li>
        </ul>
      </div>
    </Teleport>
  </div>
</template>
