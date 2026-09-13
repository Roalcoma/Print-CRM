<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue';
import { useRoute } from 'vue-router';
import {
  Search, Plus, X, Send, Phone, Check, CheckCheck, Clock, FileText, Mic,
  MessageCircle, RefreshCw, Mail, Tag, CalendarDays, Briefcase, UserCircle2,
  ChevronRight, StickyNote, Trash2, MoreVertical, Play, Pause,
  Inbox, MessageSquare, Star,
} from 'lucide-vue-next';
import { api, getToken } from '../api';
import type { Conversation, ConvMessage, Contact } from '../types';
import { useWs } from '../composables/useWs';
import LoadingState from '../components/LoadingState.vue';
import Spinner from '../components/Spinner.vue';

// ── Tipos ─────────────────────────────────────────────────────────────────────
interface TimelineItem {
  type: 'message' | 'appointment' | 'opportunity';
  ts: string;
  data: Record<string, unknown>;
}
interface OppItem { id: string; title: string; status: string; value: string; stage_name: string; stage_color: string | null; pipeline_name: string; created_at: string }
interface ApptItem { id: string; title: string; status: string; start_at: string; meeting_url: string | null; created_at: string }
interface ContactBundle { contact: Contact | null; opportunities: OppItem[]; appointments: ApptItem[]; conv_phone?: string | null }
interface Pipeline { id: string; name: string; stages: { id: string; name: string; color: string }[] }

// ── WebSocket ────────────────────────────────────────────────────────────────
const { isConnected, on } = useWs();

on('message:new', (raw) => {
  const { conversationId, message } = raw as { conversationId: string; message: ConvMessage & { wa_message_id?: string } };
  if (activeId.value === conversationId) {
    const wsData = message as unknown as Record<string, unknown>;

    if (message.direction === 'outbound') {
      // Para outbound: primero intentar reemplazar un optimista con mismo body.
      // Esto cubre el race condition donde el WS del webhook llega antes del API response.
      const optimIdx = timeline.value.findIndex(i =>
        i.type === 'message' &&
        String(i.data.direction) === 'outbound' &&
        String(i.data.status) === 'sending' &&
        String(i.data.body ?? '') === String(message.body ?? ''),
      );
      if (optimIdx !== -1) {
        timeline.value[optimIdx] = { type: 'message', ts: message.created_at, data: wsData };
        return;
      }
      // Sin optimista: dedup por id o wa_message_id
      const dupItem = timeline.value.find(i =>
        i.type === 'message' && (
          String(i.data.id) === String(message.id) ||
          (message.wa_message_id && i.data.wa_message_id && String(i.data.wa_message_id) === message.wa_message_id)
        ),
      );
      if (dupItem) {
        // Actualizar wa_message_id para que los ACKs (doble palomita) funcionen
        if (message.wa_message_id && !dupItem.data.wa_message_id) dupItem.data.wa_message_id = message.wa_message_id;
        return;
      }
    } else {
      // Inbound: dedup simple por id
      if (timeline.value.some(i => i.type === 'message' && String(i.data.id) === String(message.id))) return;
    }

    timeline.value.push({ type: 'message', ts: message.created_at, data: wsData });
    scrollToBottom();
  }
  const conv = conversations.value.find(c => c.id === conversationId);
  if (conv) {
    conv.last_message_preview = message.body ?? (message.direction === 'inbound' ? '📎 Adjunto' : '✓ Enviado');
    conv.last_message_at = message.created_at;
    if (message.direction === 'inbound' && activeId.value !== conversationId) conv.unread_count++;
    conversations.value = [conv, ...conversations.value.filter(c => c.id !== conversationId)];
  }
});

on('conversation:update', (raw) => {
  const updated = raw as Conversation;
  const idx = conversations.value.findIndex(c => c.id === updated.id);
  if (idx !== -1) conversations.value.splice(idx, 1, updated);
  else conversations.value.unshift(updated);
});

on('message:ack', (raw) => {
  const { waMessageId, status } = raw as { waMessageId: string; status: string };
  const item = timeline.value.find(i => i.type === 'message' && i.data.wa_message_id === waMessageId);
  if (item) item.data.status = status;
});

// Al reconectar el WS, refetchear el timeline activo para no perder mensajes
on('ws:reconnect', async () => {
  if (activeId.value) {
    await loadConversations();
    const [tl, cb] = await Promise.all([
      api.get<TimelineItem[]>(`/conversations/${activeId.value}/timeline`),
      api.get<ContactBundle>(`/conversations/${activeId.value}/contact`),
    ]).catch(() => [null, null]);
    if (tl) timeline.value = tl;
    if (cb) { contactBundle.value = cb; editNotes.value = (cb as ContactBundle).contact?.notes ?? ''; }
    scrollToBottom();
  }
});

// ── Estado ───────────────────────────────────────────────────────────────────
const conversations = ref<Conversation[]>([]);
const timeline = ref<TimelineItem[]>([]);
const activeId = ref<string | null>(null);
const activeConv = computed(() => conversations.value.find(c => c.id === activeId.value) ?? null);
const showMobileChat = ref(false);

const loading = ref(true);
const loadingMsgs = ref(false);
const sending = ref(false);

type InboxTab = 'unread' | 'all' | 'recent' | 'starred';
const inboxTab = ref<InboxTab>('all');
const q = ref('');
const msgInput = ref('');
const threadEl = ref<HTMLElement | null>(null);

// Nuevo chat
const showNewChatModal = ref(false);
const newPhone = ref('');
const newName = ref('');
const creatingChat = ref(false);

// ── Modal nueva conversación ──────────────────────────────────────────────────
type ContactRow = { id: string; first_name: string; last_name: string | null; phone: string | null };
const newChatSearch = ref('');
const newChatContacts = ref<ContactRow[]>([]);
const newChatSearching = ref(false);
const newChatShowManual = ref(false);
let newChatSearchTimer: ReturnType<typeof setTimeout> | null = null;

async function openNewChatModal() {
  newChatSearch.value = '';
  newChatShowManual.value = false;
  newPhone.value = '';
  newName.value = '';
  showNewChatModal.value = true;
  await fetchNewChatContacts('');
}

async function fetchNewChatContacts(q: string) {
  newChatSearching.value = true;
  try {
    const res = await api.get<{ data: ContactRow[] }>(`/contacts?limit=30${q ? `&q=${encodeURIComponent(q)}` : ''}`);
    newChatContacts.value = res.data ?? [];
  } catch { newChatContacts.value = []; }
  finally { newChatSearching.value = false; }
}

function onNewChatSearch() {
  if (newChatSearchTimer) clearTimeout(newChatSearchTimer);
  newChatSearchTimer = setTimeout(() => fetchNewChatContacts(newChatSearch.value), 250);
}

async function startChatWithContact(c: ContactRow) {
  if (!c.phone) return;
  newPhone.value = c.phone;
  newName.value = [c.first_name, c.last_name ?? ''].join(' ').trim();
  showNewChatModal.value = false;
  await createChat();
}

// Panel de contacto
const contactBundle = ref<ContactBundle | null>(null);
const editNotes = ref('');
const savingNotes = ref(false);
const showContactPanel = ref(true);

// Oportunidades — menú y formulario
const activeOppMenu = ref<string | null>(null);
const showAddOpp = ref(false);
const addOppPipelines = ref<Pipeline[]>([]);
const addOppForm = ref({ title: '', pipeline_id: '', stage_id: '', value: '0' });
const addingOpp = ref(false);
const addOppStages = computed(() => addOppPipelines.value.find(p => p.id === addOppForm.value.pipeline_id)?.stages ?? []);

