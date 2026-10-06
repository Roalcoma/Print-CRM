// Chat básico: mensajes de la conversación, responder con texto y ver fotos. Se marca leída al abrir.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, AppState, FlatList, Image, Modal, Pressable, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api, apiState, ApiError, errMsg, qs } from '@/lib/api';
import { CHAT_POLL_MS } from '@/lib/config';
import { emit } from '@/lib/events';
import { CHANNEL_LABEL, clock, dayLabel, mediaLabel } from '@/lib/format';
import { colors, radius } from '@/lib/theme';
import type { Contact, Conversation, Message, Opportunity } from '@/lib/types';
import { ChannelIcon, DetailHeader, EmptyState } from '@/components/ui';
import { useToast } from '@/components/Toast';
import { useKeyboardHeight } from '@/lib/useKeyboard';

const PAGE = 50;
const TEXT_TYPES = new Set(['text', 'chat', 'conversation', 'extendedTextMessage']);

interface ContactBundle { contact: Contact | null; opportunities: Opportunity[]; conv_phone: string | null }

function mergeMessages(prev: Message[], incoming: Message[]): Message[] {
  const map = new Map(prev.filter(m => !m.pending).map(m => [m.id, m]));
  for (const m of incoming) map.set(m.id, m);
  const pending = prev.filter(m => m.pending);
  return [...map.values(), ...pending].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
}

