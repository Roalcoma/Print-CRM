// Tarjeta de lead: lo esencial a la vista y acciones de un toque.
import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ChipAction } from './ui';
import { colors, radius } from '@/lib/theme';
import { leadName, money, timeAgo } from '@/lib/format';
import type { Opportunity } from '@/lib/types';

interface Props {
  opp: Opportunity;
  stageColor?: string;
  onOpen(o: Opportunity): void;
  onMove(o: Opportunity): void;
  onCall(o: Opportunity): void;
  onWhatsApp(o: Opportunity): void;
}

function LeadCardBase({ opp, stageColor, onOpen, onMove, onCall, onWhatsApp }: Props) {
  const name = leadName(opp);
  const value = money(opp.value);
  const sub = [opp.business_name, opp.title !== name ? opp.title : null].filter(Boolean).join(' · ');
  const ad = opp.contact_ad_source;
  return (
    <Pressable
      onPress={() => onOpen(opp)}
      onLongPress={() => onMove(opp)}
      delayLongPress={350}
      style={({ pressed }) => [styles.card, pressed && { backgroundColor: '#FBFAF7' }]}
      accessibilityRole="button"
      accessibilityLabel={`${name}. Mantén pulsado para mover de etapa`}
    >
      <View style={[styles.bar, { backgroundColor: stageColor || colors.orange }]} />
      <View style={{ flex: 1 }}>
        <View style={styles.top}>
          <Text style={styles.name} numberOfLines={1}>{name}</Text>
          <Text style={styles.time}>{timeAgo(opp.created_at)}</Text>
        </View>
        {sub ? <Text style={styles.sub} numberOfLines={1}>{sub}</Text> : null}
        <View style={styles.meta}>
          {value ? <Text style={styles.value}>{value}</Text> : null}
          {opp.status !== 'open' ? (
            <Text style={[styles.badge, opp.status === 'won' ? styles.won : styles.lost]}>{opp.status === 'won' ? 'Ganado' : 'Perdido'}</Text>
          ) : null}
          {ad ? (
            <Text style={[styles.badge, styles.ad]} numberOfLines={1}>
              {ad.source_app === 'instagram' ? 'Anuncio IG' : ad.source_app === 'facebook' ? 'Anuncio FB' : 'Anuncio'}
            </Text>
          ) : opp.source ? <Text style={[styles.badge, styles.src]} numberOfLines={1}>{opp.source}</Text> : null}
          {opp.notes_count > 0 ? (
            <View style={styles.notes}><Ionicons name="document-text-outline" size={13} color={colors.muted} /><Text style={styles.notesText}>{opp.notes_count}</Text></View>
          ) : null}
        </View>
        <View style={styles.actions}>
          {opp.contact_phone ? <ChipAction icon="call" label="Llamar" onPress={() => onCall(opp)} /> : null}
          {opp.contact_phone || opp.contact_id ? (
            <ChipAction icon="logo-whatsapp" label="WhatsApp" color="#128C4B" tint="#E7F8EE" onPress={() => onWhatsApp(opp)} />
          ) : null}
          <View style={{ flex: 1 }} />
          <Pressable onPress={() => onMove(opp)} hitSlop={8} style={styles.move} accessibilityLabel="Mover a etapa">
            <Ionicons name="swap-horizontal" size={20} color={colors.navy} />
          </Pressable>
        </View>
      </View>
    </Pressable>
  );
}

export const LeadCard = memo(LeadCardBase);

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row', backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border,
    paddingVertical: 14, paddingRight: 14, overflow: 'hidden',
  },
  bar: { width: 4, borderRadius: 2, marginRight: 12, marginLeft: 0 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { flex: 1, fontSize: 17, fontWeight: '700', color: colors.text },
  time: { fontSize: 12, color: colors.faint },
  sub: { fontSize: 14, color: colors.muted, marginTop: 2 },
  meta: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  value: { fontSize: 15, fontWeight: '700', color: colors.success },
  badge: { fontSize: 12, fontWeight: '600', paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.pill, overflow: 'hidden', maxWidth: 160 },
  won: { backgroundColor: '#DCFCE7', color: '#166534' },
  lost: { backgroundColor: colors.dangerSoft, color: '#991B1B' },
  ad: { backgroundColor: colors.orangeSoft, color: colors.orangeDark },
  src: { backgroundColor: '#EEF2F7', color: colors.navySoft },
  notes: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  notesText: { fontSize: 12, color: colors.muted },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
  move: { width: 44, height: 40, borderRadius: radius.pill, backgroundColor: '#F3F0EA', alignItems: 'center', justifyContent: 'center' },
});