function closeOppMenu() { activeOppMenu.value = null; }
onMounted(() => document.addEventListener('click', closeOppMenu));
onUnmounted(() => document.removeEventListener('click', closeOppMenu));

// Rail de navegación derecha
type RailSection = 'info' | 'opps' | 'appts' | 'notes';
const rightSection = ref<RailSection>('info');
const railSections: { id: RailSection; icon: typeof UserCircle2; label: string }[] = [
  { id: 'info',  icon: UserCircle2,  label: 'Contacto' },
  { id: 'opps',  icon: Briefcase,    label: 'Oportunidades' },
  { id: 'appts', icon: CalendarDays, label: 'Citas' },
  { id: 'notes', icon: StickyNote,   label: 'Notas' },
];

// ── Carga ────────────────────────────────────────────────────────────────────
async function loadConversations() {
  loading.value = true;
  try {
    const params = new URLSearchParams({ limit: '100' });
    if (inboxTab.value === 'unread')   { params.set('unread', 'true'); params.set('status', 'all'); }
    else if (inboxTab.value === 'starred') params.set('starred', 'true');
    else if (inboxTab.value === 'all')  params.set('status', 'all');
    else                               params.set('status', 'open'); // 'recent'
    if (q.value) params.set('q', q.value);
    const data = await api.get<{ conversations: Conversation[] }>(`/conversations?${params}`);
    conversations.value = data.conversations;
  } finally {
    loading.value = false;
  }
}

async function selectConversation(id: string) {
  if (activeId.value === id) return;
  activeId.value = id;
  showMobileChat.value = true;
  timeline.value = [];
  contactBundle.value = null;
  loadingMsgs.value = true;
  try {
    const [tl, cb] = await Promise.all([
      api.get<TimelineItem[]>(`/conversations/${id}/timeline`),
      api.get<ContactBundle>(`/conversations/${id}/contact`),
    ]);
    timeline.value = tl;
    contactBundle.value = cb;
    editNotes.value = cb.contact?.notes ?? '';
    const conv = conversations.value.find(c => c.id === id);
    if (conv) conv.unread_count = 0;
    scrollToBottom();
  } finally {
    loadingMsgs.value = false;
  }
}

function scrollToBottom(smooth = false) {
  nextTick(() => {
    if (threadEl.value) {
      threadEl.value.scrollTo({ top: threadEl.value.scrollHeight, behavior: smooth ? 'smooth' : 'instant' });
    }
  });
}

const route = useRoute();

onMounted(async () => {
  await loadConversations();
  // Si llegamos desde una oportunidad con contact_id, auto-seleccionar esa conversación
  const contactIdParam = route.query.contact_id as string | undefined;
  if (contactIdParam) {
    const conv = conversations.value.find(c => c.contact_id === contactIdParam);
    if (conv) await selectConversation(conv.id);
  }
});
watch(inboxTab, loadConversations);

let searchTimer: ReturnType<typeof setTimeout>;
function onSearch() { clearTimeout(searchTimer); searchTimer = setTimeout(loadConversations, 300); }

// ── Envío ────────────────────────────────────────────────────────────────────
async function sendMessage() {
  const text = msgInput.value.trim();
  if (!text || !activeId.value || sending.value) return;
  const convId = activeId.value;

  const optimistic: TimelineItem = {
    type: 'message',
    ts: new Date().toISOString(),
    data: {
      id: `opt-${Date.now()}`, conversation_id: convId,
      direction: 'outbound', msg_type: 'text', body: text,
      media_url: null, media_mime: null, media_filename: null,
      status: 'sending', sender_name: null, created_at: new Date().toISOString(),
    },
  };
  timeline.value.push(optimistic);
  msgInput.value = '';
  scrollToBottom(true);

  sending.value = true;
  try {
    const saved = await api.post<ConvMessage>(`/conversations/${convId}/messages`, { body: text, type: 'text' });
    // Reemplazar el optimista inmediatamente con el mensaje real del servidor.
    // El WS que llega después usará el dedup por id para no duplicar.
    const idx = timeline.value.findIndex(i => i.data.id === optimistic.data.id);
    if (idx !== -1) timeline.value[idx].data = saved as unknown as Record<string, unknown>;
  } catch {
    const idx = timeline.value.findIndex(i => i.data.id === optimistic.data.id);
    if (idx !== -1) timeline.value[idx].data.status = 'failed';
  } finally {
    sending.value = false;
  }
}

function onEnter(e: KeyboardEvent) {
  if (!e.shiftKey) { e.preventDefault(); sendMessage(); }
}

// ── Nuevo chat ───────────────────────────────────────────────────────────────
async function createChat() {
  if (!newPhone.value.trim()) return;
  creatingChat.value = true;
  try {
    const res = await api.post<{ id: string }>('/conversations', { phone: newPhone.value.trim(), display_name: newName.value.trim() || undefined });
    await loadConversations();
    await selectConversation(res.id);
    showNewChatModal.value = false;
    newPhone.value = '';
    newName.value = '';
  } finally {
    creatingChat.value = false;
  }
}

// ── Acciones de conversación ──────────────────────────────────────────────────
async function closeConversation() {
  if (!activeId.value) return;
  await api.patch(`/conversations/${activeId.value}`, { status: 'closed' });
  const conv = conversations.value.find(c => c.id === activeId.value);
  if (conv) conv.status = 'closed';
  if (inboxTab.value === 'recent' || inboxTab.value === 'unread') {
    conversations.value = conversations.value.filter(c => c.id !== activeId.value);
    activeId.value = conversations.value[0]?.id ?? null;
    if (activeId.value) selectConversation(activeId.value);
    else { timeline.value = []; contactBundle.value = null; }
  }
}

async function openAddOpp() {
  if (!addOppPipelines.value.length) {
    addOppPipelines.value = await api.get<Pipeline[]>('/pipelines');
  }
  addOppForm.value = { title: '', pipeline_id: '', stage_id: '', value: '0' };
  showAddOpp.value = true;
}

async function createOpportunity() {
  if (!contactBundle.value?.contact) return;
  addingOpp.value = true;
  try {
    await api.post('/opportunities', {
      title: addOppForm.value.title,
      pipeline_id: addOppForm.value.pipeline_id,
      stage_id: addOppForm.value.stage_id,
      value: Number(addOppForm.value.value),
      contact_id: contactBundle.value.contact.id,
    });
    showAddOpp.value = false;
    if (activeId.value) {
      const cb = await api.get<ContactBundle>(`/conversations/${activeId.value}/contact`);
      contactBundle.value = cb;
    }
  } finally {
    addingOpp.value = false;
  }
}

async function deleteOpportunity(id: string) {
  if (!confirm('¿Eliminar esta oportunidad?')) return;
  activeOppMenu.value = null;
  await api.del(`/opportunities/${id}`);
  if (contactBundle.value) {
    contactBundle.value.opportunities = contactBundle.value.opportunities.filter(o => o.id !== id);
  }
}

async function deleteConversation(id: string) {
  if (!confirm('¿Eliminar esta conversación? Los mensajes se perderán.')) return;
  await api.del(`/conversations/${id}`);
  conversations.value = conversations.value.filter(c => c.id !== id);
  if (activeId.value === id) {
    activeId.value = conversations.value[0]?.id ?? null;
    if (activeId.value) await selectConversation(activeId.value);
    else { timeline.value = []; contactBundle.value = null; }
  }
}

// ── Notas del contacto ───────────────────────────────────────────────────────
async function saveNotes() {
  if (!contactBundle.value?.contact) return;
  savingNotes.value = true;
  try {
    await api.patch(`/contacts/${contactBundle.value.contact.id}`, { notes: editNotes.value });
    contactBundle.value.contact.notes = editNotes.value;
  } finally {
    savingNotes.value = false;
  }
}