export default function ChatScreen() {
  const params = useLocalSearchParams<{ id: string; name?: string; channel?: string }>();
  const id = params.id;
  const insets = useSafeAreaInsets();
  const toast = useToast();

  const [name, setName] = useState(params.name || '');
  const [channel, setChannel] = useState<string | null>(params.channel || null);
  const [oppId, setOppId] = useState<string | null>(null);
  const [msgs, setMsgs] = useState<Message[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [noMore, setNoMore] = useState(false);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [windowError, setWindowError] = useState<string | null>(null);
  const [mediaToken, setMediaToken] = useState<string | null>(null);
  const [viewer, setViewer] = useState<string | null>(null);
  const focused = useRef(true);
  const kb = useKeyboardHeight();

  // Primera carga (el servidor la marca leída al pedir los mensajes).
  const load = useCallback(async () => {
    try {
      const list = await api.get<Message[]>(`/conversations/${id}/messages${qs({ limit: PAGE })}`);
      setMsgs(prev => mergeMessages(prev ?? [], list));
      setNoMore(list.length < PAGE);
      setError(null);
      emit('conversations:changed');
    } catch (e) { setError(errMsg(e)); }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  // Datos de cabecera: contacto/lead ligado y, si se abrió desde una notificación, nombre y canal.
  useEffect(() => {
    api.get<ContactBundle>(`/conversations/${id}/contact`).then(b => {
      const c = b.contact;
      if (c && !params.name) setName([c.first_name, c.last_name].filter(Boolean).join(' ') || b.conv_phone || '');
      else if (!params.name && b.conv_phone) setName(b.conv_phone);
      if (b.opportunities[0]) setOppId(b.opportunities[0].id);
    }).catch(() => {});
    if (!params.channel) {
      api.get<{ conversations: Conversation[] }>(`/conversations${qs({ status: 'all', limit: 100 })}`)
        .then(r => {
          const cv = r.conversations.find(c => c.id === id);
          if (cv) { setChannel(cv.channel ?? 'whatsapp'); if (!params.name) setName(cv.contact_full_name?.trim() || cv.display_name); }
        }).catch(() => {});
    }
  }, [id, params.name, params.channel]);

  // Token de media (10 min de vida): se renueva cada 8 min.
  useEffect(() => {
    const get = () => api.post<{ token: string }>('/media-token').then(r => setMediaToken(r.token)).catch(() => {});
    get();
    const t = setInterval(get, 8 * 60_000);
    return () => clearInterval(t);
  }, []);

  // Sondeo de mensajes nuevos mientras el chat está visible.
  useFocusEffect(useCallback(() => {
    focused.current = true;
    return () => { focused.current = false; };
  }, []));
  useEffect(() => {
    const t = setInterval(() => {
      if (!focused.current || AppState.currentState !== 'active') return;
      api.get<Message[]>(`/conversations/${id}/messages${qs({ limit: 30 })}`)
        .then(list => setMsgs(prev => mergeMessages(prev ?? [], list)))
        .catch(() => {});
    }, CHAT_POLL_MS);
    return () => clearInterval(t);
  }, [id]);

  const loadOlder = async () => {
    if (loadingOlder || noMore || !msgs?.length) return;
    setLoadingOlder(true);
    try {
      const list = await api.get<Message[]>(`/conversations/${id}/messages${qs({ limit: PAGE, before: msgs[0].created_at })}`);
      setMsgs(prev => mergeMessages(prev ?? [], list));
      if (list.length < PAGE) setNoMore(true);
    } catch { /* se reintenta al volver a llegar arriba */ } finally { setLoadingOlder(false); }
  };

  const send = async () => {
    const body = text.trim();
    if (!body || sending) return;
    const temp: Message = {
      id: `tmp-${Date.now()}`, direction: 'outbound', msg_type: 'text', body, media_mime: null, media_filename: null,
      status: 'sending', sender_name: null, created_at: new Date().toISOString(), pending: true,
    };
    setMsgs(prev => [...(prev ?? []), temp]);
    setText('');
    setSending(true);
    try {
      const m = await api.post<Message>(`/conversations/${id}/messages`, { body });
      setMsgs(prev => mergeMessages((prev ?? []).filter(x => x.id !== temp.id), m?.id ? [{ ...temp, ...m, pending: false }] : []));
      setWindowError(null);
      emit('conversations:changed');
    } catch (e) {
      setMsgs(prev => (prev ?? []).filter(x => x.id !== temp.id));
      setText(body);
      // 422: Instagram/Messenger fuera de la ventana de 24 h (u otro rechazo de Meta).
      if (e instanceof ApiError && e.status === 422) setWindowError(e.message);
      else toast.show(errMsg(e), 'error');
    } finally { setSending(false); }
  };

  const data = useMemo(() => (msgs ? [...msgs].reverse() : []), [msgs]);
  const mediaUri = (msgId: string) => (mediaToken ? `${apiState.baseUrl}/api/media/${encodeURIComponent(msgId)}?t=${encodeURIComponent(mediaToken)}` : null);
  const channelLabel = channel ? CHANNEL_LABEL[channel] ?? 'Chat' : null;

  return (
    <View style={{ flex: 1, backgroundColor: colors.canvas }}>
      <DetailHeader
        title={name || 'Conversación'}
        subtitle={channelLabel ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <ChannelIcon channel={channel} size={13} />
            <Text style={{ fontSize: 13, color: colors.muted }}>{channelLabel}</Text>
          </View>
        ) : undefined}
        right={oppId ? (
          <Pressable onPress={() => router.push({ pathname: '/lead/[id]', params: { id: oppId } })} style={styles.leadBtn} hitSlop={6} accessibilityLabel="Ver lead">
            <Ionicons name="person-circle-outline" size={20} color={colors.navy} />
            <Text style={styles.leadBtnText}>Lead</Text>
          </Pressable>
        ) : undefined}
      />
      <View style={{ flex: 1, marginBottom: kb }}>
        {error && !msgs ? (
          <View style={{ flex: 1 }}>
            <EmptyState icon="cloud-offline-outline" title="No se pudo cargar el chat" subtitle={error} />
            <Pressable onPress={load} style={styles.retry}><Text style={styles.retryText}>Reintentar</Text></Pressable>
          </View>
        ) : !msgs ? (
          <View style={{ flex: 1, justifyContent: 'center' }}><ActivityIndicator color={colors.orange} size="large" /></View>
        ) : msgs.length === 0 ? (
          <View style={{ flex: 1, justifyContent: 'center' }}><EmptyState icon="chatbubble-outline" title="Sin mensajes todavía" /></View>
        ) : (
          <FlatList
            inverted
            data={data}
            keyExtractor={m => m.id}
            contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 12, flexGrow: 1 }}
            onEndReached={loadOlder}
            onEndReachedThreshold={0.3}
            ListFooterComponent={loadingOlder ? <ActivityIndicator color={colors.orange} style={{ marginVertical: 12 }} /> : null}
            renderItem={({ item, index }) => {
              const older = data[index + 1];
              const newDay = !older || new Date(older.created_at).toDateString() !== new Date(item.created_at).toDateString();
              return (
                <View>
                  {newDay ? <Text style={styles.day}>{dayLabel(item.created_at)}</Text> : null}
                  <Bubble m={item} uri={mediaUri(item.id)} onImage={setViewer} />
                </View>
              );
            }}
          />
        )}

        {windowError ? (
          <View style={styles.windowWarn}>
            <Ionicons name="time-outline" size={18} color={colors.warnText} />
            <Text style={styles.windowText}>{windowError}</Text>
            <Pressable onPress={() => setWindowError(null)} hitSlop={8}><Ionicons name="close" size={18} color={colors.warnText} /></Pressable>
          </View>
        ) : null}

        <View style={[styles.composer, { paddingBottom: kb ? 8 : Math.max(insets.bottom, 8) }]}>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder={channelLabel ? `Responder por ${channelLabel}` : 'Escribe un mensaje'}
            placeholderTextColor={colors.faint}
            multiline
            style={styles.input}
            accessibilityLabel="Mensaje"
          />
          <Pressable
            onPress={send}
            disabled={!text.trim() || sending}
            style={({ pressed }) => [styles.send, (!text.trim() || sending) && { opacity: 0.4 }, pressed && { opacity: 0.8 }]}
            accessibilityRole="button"
            accessibilityLabel="Enviar"
          >
            {sending ? <ActivityIndicator color="#fff" /> : <Ionicons name="send" size={20} color="#fff" />}
          </Pressable>
        </View>
      </View>

      <Modal visible={!!viewer} transparent animationType="fade" onRequestClose={() => setViewer(null)} statusBarTranslucent>
        <Pressable style={styles.viewer} onPress={() => setViewer(null)} accessibilityLabel="Cerrar imagen">
          {viewer ? <Image source={{ uri: viewer }} style={{ width: '100%', height: '80%' }} resizeMode="contain" /> : null}
        </Pressable>
      </Modal>
    </View>
  );
}

