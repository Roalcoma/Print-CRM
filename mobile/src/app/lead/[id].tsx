// Ficha del lead: acciones grandes arriba, etapa con cambio rápido, datos de contacto y notas.
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Image, Linking, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api, errMsg } from '@/lib/api';
import { callPhone, findConversation, openChat, openWhatsApp } from '@/lib/actions';
import { emit } from '@/lib/events';
import { CHANNEL_LABEL, leadName, money, shortDate, timeAgo } from '@/lib/format';
import { colors, radius } from '@/lib/theme';
import type { Contact, Conversation, Note, Opportunity, Pipeline, Stage } from '@/lib/types';
import { BigAction, ChannelIcon, DetailHeader, EmptyState, PrimaryButton, type IconName } from '@/components/ui';
import { Bone } from '@/components/Skeleton';
import { Sheet } from '@/components/Sheet';
import { StageSheet } from '@/components/StageSheet';
import { useToast } from '@/components/Toast';

export default function LeadDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const [opp, setOpp] = useState<Opportunity | null>(null);
  const [contact, setContact] = useState<Contact | null>(null);
  const [pipeline, setPipeline] = useState<Pipeline | null>(null);
  const [notes, setNotes] = useState<Note[] | null>(null);
  const [conv, setConv] = useState<Conversation | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [stageSheet, setStageSheet] = useState(false);
  const [noteSheet, setNoteSheet] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const noteRef = useRef<TextInput>(null);
  // autoFocus dentro de un Modal no abre el teclado en Android: se enfoca tras la animación.
  useEffect(() => {
    if (!noteSheet) return;
    const t = setTimeout(() => noteRef.current?.focus(), 350);
    return () => clearTimeout(t);
  }, [noteSheet]);

  const load = useCallback(async () => {
    try {
      const o = await api.get<Opportunity>(`/opportunities/${id}`);
      setOpp(o);
      setError(null);
      const [pipes, ns, c, cv] = await Promise.all([
        api.get<Pipeline[]>('/pipelines').catch(() => [] as Pipeline[]),
        api.get<Note[]>(`/opportunities/${id}/notes`).catch(() => [] as Note[]),
        o.contact_id ? api.get<Contact>(`/contacts/${o.contact_id}`).catch(() => null) : Promise.resolve(null),
        findConversation(o.contact_id),
      ]);
      setPipeline(pipes.find(p => p.id === o.pipeline_id) ?? null);
      setNotes(ns);
      setContact(c);
      setConv(cv);
    } catch (e) {
      setError(errMsg(e));
    }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  const refresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const stage: Stage | undefined = pipeline?.stages.find(s => s.id === opp?.stage_id);
  const name = opp ? leadName(opp) : '';
  const phone = opp?.contact_phone || contact?.phone || null;
  const email = opp?.contact_email || contact?.email || null;
  const ad = opp?.contact_ad_source ?? contact?.ad_source ?? null;

  const changeStage = async (s: Stage) => {
    if (!opp) return;
    setStageSheet(false);
    const prev = opp;
    setOpp({ ...opp, stage_id: s.id });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    try {
      await api.patch(`/opportunities/${opp.id}`, { stage_id: s.id });
      toast.show(`Movido a ${s.name}`, 'success');
      emit('opps:changed');
    } catch (e) { setOpp(prev); toast.show(errMsg(e), 'error'); }
  };

  const saveNote = async () => {
    const body = noteText.trim();
    if (!body || !opp) return;
    setSavingNote(true);
    try {
      const n = await api.post<Note>(`/opportunities/${opp.id}/notes`, { body });
      setNotes(prev => [n, ...(prev ?? [])]);
      setNoteText('');
      setNoteSheet(false);
      toast.show('Nota guardada', 'success');
    } catch (e) { toast.show(errMsg(e), 'error'); } finally { setSavingNote(false); }
  };

  const chat = async () => {
    if (!opp) return;
    if (conv) return openChat({ id: conv.id, channel: conv.channel, name });
    const r = await openWhatsApp(opp.contact_id, phone, name);
    if (r === 'none') toast.show('Este lead no tiene teléfono ni conversación', 'error');
  };

  if (error && !opp) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.canvas }}>
        <DetailHeader title="Lead" />
        <EmptyState icon="alert-circle-outline" title="No se pudo abrir el lead" subtitle={error} />
      </View>
    );
  }

  const chatLabel = conv ? (CHANNEL_LABEL[conv.channel ?? 'whatsapp'] === 'WhatsApp' ? 'Chat' : CHANNEL_LABEL[conv.channel ?? '']) : 'WhatsApp';

  return (
    <View style={{ flex: 1, backgroundColor: colors.canvas }}>
      <DetailHeader title={opp ? name : ''} subtitle={opp ? [opp.business_name, opp.title !== name ? opp.title : null].filter(Boolean).join(' · ') || undefined : undefined} />
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} colors={[colors.orange]} tintColor={colors.orange} />}
      >
        {!opp ? (
          <View style={{ padding: 16, gap: 14 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-around' }}>{[0, 1, 2].map(i => <Bone key={i} width={56} height={56} style={{ borderRadius: 28 }} />)}</View>
            <Bone width="100%" height={56} /><Bone width="100%" height={160} /><Bone width="100%" height={100} />
          </View>
        ) : (
          <>
            <View style={styles.actions}>
              <BigAction icon="call" label="Llamar" color={colors.navy} disabled={!phone} onPress={() => callPhone(phone)} />
              <BigAction
                label={chatLabel}
                color={conv && conv.channel && conv.channel !== 'whatsapp' ? colors.navySoft : colors.whatsapp}
                disabled={conv === undefined || (!conv && !phone)}
                onPress={chat}
                iconNode={conv === undefined ? <ActivityIndicator color="#fff" /> : conv ? <Ionicons name="chatbubbles" size={24} color="#fff" /> : <Ionicons name="logo-whatsapp" size={26} color="#fff" />}
              />
              <BigAction icon="create" label="Nota" color={colors.orange} onPress={() => setNoteSheet(true)} />
            </View>

            <Pressable onPress={() => setStageSheet(true)} disabled={!pipeline} style={({ pressed }) => [styles.card, styles.stage, pressed && { opacity: 0.8 }]} accessibilityRole="button" accessibilityLabel="Cambiar etapa">
              <View style={[styles.stageDot, { backgroundColor: stage?.color || colors.orange }]} />
              <View style={{ flex: 1 }}>
                <Text style={styles.stageLabel}>Etapa{pipeline ? ` · ${pipeline.name}` : ''}</Text>
                <Text style={styles.stageName}>{stage?.name ?? '—'}</Text>
              </View>
              <Text style={styles.stageChange}>Cambiar</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.orangeDark} />
            </Pressable>

            <View style={styles.card}>
              <InfoRow icon="call-outline" label="Teléfono" value={phone} onPress={phone ? () => callPhone(phone) : undefined} />
              <InfoRow icon="mail-outline" label="Email" value={email} onPress={email ? () => Linking.openURL(`mailto:${email}`) : undefined} />
              <InfoRow icon="business-outline" label="Empresa" value={opp.business_name || contact?.company} />
              <InfoRow icon="cash-outline" label="Valor" value={money(opp.value)} />
              <InfoRow icon="navigate-outline" label="Fuente" value={opp.source || contact?.source} />
              <InfoRow icon="person-circle-outline" label="Responsable" value={opp.owner_name} />
              <InfoRow icon="time-outline" label="Creado" value={`${shortDate(opp.created_at)} (${timeAgo(opp.created_at)})`} />
              {conv ? (
                <InfoRow
                  iconNode={<ChannelIcon channel={conv.channel} size={20} />}
                  label="Conversación"
                  value={`${CHANNEL_LABEL[conv.channel ?? 'whatsapp'] ?? 'Chat'}${conv.unread_count ? ` · ${conv.unread_count} sin leer` : ''}`}
                  onPress={chat}
                />
              ) : null}
            </View>

            {ad ? (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Anuncio de origen</Text>
                <View style={styles.ad}>
                  {ad.thumbnail ? <Image source={{ uri: ad.thumbnail }} style={styles.adThumb} /> : (
                    <View style={[styles.adThumb, styles.adPlaceholder]}><Ionicons name="megaphone-outline" size={24} color={colors.orangeDark} /></View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={styles.adSource}>{ad.source_app === 'instagram' ? 'Instagram' : ad.source_app === 'facebook' ? 'Facebook' : 'Meta'}</Text>
                    {ad.title ? <Text style={styles.adTitle} numberOfLines={2}>{ad.title}</Text> : null}
                    {ad.body ? <Text style={styles.adBody} numberOfLines={3}>{ad.body}</Text> : null}
                    {ad.source_url ? (
                      <Pressable onPress={() => Linking.openURL(ad.source_url!)} hitSlop={6}>
                        <Text style={styles.link}>Ver anuncio</Text>
                      </Pressable>
                    ) : null}
                  </View>
                </View>
              </View>
            ) : null}

            <View style={styles.card}>
              <View style={styles.notesHead}>
                <Text style={[styles.cardTitle, { flex: 1, marginBottom: 0 }]}>Notas{notes?.length ? ` (${notes.length})` : ''}</Text>
                <Pressable onPress={() => setNoteSheet(true)} hitSlop={8} style={styles.addNote} accessibilityLabel="Añadir nota">
                  <Ionicons name="add" size={20} color={colors.orangeDark} />
                  <Text style={styles.addNoteText}>Añadir</Text>
                </Pressable>
              </View>
              {notes === null ? <View style={{ padding: 16, gap: 10 }}><Bone width="90%" /><Bone width="60%" /></View>
                : notes.length === 0 ? <Text style={styles.empty}>Sin notas todavía.</Text>
                : notes.map(n => (
                  <View key={n.id} style={styles.note}>
                    <Text style={styles.noteBody}>{n.body}</Text>
                    <Text style={styles.noteMeta}>{[n.author_name, timeAgo(n.created_at)].filter(Boolean).join(' · ')}</Text>
                  </View>
                ))}
            </View>
          </>
        )}
      </ScrollView>

      <StageSheet visible={stageSheet} stages={pipeline?.stages ?? []} currentId={opp?.stage_id} onClose={() => setStageSheet(false)} onPick={changeStage} title="Cambiar etapa" />
      <Sheet visible={noteSheet} onClose={() => setNoteSheet(false)} title="Nueva nota">
        <View style={{ paddingHorizontal: 20, paddingBottom: 8 }}>
          <TextInput
            value={noteText} onChangeText={setNoteText} placeholder="Escribe la nota…" placeholderTextColor={colors.faint}
            ref={noteRef} multiline style={styles.noteInput} textAlignVertical="top"
          />
          <PrimaryButton label="Guardar nota" onPress={saveNote} loading={savingNote} disabled={!noteText.trim()} style={{ marginTop: 12 }} />
        </View>
      </Sheet>
    </View>
  );
}

function InfoRow({ icon, iconNode, label, value, onPress }: { icon?: IconName; iconNode?: ReactNode; label: string; value?: string | null; onPress?(): void }) {
  if (!value) return null;
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={({ pressed }) => [styles.info, pressed && { backgroundColor: colors.canvas }]}>
      <View style={{ width: 24, alignItems: 'center' }}>{iconNode ?? <Ionicons name={icon!} size={20} color={colors.muted} />}</View>
      <View style={{ flex: 1 }}>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={[styles.infoValue, onPress && { color: colors.navy, fontWeight: '600' }]} selectable>{value}</Text>
      </View>
      {onPress ? <Ionicons name="chevron-forward" size={16} color={colors.faint} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 18 },
  card: { marginHorizontal: 16, marginBottom: 14, backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  cardTitle: { fontSize: 15, fontWeight: '700', color: colors.text, paddingHorizontal: 16, paddingTop: 14, marginBottom: 6 },
  stage: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, minHeight: 64 },
  stageDot: { width: 14, height: 14, borderRadius: 7 },
  stageLabel: { fontSize: 12, color: colors.muted },
  stageName: { fontSize: 17, fontWeight: '700', color: colors.text, marginTop: 1 },
  stageChange: { fontSize: 14, fontWeight: '700', color: colors.orangeDark },
  info: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 10, minHeight: 56 },
  infoLabel: { fontSize: 12, color: colors.muted },
  infoValue: { fontSize: 15, color: colors.text, marginTop: 1 },
  ad: { flexDirection: 'row', gap: 12, padding: 16, paddingTop: 6 },
  adThumb: { width: 72, height: 72, borderRadius: radius.md, backgroundColor: colors.skeleton },
  adPlaceholder: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.orangeSoft },
  adSource: { fontSize: 12, fontWeight: '700', color: colors.orangeDark },
  adTitle: { fontSize: 15, fontWeight: '600', color: colors.text, marginTop: 2 },
  adBody: { fontSize: 13, color: colors.muted, marginTop: 2 },
  link: { color: colors.orangeDark, fontWeight: '700', marginTop: 6 },
  notesHead: { flexDirection: 'row', alignItems: 'center', paddingRight: 12, paddingBottom: 6 },
  addNote: { flexDirection: 'row', alignItems: 'center', gap: 2, height: 40, paddingHorizontal: 10, marginTop: 8 },
  addNoteText: { color: colors.orangeDark, fontWeight: '700', fontSize: 14 },
  empty: { color: colors.muted, paddingHorizontal: 16, paddingBottom: 16 },
  note: { paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  noteBody: { fontSize: 15, color: colors.text, lineHeight: 21 },
  noteMeta: { fontSize: 12, color: colors.faint, marginTop: 4 },
  noteInput: {
    minHeight: 120, maxHeight: 240, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.canvas,
    padding: 14, fontSize: 16, color: colors.text,
  },
});