// ── Formateo ─────────────────────────────────────────────────────────────────
function fmtTime(iso: string): string {
  const d = new Date(iso), now = new Date();
  const diff = (now.getTime() - d.getTime()) / 1000;
  if (diff < 60) return 'ahora';
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString('es-VE', { day: '2-digit', month: 'short' });
}

function fmtFull(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' });
}

function fmtDate(iso: string): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('es-VE', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function dateSeparatorLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const day = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  if (day.getTime() === today.getTime()) return 'Hoy';
  if (day.getTime() === yesterday.getTime()) return 'Ayer';
  return d.toLocaleDateString('es-VE', { weekday: 'long', day: 'numeric', month: 'long' });
}

function showDateSeparator(idx: number): boolean {
  if (idx === 0) return true;
  const prev = timeline.value[idx - 1];
  const curr = timeline.value[idx];
  return new Date(prev.ts).toDateString() !== new Date(curr.ts).toDateString();
}

function initials(name: string): string {
  return name.split(' ').filter(Boolean).map(w => w[0]).slice(0, 2).join('').toUpperCase();
}

const avatarColors = [
  'bg-green-100 text-green-700',
  'bg-purple-100 text-purple-700',
  'bg-sky-100 text-sky-700',
  'bg-rose-100 text-rose-700',
  'bg-amber-100 text-amber-700',
  'bg-teal-100 text-teal-700',
  'bg-indigo-100 text-indigo-700',
  'bg-orange-100 text-orange-700',
];
function avatarColor(id: string): string {
  const n = id.charCodeAt(0) + id.charCodeAt(id.length - 1);
  return avatarColors[n % avatarColors.length];
}

function convName(c: Conversation): string {
  if (c.contact_full_name?.trim()) return c.contact_full_name.trim();
  // display_name puede ser pushName real o vacío (limpiado en DB)
  const name = c.display_name?.trim();
  if (name && !/^\d+$/.test(name)) return name;
  // Solo mostrar teléfono si la conversación es @c.us (teléfono real) Y tiene ≤ 15 dígitos
  const isRealPhone = c.wa_chat_id?.endsWith('@c.us');
  if (isRealPhone && c.phone && /^\d{7,15}$/.test(c.phone)) return `+${c.phone}`;
  return 'Desconocido';
}

const totalUnread = computed(() => conversations.value.reduce((s, c) => s + c.unread_count, 0));

// ── Lightbox ─────────────────────────────────────────────────────────────────
const lightboxUrl = ref<string | null>(null);
const lightboxMime = ref<string>('image/jpeg');

function openLightbox(url: string, mime = 'image/jpeg') {
  lightboxUrl.value = url;
  lightboxMime.value = mime;
}
function closeLightbox() { lightboxUrl.value = null; }

// Cerrar lightbox con Escape
const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') closeLightbox(); };
onMounted(() => document.addEventListener('keydown', onKeyDown));
onUnmounted(() => document.removeEventListener('keydown', onKeyDown));

function mediaUrl(msgId: unknown): string {
  return `/api/media/${encodeURIComponent(String(msgId))}?t=${encodeURIComponent(getToken() ?? '')}`;
}

const oppStatusColor: Record<string, string> = {
  open: 'bg-blue-100 text-blue-700',
  won:  'bg-emerald-100 text-emerald-700',
  lost: 'bg-red-100 text-red-600',
};
const apptStatusColor: Record<string, string> = {
  scheduled: 'bg-blue-100 text-blue-700',
  completed: 'bg-emerald-100 text-emerald-700',
  cancelled: 'bg-red-100 text-red-600',
  no_show:   'bg-amber-100 text-amber-700',
};

// ── Reproductor de audio personalizado ────────────────────────────────────────
const audioState = ref<Record<string, { playing: boolean; currentTime: number; duration: number }>>({});
const audioElements = new Map<string, HTMLAudioElement>();

onUnmounted(() => {
  for (const el of audioElements.values()) el.pause();
  audioElements.clear();
});

function getAudioEl(msgId: string, src: string): HTMLAudioElement {
  if (!audioElements.has(msgId)) {
    const el = new Audio(src);
    el.ontimeupdate = () => {
      if (audioState.value[msgId]) audioState.value[msgId].currentTime = el.currentTime;
    };
    el.onloadedmetadata = () => {
      if (!audioState.value[msgId]) audioState.value[msgId] = { playing: false, currentTime: 0, duration: 0 };
      audioState.value[msgId].duration = el.duration;
    };
    el.onended = () => {
      if (audioState.value[msgId]) { audioState.value[msgId].playing = false; audioState.value[msgId].currentTime = 0; }
    };
    audioElements.set(msgId, el);
    if (!audioState.value[msgId]) audioState.value[msgId] = { playing: false, currentTime: 0, duration: 0 };
  }
  return audioElements.get(msgId)!;
}

function toggleAudio(msgId: string, src: string) {
  const el = getAudioEl(msgId, src);
  for (const [id, audioEl] of audioElements) {
    if (id !== msgId && !audioEl.paused) {
      audioEl.pause();
      if (audioState.value[id]) audioState.value[id].playing = false;
    }
  }
  if (el.paused) { el.play(); audioState.value[msgId].playing = true; }
  else { el.pause(); audioState.value[msgId].playing = false; }
}

function seekAudio(msgId: string, src: string, e: MouseEvent) {
  const el = getAudioEl(msgId, src);
  const bar = e.currentTarget as HTMLElement;
  el.currentTime = (e.offsetX / bar.clientWidth) * (el.duration || 0);
}