function Bubble({ m, uri, onImage }: { m: Message; uri: string | null; onImage(u: string): void }) {
  const [broken, setBroken] = useState(false);
  const out = m.direction === 'outbound';
  const isText = TEXT_TYPES.has(m.msg_type);
  const label = isText ? null : mediaLabel(m.msg_type) ?? '📎 Adjunto';
  const isImage = (m.msg_type === 'image' || m.msg_type === 'sticker') && !broken;
  const fg = out ? '#fff' : colors.text;
  return (
    <View style={[styles.bubbleRow, out ? { justifyContent: 'flex-end' } : null]}>
      <View style={[styles.bubble, out ? styles.out : styles.in, m.pending && { opacity: 0.6 }]}>
        {isImage && uri ? (
          <Pressable onPress={() => onImage(uri)} accessibilityLabel="Ver foto">
            <Image source={{ uri }} onError={() => setBroken(true)} style={m.msg_type === 'sticker' ? styles.sticker : styles.image} resizeMode={m.msg_type === 'sticker' ? 'contain' : 'cover'} />
          </Pressable>
        ) : null}
        {label && !(isImage && uri) ? <Text style={[styles.media, { color: out ? '#FCD9A8' : colors.orangeDark }]}>{label}{m.media_filename ? ` · ${m.media_filename}` : ''}</Text> : null}
        {m.body ? <Text style={[styles.body, { color: fg }]} selectable>{m.body}</Text> : null}
        <View style={styles.metaRow}>
          <Text style={[styles.time, { color: out ? '#B9C3D3' : colors.faint }]}>{clock(m.created_at)}</Text>
          {out ? <Ionicons name={m.pending ? 'time-outline' : m.status === 'read' ? 'checkmark-done' : 'checkmark'} size={14} color={m.status === 'read' ? colors.orange : '#B9C3D3'} /> : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  leadBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 40, paddingHorizontal: 12, borderRadius: radius.pill, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, marginRight: 8 },
  leadBtnText: { fontWeight: '700', color: colors.navy, fontSize: 14 },
  day: { alignSelf: 'center', fontSize: 12, fontWeight: '600', color: colors.muted, backgroundColor: '#ECE7DF', paddingHorizontal: 10, paddingVertical: 3, borderRadius: radius.pill, overflow: 'hidden', marginVertical: 10 },
  bubbleRow: { flexDirection: 'row', marginVertical: 3 },
  bubble: { maxWidth: '82%', borderRadius: 18, paddingHorizontal: 12, paddingTop: 8, paddingBottom: 6 },
  out: { backgroundColor: colors.bubbleOut, borderBottomRightRadius: 6 },
  in: { backgroundColor: colors.bubbleIn, borderBottomLeftRadius: 6, borderWidth: 1, borderColor: colors.border },
  body: { fontSize: 16, lineHeight: 22 },
  media: { fontSize: 15, fontWeight: '600', marginBottom: 2 },
  image: { width: 220, height: 220, borderRadius: 12, marginBottom: 4, backgroundColor: colors.skeleton },
  sticker: { width: 140, height: 140, marginBottom: 4 },
  metaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4, marginTop: 2 },
  time: { fontSize: 11 },
  windowWarn: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginHorizontal: 12, marginBottom: 6, padding: 12, borderRadius: radius.md, backgroundColor: colors.warnSoft },
  windowText: { flex: 1, fontSize: 13, color: colors.warnText, lineHeight: 18 },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingHorizontal: 10, paddingTop: 8, backgroundColor: colors.card, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  input: { flex: 1, minHeight: 46, maxHeight: 130, borderRadius: 23, backgroundColor: colors.canvas, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12, fontSize: 16, color: colors.text },
  send: { width: 46, height: 46, borderRadius: 23, backgroundColor: colors.orange, alignItems: 'center', justifyContent: 'center' },
  retry: { alignSelf: 'center', paddingHorizontal: 24, height: 48, justifyContent: 'center', borderRadius: radius.pill, backgroundColor: colors.navy },
  retryText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  viewer: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', alignItems: 'center', justifyContent: 'center' },
});