function formatAudioTime(secs: number): string {
  if (!secs || isNaN(secs) || !isFinite(secs)) return '0:00';
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function audioProgress(msgId: string): number {
  const st = audioState.value[msgId];
  if (!st || !st.duration) return 0;
  return (st.currentTime / st.duration) * 100;
}

function audioDurationLabel(msgId: string): string {
  const st = audioState.value[msgId];
  if (!st) return '';
  return st.playing || st.currentTime > 0 ? formatAudioTime(st.currentTime) : formatAudioTime(st.duration);
}

// ── Sincronizar nombres desde OpenWA ──────────────────────────────────────────
const syncingNames = ref(false);
async function syncNames() {
  if (syncingNames.value) return;
  syncingNames.value = true;
  try {
    const res = await api.post<{ updated: number; contactsCreated: number }>('/wa/sync-names', {});
    await loadConversations();
    alert(`Nombres actualizados: ${res.updated} conversaciones, ${res.contactsCreated} contactos nuevos.`);
  } catch {
    alert('Error al sincronizar nombres. Verifica que WhatsApp esté conectado.');
  } finally {
    syncingNames.value = false;
  }
}
</script>

<template>
  <div class="flex h-full overflow-hidden bg-[#f0f2f5]">

    <!-- ── Lista de conversaciones ─────────────────────────────────────── -->
    <aside
      class="flex flex-col border-r border-slate-200 bg-white"
      :class="showMobileChat ? 'hidden md:flex md:w-[360px] md:flex-shrink-0' : 'flex w-full md:w-[360px] md:flex-shrink-0'"
    >

      <!-- Header -->
      <div class="border-b border-slate-100 px-4 pt-4 pb-0">
        <div class="mb-3 flex items-center justify-between">
          <div class="flex items-center gap-2.5">
            <h2 class="text-base font-bold text-slate-900">WhatsApp</h2>
            <span class="h-2.5 w-2.5 rounded-full" :class="isConnected ? 'bg-emerald-400' : 'bg-slate-300'" :title="isConnected ? 'Conectado en tiempo real' : 'Sin conexión WS'"></span>
          </div>
          <div class="flex items-center gap-1">
            <button class="cursor-pointer rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800" :title="syncingNames ? 'Sincronizando…' : 'Resolver nombres desde WhatsApp'" @click="syncNames" :disabled="syncingNames">
              <RefreshCw class="h-4 w-4" :class="syncingNames ? 'animate-spin' : ''" />
            </button>
            <button class="cursor-pointer rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800" title="Nueva conversación" @click="openNewChatModal">
              <Plus class="h-5 w-5" />
            </button>
          </div>
        </div>

        <div class="relative mb-3">
          <Search class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-600" />
          <input v-model="q" @input="onSearch" placeholder="Buscar…" class="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm text-slate-700 placeholder-slate-600 focus:border-primary focus:bg-white focus:outline-none" />
        </div>

        <!-- Tabs con ícono + texto -->
        <div class="flex">
          <button
            v-for="tab in (['unread','all','recent','starred'] as const)" :key="tab"
            class="flex flex-1 cursor-pointer flex-col items-center gap-1 border-b-2 pb-2.5 pt-1 transition-colors"
            :class="inboxTab === tab
              ? 'border-[#F69008] text-[#D97706]'
              : 'border-transparent text-slate-400 hover:text-slate-600'"
            @click="inboxTab = tab"
          >
            <div class="relative">
              <Inbox          v-if="tab === 'unread'"      class="h-5 w-5 stroke-[1.75]" />
              <MessageSquare  v-else-if="tab === 'all'"    class="h-5 w-5 stroke-[1.75]" />
              <Clock          v-else-if="tab === 'recent'" class="h-5 w-5 stroke-[1.75]" />
              <Star           v-else                        class="h-5 w-5 stroke-[1.75]" />
              <span v-if="tab === 'unread' && totalUnread > 0"
                class="absolute -right-2.5 -top-1.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[#25D366] px-1 text-[9px] font-bold text-white">
                {{ totalUnread }}
              </span>
            </div>
            <span class="text-[11px] font-semibold" :class="inboxTab === tab ? 'text-[#D97706]' : ''">
              {{ { unread:'Sin leer', all:'Todas', recent:'Recientes', starred:'Guardadas' }[tab] }}
            </span>
          </button>
        </div>
      </div>

      <!-- Lista -->
      <div class="flex-1 overflow-y-auto">
        <LoadingState v-if="loading" label="Cargando…" compact />
        <div v-else-if="conversations.length === 0" class="flex flex-col items-center gap-2 py-16 text-slate-500">
          <MessageCircle class="h-10 w-10 opacity-30" />
          <p class="text-sm font-medium">Sin conversaciones</p>
        </div>
        <div v-for="c in conversations" :key="c.id"
          class="group relative flex w-full cursor-pointer items-center gap-3 border-b border-slate-200 px-4 py-3.5 text-left transition-colors hover:bg-slate-50"
          :class="activeId === c.id ? 'border-l-[3px] border-l-[#F69008] bg-[#F69008]/5' : 'border-l-[3px] border-l-transparent'"
          @click="selectConversation(c.id)"
        >
          <div class="relative flex-shrink-0">
            <div class="flex h-11 w-11 items-center justify-center rounded-full text-sm font-bold" :class="avatarColor(c.id)">{{ initials(convName(c)) }}</div>
            <!-- Badge WA -->
            <span class="absolute -bottom-0.5 -right-0.5 flex h-[18px] w-[18px] items-center justify-center rounded-full border-2 border-white bg-[#25D366]">
              <svg class="h-3 w-3 fill-white" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
              </svg>
            </span>
            <!-- Badge no leídos -->
            <span v-if="c.unread_count > 0" class="absolute -right-1 -top-1 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-[#25D366] px-1.5 text-[10px] font-bold text-white">{{ c.unread_count }}</span>
          </div>
          <div class="min-w-0 flex-1">
            <div class="flex items-center justify-between gap-2">
              <p class="truncate text-sm font-bold text-slate-900">{{ convName(c) }}</p>
              <span v-if="c.last_message_at" class="flex-shrink-0 text-xs font-medium text-slate-600">{{ fmtTime(c.last_message_at) }}</span>
            </div>
            <p class="mt-0.5 truncate text-sm" :class="c.unread_count > 0 ? 'font-semibold text-slate-800' : 'font-medium text-slate-600'">{{ c.last_message_preview || 'Sin mensajes' }}</p>
          </div>
          <!-- Botón borrar visible al hacer hover -->
          <button
            class="hidden flex-shrink-0 cursor-pointer items-center justify-center rounded-md border border-slate-200 bg-white p-1.5 text-slate-400 shadow-sm transition-all hover:border-red-200 hover:bg-red-50 hover:text-red-500 hover:shadow-none group-hover:flex"
            title="Eliminar conversación"
            @click.stop="deleteConversation(c.id)"
          >
            <Trash2 class="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>

    <!-- ── Hilo central ──────────────────────────────────────────────────── -->
    <div
      class="flex flex-col overflow-hidden"
      :class="showMobileChat ? 'flex flex-1' : 'hidden md:flex md:flex-1'"
    >

      <div v-if="!activeConv" class="flex flex-1 flex-col items-center justify-center gap-3 text-slate-400 bg-[#f0f2f5]">
        <div class="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#25D366]/10">
          <MessageCircle class="h-8 w-8 text-[#25D366]" />
        </div>
        <p class="text-sm font-medium text-slate-600">Selecciona una conversación</p>
        <p class="text-xs text-slate-400">o inicia un chat nuevo con el botón +</p>
      </div>

      <template v-else>
        <!-- Header -->
        <div class="flex items-center justify-between border-b border-slate-200/80 bg-white px-4 py-2.5 shadow-sm">
          <div class="flex items-center gap-2">
            <!-- Botón volver (solo móvil) -->
            <button
              class="btn btn-ghost btn-sm rounded-lg p-1.5 md:hidden"
              @click="showMobileChat = false"
              aria-label="Volver"
            >
              <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/></svg>
            </button>
            <div class="flex items-center gap-3">
            <div class="relative">
              <div class="flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold shadow-sm" :class="avatarColor(activeConv.id)">
                {{ initials(convName(activeConv)) }}
              </div>
              <span class="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full border-2 border-white bg-[#25D366]">
                <svg class="h-2.5 w-2.5 fill-white" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
              </span>
            </div>
            <div>
              <p class="text-sm font-semibold text-slate-900">{{ convName(activeConv) }}</p>
              <p class="flex items-center gap-1 text-xs text-slate-400">
                <span class="inline-block h-1.5 w-1.5 rounded-full bg-[#25D366]"></span>
                {{ contactBundle?.contact?.phone
                  ? `+${contactBundle.contact.phone}`
                  : activeConv.phone
                    ? `+${activeConv.phone}`
                    : activeConv.wa_chat_id.endsWith('@c.us')
                      ? `+${activeConv.wa_chat_id.replace('@c.us','')}`
                      : 'WhatsApp' }}
              </p>
            </div>
            </div><!-- cierre del div flex items-center gap-3 del avatar+info -->
          </div>
          <div class="flex items-center gap-0.5">
            <a v-if="contactBundle?.contact?.phone || activeConv.phone"
              :href="`tel:+${contactBundle?.contact?.phone || activeConv.phone}`"
              class="cursor-pointer rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-primary" title="Llamar">
              <Phone class="h-4 w-4" />
            </a>
            <button class="cursor-pointer rounded-lg p-2 transition-colors hover:bg-slate-100" :class="showContactPanel ? 'text-primary' : 'text-slate-400 hover:text-slate-700'" title="Mostrar/ocultar contacto" @click="showContactPanel = !showContactPanel">
              <UserCircle2 class="h-4 w-4" />
            </button>
            <button v-if="activeConv.status === 'open'" class="cursor-pointer rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700" title="Cerrar conversación" @click="closeConversation">
              <X class="h-4 w-4" />
            </button>
            <button class="cursor-pointer rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-primary" title="Recargar" @click="selectConversation(activeId!)">
              <RefreshCw class="h-4 w-4" />
            </button>
            <button class="cursor-pointer rounded-lg p-2 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-500" title="Eliminar conversación" @click="deleteConversation(activeId!)">
              <Trash2 class="h-4 w-4" />
            </button>
          </div>
        </div>

        <!-- Timeline -->
        <div ref="threadEl" class="flex-1 overflow-y-auto px-4 py-3 space-y-1"
          style="background-color: #efeae2">
          <LoadingState v-if="loadingMsgs" label="Cargando…" compact />
          <div v-else-if="timeline.length === 0" class="flex flex-col items-center gap-2 py-12 text-slate-400">
            <p class="text-xs">No hay mensajes. ¡Escribe el primero!</p>
          </div>

          <template v-else>
            <template v-for="(item, idx) in timeline" :key="`${item.type}-${item.data.id}`">

              <!-- ── Separador de fecha estilo GHL ── -->
              <div v-if="showDateSeparator(idx)" class="flex items-center gap-2 py-2">
                <div class="flex-1 border-t border-[#d1c4ae]"></div>
                <span class="rounded-full bg-[#d1c4ae] px-3 py-0.5 text-[10px] font-semibold text-[#5d4e37] capitalize shadow-sm">
                  {{ dateSeparatorLabel(item.ts) }}
                </span>
                <div class="flex-1 border-t border-[#d1c4ae]"></div>
              </div>

              <!-- ── Mensaje de WhatsApp ── -->
              <div v-if="item.type === 'message' && item.data.msg_type !== 'sticker'" class="flex" :class="item.data.direction === 'outbound' ? 'justify-end' : 'justify-start'">
                <div class="max-w-xs rounded-2xl px-3 py-2 text-sm shadow lg:max-w-md"
                  :class="[
                    item.data.direction === 'outbound' ? 'rounded-tr-sm bg-[#dcf8c6] text-slate-800' : 'rounded-tl-sm bg-white text-slate-800',
                    item.data.status === 'sending' ? 'opacity-75' : '',
                  ]">
                  <p v-if="item.data.sender_name && item.data.direction === 'inbound'" class="mb-1 text-xs font-semibold text-[#F69008]">{{ item.data.sender_name }}</p>

                  <!-- Texto -->
                  <template v-if="item.data.msg_type === 'text' || item.data.msg_type === 'chat'">
                    <p class="whitespace-pre-wrap break-words">{{ item.data.body }}</p>
                  </template>

                  <!-- Imagen -->
                  <template v-else-if="item.data.msg_type === 'image'">
                    <img v-if="item.data.id"
                      :src="mediaUrl(item.data.id)"
                      class="max-h-64 w-auto max-w-full rounded-lg object-contain cursor-zoom-in"
                      @click="openLightbox(mediaUrl(item.data.id), (item.data.media_mime as string) || 'image/jpeg')"
                      @error="($event.target as HTMLImageElement).style.display='none'"
                    />
                    <p v-if="item.data.body" class="mt-1 text-xs text-slate-600">{{ item.data.body }}</p>
                  </template>

                  <!-- Video -->
                  <template v-else-if="item.data.msg_type === 'video'">
                    <div v-if="item.data.id" class="relative cursor-pointer" @click="openLightbox(mediaUrl(item.data.id), (item.data.media_mime as string) || 'video/mp4')">
                      <video class="max-h-48 w-full rounded-lg pointer-events-none">
                        <source :src="mediaUrl(item.data.id)" :type="(item.data.media_mime as string) || 'video/mp4'" />
                      </video>
                      <div class="absolute inset-0 flex items-center justify-center">
                        <div class="flex h-10 w-10 items-center justify-center rounded-full bg-black/50 text-white">▶</div>
                      </div>
                    </div>
                    <div v-else class="flex items-center gap-2 text-slate-500">
                      <FileText class="h-5 w-5 text-[#25D366]" /><span class="text-xs">Video</span>
                    </div>
                    <p v-if="item.data.body" class="mt-1 text-xs">{{ item.data.body }}</p>
                  </template>

                  <!-- Audio / PTT / Voice — reproductor personalizado -->
                  <template v-else-if="item.data.msg_type === 'audio' || item.data.msg_type === 'ptt' || item.data.msg_type === 'voice'">
                    <div v-if="item.data.id" class="flex min-w-[200px] items-center gap-2.5">
                      <!-- Ícono de nota de voz -->
                      <div class="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full"
                           :class="item.data.direction === 'outbound' ? 'bg-[#25D366]/20' : 'bg-slate-100'">
                        <Mic class="h-4 w-4" :class="item.data.direction === 'outbound' ? 'text-[#25D366]' : 'text-slate-500'" />
                      </div>
                      <!-- Botón play/pause -->
                      <button class="flex h-7 w-7 flex-shrink-0 cursor-pointer items-center justify-center rounded-full transition-colors"
                              :class="item.data.direction === 'outbound' ? 'bg-[#25D366] hover:bg-[#1ea855] text-white' : 'bg-slate-300 hover:bg-slate-400 text-slate-700'"
                              @click="toggleAudio(String(item.data.id), mediaUrl(item.data.id))">
                        <Pause v-if="audioState[String(item.data.id)]?.playing" class="h-3.5 w-3.5" />
                        <Play v-else class="ml-0.5 h-3.5 w-3.5" />
                      </button>
                      <!-- Barra de progreso + duración -->
                      <div class="flex flex-1 flex-col gap-1">
                        <div class="h-1 w-full cursor-pointer overflow-hidden rounded-full"
                             :class="item.data.direction === 'outbound' ? 'bg-[#a8d5b5]' : 'bg-slate-200'"
                             @click="seekAudio(String(item.data.id), mediaUrl(item.data.id), $event)">
                          <div class="h-full rounded-full transition-all duration-150"
                               :class="item.data.direction === 'outbound' ? 'bg-[#25D366]' : 'bg-slate-500'"
                               :style="{ width: `${audioProgress(String(item.data.id))}%` }">
                          </div>
                        </div>
                        <span class="text-[10px]" :class="item.data.direction === 'outbound' ? 'text-slate-500' : 'text-slate-400'">
                          {{ audioDurationLabel(String(item.data.id)) }}
                        </span>
                      </div>
                    </div>
                    <div v-else class="flex items-center gap-2 text-slate-500">
                      <Mic class="h-5 w-5 text-[#25D366]" /><span class="text-xs">Nota de voz</span>
                    </div>
                  </template>

                  <!-- Documento -->
                  <template v-else-if="item.data.msg_type === 'document'">
                    <a v-if="item.data.id" :href="mediaUrl(item.data.id)" target="_blank"
                      class="flex items-center gap-2 rounded-lg bg-slate-100 px-2 py-1.5 text-xs hover:bg-slate-200">
                      <FileText class="h-4 w-4 flex-shrink-0 text-[#25D366]" />
                      <span class="truncate font-medium">{{ item.data.media_filename || 'Documento' }}</span>
                    </a>
                    <div v-else class="flex items-center gap-2 text-slate-500">
                      <FileText class="h-5 w-5 text-[#25D366]" />
                      <span class="truncate text-xs">{{ item.data.media_filename || 'Documento' }}</span>
                    </div>
                  </template>

                  <template v-else>
                    <p class="text-xs italic text-slate-400">{{ item.data.msg_type }}</p>
                  </template>

                  <!-- Footer: hora + ticks -->
                  <div class="mt-1.5 flex items-center justify-end gap-1">
                    <span class="text-[10px] text-slate-400">{{ fmtFull(item.ts) }}</span>
                    <template v-if="item.data.direction === 'outbound'">
                      <Clock v-if="item.data.status === 'sending'" class="h-3 w-3 animate-pulse text-slate-400" />
                      <Check v-else-if="item.data.status === 'sent'" class="h-3 w-3 text-slate-400" />
                      <Check v-else-if="item.data.status === 'delivered'" class="h-3 w-3 text-slate-400" />
                      <CheckCheck v-else-if="item.data.status === 'read'" class="h-3 w-3 text-[#25D366]" />
                      <X v-else-if="item.data.status === 'failed'" class="h-3 w-3 text-red-400" title="Error al enviar" />
                    </template>
                  </div>
                </div>
              </div>

              <!-- ── Evento: Cita ── -->
              <div v-else-if="item.type === 'appointment'" class="flex justify-center py-1">
                <div class="flex items-start gap-2.5 rounded-xl border border-blue-100 bg-blue-50 px-4 py-2.5 text-xs max-w-sm w-full">
                  <CalendarDays class="mt-0.5 h-4 w-4 flex-shrink-0 text-blue-500" />
                  <div class="min-w-0">
                    <p class="font-semibold text-blue-800">Cita agendada</p>
                    <p class="truncate font-medium text-blue-700">{{ item.data.title }}</p>
                    <p class="text-blue-500">{{ fmtDate(item.data.start_at as string) }}</p>
                    <a v-if="item.data.meeting_url" :href="item.data.meeting_url as string" target="_blank" class="text-blue-600 underline hover:text-blue-800">Ver enlace</a>
                  </div>
                  <span class="ml-auto flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize" :class="apptStatusColor[item.data.status as string] ?? 'bg-slate-100 text-slate-600'">{{ item.data.status }}</span>
                </div>
              </div>

              <!-- ── Evento: Oportunidad ── -->
              <div v-else-if="item.type === 'opportunity'" class="flex justify-center py-1">
                <div class="flex items-start gap-2.5 rounded-xl border border-amber-100 bg-amber-50 px-4 py-2.5 text-xs max-w-sm w-full">
                  <Briefcase class="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-500" />
                  <div class="min-w-0">
                    <p class="font-semibold text-amber-800">Oportunidad creada</p>
                    <p class="truncate font-medium text-amber-700">{{ item.data.title }}</p>
                    <p class="text-amber-600">{{ item.data.pipeline_name }} → {{ item.data.stage_name }}</p>
                    <p v-if="Number(item.data.value) > 0" class="font-semibold text-amber-700">${{ Number(item.data.value).toLocaleString('es-VE') }}</p>
                  </div>
                  <span class="ml-auto flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize" :class="oppStatusColor[item.data.status as string] ?? 'bg-slate-100 text-slate-600'">{{ item.data.status }}</span>
                </div>
              </div>

            </template>
          </template>
        </div>

        <!-- Input -->
        <div class="border-t border-slate-200/80 bg-white px-4 py-3">
          <div class="flex items-end gap-2">
            <textarea v-model="msgInput" @keydown.enter="onEnter"
              placeholder="Escribe un mensaje… (Enter envía, Shift+Enter nueva línea)"
              rows="1"
              class="flex-1 resize-none rounded-2xl border border-slate-200 bg-[#f0f2f5] px-4 py-2.5 text-sm transition-colors focus:border-[#25D366] focus:bg-white focus:ring-2 focus:ring-[#25D366]/20 focus:outline-none"
              style="max-height: 120px; overflow-y: auto;"
            ></textarea>
            <button
              class="flex h-10 w-10 flex-shrink-0 cursor-pointer items-center justify-center rounded-full bg-[#25D366] text-white shadow-md hover:bg-[#1ea855] disabled:opacity-50 transition-all hover:shadow-lg active:scale-95"
              :disabled="!msgInput.trim() || sending"
              @click="sendMessage"
            >
              <Spinner v-if="sending" :size="16" light />
              <Send v-else class="h-4 w-4" />
            </button>
          </div>
        </div>
      </template>
    </div>

    <!-- ── Panel derecho: icon-rail + sección activa ───────────────────── -->
    <Transition name="slide-panel">
      <div v-if="activeConv && showContactPanel" class="flex h-full flex-shrink-0 border-l border-slate-200">

        <!-- Contenido de la sección (256px) -->
        <div class="flex w-64 flex-col overflow-y-auto border-r border-slate-200 bg-[#f8f9fa]">

          <!-- ── SECCIÓN: Contacto ── -->
          <template v-if="rightSection === 'info'">
            <div class="border-b border-slate-100 p-4 text-xs font-bold uppercase tracking-wider text-slate-600">Contacto</div>
            <div v-if="!contactBundle?.contact" class="flex flex-col items-center gap-3 p-6 text-center text-slate-500">
              <UserCircle2 class="h-8 w-8 opacity-40" />
              <p class="text-xs font-medium">Sin contacto vinculado.<br>Los mensajes entrantes crean el contacto automáticamente.</p>
            </div>
            <template v-else>
              <div class="border-b border-slate-100 p-4">
                <div class="mb-3 flex items-center gap-3">
                  <div class="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full text-sm font-bold shadow"
                    :class="avatarColor(contactBundle.contact.id)">
                    {{ initials(`${contactBundle.contact.first_name} ${contactBundle.contact.last_name ?? ''}`) }}
                  </div>
                  <div class="min-w-0">
                    <p class="font-bold text-slate-900 text-sm">{{ contactBundle.contact.first_name }} {{ contactBundle.contact.last_name ?? '' }}</p>
                    <a href="/contacts" class="flex items-center gap-0.5 text-xs text-primary hover:underline">
                      Ver perfil <ChevronRight class="h-3 w-3" />
                    </a>
                  </div>
                </div>
                <div class="space-y-1.5">
                  <div v-if="activeConv?.wa_chat_id?.endsWith('@c.us') && activeConv?.phone" class="flex items-center gap-2 text-xs font-medium text-slate-700">
                    <Phone class="h-3.5 w-3.5 flex-shrink-0 text-slate-500" />
                    <a :href="`tel:+${activeConv.phone}`" class="hover:text-primary hover:underline">+{{ activeConv.phone }}</a>
                  </div>
                  <div v-if="contactBundle.contact.email" class="flex items-center gap-2 text-xs font-medium text-slate-700">
                    <Mail class="h-3.5 w-3.5 flex-shrink-0 text-slate-500" />
                    <a :href="`mailto:${contactBundle.contact.email}`" class="truncate hover:text-primary hover:underline">{{ contactBundle.contact.email }}</a>
                  </div>
                </div>
                <div v-if="contactBundle.contact.tags?.length" class="mt-2.5 flex flex-wrap gap-1">
                  <span v-for="t in contactBundle.contact.tags" :key="t"
                    class="flex items-center gap-0.5 rounded-full bg-[#F69008]/10 px-2 py-0.5 text-[10px] font-medium text-[#D97706]">
                    <Tag class="h-2.5 w-2.5" />{{ t }}
                  </span>
                </div>
              </div>
            </template>
          </template>

          <!-- ── SECCIÓN: Oportunidades ── -->
          <template v-if="rightSection === 'opps'">
            <div class="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <span class="text-xs font-bold uppercase tracking-wider text-slate-600">
                Oportunidades ({{ contactBundle?.opportunities.length ?? 0 }})
              </span>
              <button v-if="contactBundle?.contact"
                class="flex cursor-pointer items-center gap-0.5 rounded px-2 py-1 text-[11px] font-semibold text-primary hover:bg-primary/5"
                @click.stop="openAddOpp">
                <Plus class="h-3 w-3" /> Agregar
              </button>
            </div>

            <Transition name="expand">
              <form v-if="showAddOpp" @submit.prevent="createOpportunity"
                class="space-y-2 border-b border-slate-100 bg-slate-50 px-4 pb-3 pt-2">
                <input v-model="addOppForm.title" placeholder="Título *" required
                  class="w-full rounded-md border border-slate-200 px-2.5 py-1.5 text-xs focus:border-primary focus:outline-none" />
                <select v-model="addOppForm.pipeline_id" required
                  class="w-full rounded-md border border-slate-200 px-2.5 py-1.5 text-xs focus:border-primary focus:outline-none">
                  <option value="">Pipeline…</option>
                  <option v-for="p in addOppPipelines" :key="p.id" :value="p.id">{{ p.name }}</option>
                </select>
                <select v-model="addOppForm.stage_id" required :disabled="!addOppForm.pipeline_id"
                  class="w-full rounded-md border border-slate-200 px-2.5 py-1.5 text-xs focus:border-primary focus:outline-none disabled:opacity-50">
                  <option value="">Etapa…</option>
                  <option v-for="s in addOppStages" :key="s.id" :value="s.id">{{ s.name }}</option>
                </select>
                <input v-model="addOppForm.value" type="number" placeholder="Valor" min="0" step="0.01"
                  class="w-full rounded-md border border-slate-200 px-2.5 py-1.5 text-xs focus:border-primary focus:outline-none" />
                <div class="flex gap-2">
                  <button type="submit" :disabled="addingOpp"
                    class="flex-1 cursor-pointer rounded-md bg-primary py-1.5 text-xs font-semibold text-white disabled:opacity-60">
                    {{ addingOpp ? 'Creando…' : 'Crear' }}
                  </button>
                  <button type="button" @click="showAddOpp = false"
                    class="cursor-pointer rounded-md px-3 py-1.5 text-xs text-slate-500 hover:bg-slate-200">
                    Cancelar
                  </button>
                </div>
              </form>
            </Transition>

            <div v-if="!contactBundle?.opportunities.length && !showAddOpp"
              class="px-4 py-6 text-center text-[11px] font-medium text-slate-500">Sin oportunidades</div>

            <div class="space-y-2 p-3">
              <div v-for="o in contactBundle?.opportunities ?? []" :key="o.id"
                class="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
                <div class="p-2.5">
                  <div class="mb-1.5 flex items-center gap-1 text-[11px] text-slate-500">
                    <span class="truncate font-medium">{{ o.pipeline_name }}</span>
                    <ChevronRight class="h-3 w-3 flex-shrink-0 opacity-50" />
                    <span class="flex-shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold"
                      :style="o.stage_color ? { background: o.stage_color + '25', color: o.stage_color } : {}"
                      :class="!o.stage_color ? 'bg-slate-100 text-slate-600' : ''">
                      {{ o.stage_name }}
                    </span>
                  </div>
                  <p class="truncate text-xs font-semibold text-slate-800">{{ o.title }}</p>
                  <div class="mt-1 flex items-center justify-between">
                    <span class="text-xs font-medium text-slate-700">${{ Number(o.value || 0).toLocaleString('es-VE') }}</span>
                    <span class="text-[10px]">Estado:
                      <span class="font-semibold"
                        :class="{ 'text-blue-600': o.status==='open', 'text-emerald-600': o.status==='won', 'text-red-500': o.status==='lost' }">
                        {{ { open:'Abierta', won:'Ganada', lost:'Perdida' }[o.status] ?? o.status }}
                      </span>
                    </span>
                  </div>
                </div>
                <div class="flex items-center justify-end border-t border-slate-100 bg-slate-50/60 px-2.5 py-1">
                  <div class="relative" @click.stop>
                    <button class="cursor-pointer rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-600"
                      @click="activeOppMenu = activeOppMenu === o.id ? null : o.id">
                      <MoreVertical class="h-3.5 w-3.5" />
                    </button>
                    <div v-if="activeOppMenu === o.id"
                      class="absolute bottom-8 right-0 z-30 min-w-[130px] rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
                      <button class="flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-xs text-red-600 hover:bg-red-50"
                        @click="deleteOpportunity(o.id)">
                        <Trash2 class="h-3.5 w-3.5" /> Eliminar
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </template>

          <!-- ── SECCIÓN: Citas ── -->
          <template v-if="rightSection === 'appts'">
            <div class="border-b border-slate-100 px-4 py-3 text-xs font-bold uppercase tracking-wider text-slate-600">
              Citas ({{ contactBundle?.appointments.length ?? 0 }})
            </div>
            <div v-if="!contactBundle?.appointments.length" class="px-4 py-6 text-center text-[11px] font-medium text-slate-500">Sin citas</div>
            <div class="space-y-2 p-3">
              <div v-for="a in contactBundle?.appointments ?? []" :key="a.id"
                class="rounded-lg border border-blue-100 bg-blue-50 px-2.5 py-2">
                <div class="flex items-start justify-between gap-1">
                  <p class="truncate text-xs font-medium text-blue-800">{{ a.title }}</p>
                  <span class="flex-shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
                    :class="apptStatusColor[a.status] ?? 'bg-slate-100 text-slate-600'">{{ a.status }}</span>
                </div>
                <p class="text-[10px] text-blue-600">{{ fmtDate(a.start_at) }}</p>
                <a v-if="a.meeting_url" :href="a.meeting_url" target="_blank" class="text-[10px] text-blue-500 underline hover:text-blue-700">Ver enlace</a>
              </div>
            </div>
          </template>

          <!-- ── SECCIÓN: Notas ── -->
          <template v-if="rightSection === 'notes'">
            <div class="border-b border-slate-100 px-4 py-3 text-xs font-bold uppercase tracking-wider text-slate-600">Notas</div>
            <div class="p-4">
              <textarea v-model="editNotes" rows="6"
                placeholder="Agrega notas sobre este contacto…"
                class="w-full resize-none rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 text-xs text-slate-700 focus:border-primary focus:bg-white focus:ring-1 focus:ring-primary/30 focus:outline-none"
              ></textarea>
              <button :disabled="savingNotes || !contactBundle?.contact"
                class="mt-2 flex w-full cursor-pointer items-center justify-center gap-1 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-white shadow-sm disabled:opacity-60 hover:bg-primary-dark"
                @click="saveNotes">
                <Spinner v-if="savingNotes" :size="10" light />
                {{ savingNotes ? 'Guardando…' : 'Guardar notas' }}
              </button>
            </div>
          </template>

        </div>

        <!-- Icon rail (48px) — siempre visible -->
        <nav class="flex w-12 flex-col items-center gap-1 border-l border-slate-200 bg-[#f0f2f5] py-3">
          <button v-for="s in railSections" :key="s.id"
            class="relative flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg transition-all"
            :class="rightSection === s.id
              ? 'bg-slate-800 text-white shadow-sm'
              : 'text-slate-400 hover:bg-slate-200 hover:text-slate-800'"
            :title="s.label"
            @click="rightSection = s.id"
          >
            <component :is="s.icon" class="h-4 w-4" />
            <!-- Badge oportunidades -->
            <span v-if="s.id === 'opps' && (contactBundle?.opportunities.length ?? 0) > 0"
              class="absolute -right-0.5 -top-0.5 flex h-3.5 min-w-[14px] items-center justify-center rounded-full bg-amber-500 px-0.5 text-[8px] font-bold text-white">
              {{ contactBundle!.opportunities.length }}
            </span>
            <!-- Badge citas -->
            <span v-if="s.id === 'appts' && (contactBundle?.appointments.length ?? 0) > 0"
              class="absolute -right-0.5 -top-0.5 flex h-3.5 min-w-[14px] items-center justify-center rounded-full bg-blue-500 px-0.5 text-[8px] font-bold text-white">
              {{ contactBundle!.appointments.length }}
            </span>
          </button>
        </nav>
      </div>
    </Transition>

    <!-- ── Lightbox ──────────────────────────────────────────────────────── -->
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="lightboxUrl"
        class="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 backdrop-blur-sm"
        @click.self="closeLightbox">
        <!-- Botón cerrar -->
        <button class="absolute right-4 top-4 flex h-9 w-9 cursor-pointer items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
          @click="closeLightbox" title="Cerrar (Esc)">
          <X class="h-5 w-5" />
        </button>
        <!-- Abrir en nueva pestaña -->
        <a :href="lightboxUrl" target="_blank"
          class="absolute right-14 top-4 flex h-9 w-9 cursor-pointer items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
          title="Abrir en nueva pestaña">
          <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>
        </a>
        <!-- Contenido -->
        <img v-if="lightboxMime.startsWith('image/')"
          :src="lightboxUrl"
          class="max-h-[90vh] max-w-[90vw] rounded-lg object-contain shadow-2xl"
          @click.stop
        />
        <video v-else-if="lightboxMime.startsWith('video/')"
          controls autoplay
          class="max-h-[90vh] max-w-[90vw] rounded-lg shadow-2xl"
          @click.stop>
          <source :src="lightboxUrl" :type="lightboxMime" />
        </video>
      </div>
    </Transition>
  </Teleport>

  <!-- ── Modal: Nueva conversación ──────────────────────────────────────────── -->
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="showNewChatModal"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
        @click.self="showNewChatModal = false">
        <div class="flex w-full max-w-md flex-col rounded-2xl bg-white shadow-2xl" style="max-height: 80vh">

          <!-- Header del modal -->
          <div class="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <h3 class="text-base font-bold text-slate-900">Nueva conversación</h3>
            <button class="cursor-pointer rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700" @click="showNewChatModal = false">
              <X class="h-4 w-4" />
            </button>
          </div>

          <!-- Cuerpo -->
          <div class="flex flex-col gap-3 overflow-hidden p-5">

            <!-- Label + buscador -->
            <div>
              <label class="mb-1.5 block text-sm font-bold text-slate-800">
                Seleccionar contacto <span class="text-red-500">*</span>
              </label>
              <div class="relative">
                <Search class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  v-model="newChatSearch"
                  @input="onNewChatSearch"
                  placeholder="Buscar por nombre, teléfono…"
                  class="w-full rounded-xl border border-slate-200 py-2.5 pl-9 pr-3 text-sm text-slate-900 placeholder-slate-400 shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                  autofocus
                />
              </div>
            </div>

            <!-- Lista de contactos -->
            <div class="overflow-y-auto rounded-xl border border-slate-100 bg-slate-50" style="max-height: 260px; min-height: 100px">
              <!-- Cargando -->
              <div v-if="newChatSearching" class="flex items-center justify-center py-8">
                <RefreshCw class="h-5 w-5 animate-spin text-slate-400" />
              </div>

              <!-- Resultados -->
              <template v-else-if="newChatContacts.length">
                <button v-for="c in newChatContacts" :key="c.id"
                  class="flex w-full cursor-pointer items-center gap-3 border-b border-slate-100 px-4 py-2.5 text-left transition-colors last:border-0 hover:bg-white"
                  :class="!c.phone ? 'opacity-50 cursor-not-allowed' : ''"
                  :disabled="!c.phone"
                  @click="c.phone && startChatWithContact(c)"
                  :title="!c.phone ? 'Este contacto no tiene número de teléfono' : ''"
                >
                  <div class="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold"
                    :class="avatarColor(c.id)">
                    {{ initials(`${c.first_name} ${c.last_name ?? ''}`) }}
                  </div>
                  <div class="min-w-0 flex-1">
                    <p class="truncate text-sm font-semibold text-slate-900">{{ c.first_name }} {{ c.last_name ?? '' }}</p>
                    <p class="truncate text-xs text-slate-500">{{ c.phone ? `+${c.phone}` : 'Sin teléfono' }}</p>
                  </div>
                </button>
              </template>

              <!-- Sin resultados -->
              <div v-else class="flex flex-col items-center justify-center gap-2 py-8 text-slate-400">
                <MessageCircle class="h-8 w-8 opacity-30" />
                <p class="text-sm font-medium">Sin datos</p>
                <p v-if="newChatSearch" class="text-xs text-slate-400">Sin resultados para "{{ newChatSearch }}"</p>
              </div>
            </div>

            <!-- Separador + opción manual -->
            <div>
              <button
                class="flex w-full cursor-pointer items-center gap-2 rounded-lg py-1.5 text-sm font-semibold text-primary transition-colors hover:text-primary-dark"
                @click="newChatShowManual = !newChatShowManual">
                <Plus class="h-4 w-4" />
                Nuevo número de teléfono
              </button>

              <Transition name="expand">
                <form v-if="newChatShowManual" @submit.prevent="createChat" class="mt-2 space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div>
                    <label class="mb-1 block text-xs font-semibold text-slate-700">Teléfono <span class="text-red-500">*</span></label>
                    <input v-model="newPhone" placeholder="+58 414 000 0000" required
                      class="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-primary focus:outline-none" />
                  </div>
                  <div>
                    <label class="mb-1 block text-xs font-semibold text-slate-700">Nombre (opcional)</label>
                    <input v-model="newName" placeholder="Ej: Juan García"
                      class="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-primary focus:outline-none" />
                  </div>
                  <button type="submit" :disabled="creatingChat"
                    class="w-full cursor-pointer rounded-lg bg-[#25D366] py-2 text-sm font-bold text-white shadow-sm transition-colors hover:bg-[#1ea855] disabled:opacity-60">
                    {{ creatingChat ? 'Iniciando…' : 'Iniciar conversación' }}
                  </button>
                </form>
              </Transition>
            </div>

          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</div>
</template>

<style scoped>
.slide-panel-enter-active, .slide-panel-leave-active { transition: transform 0.2s ease, opacity 0.2s ease; }
.slide-panel-enter-from, .slide-panel-leave-to { transform: translateX(100%); opacity: 0; }
.expand-enter-active, .expand-leave-active { transition: max-height 0.25s ease, opacity 0.2s ease; overflow: hidden; }
.expand-enter-from, .expand-leave-to { max-height: 0; opacity: 0; }
.expand-enter-to, .expand-leave-from { max-height: 200px; }

/* Scrollbars personalizados — cuadrados, sin flechas */
::-webkit-scrollbar               { width: 5px; height: 5px; }
::-webkit-scrollbar-track         { background: transparent; }
::-webkit-scrollbar-thumb         { background: #cbd5e1; border-radius: 2px; }
::-webkit-scrollbar-thumb:hover   { background: #94a3b8; }
::-webkit-scrollbar-button        { display: none; }
* { scrollbar-width: thin; scrollbar-color: #cbd5e1 transparent; }
</style>
