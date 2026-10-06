// Piezas visuales compartidas.
import type { ComponentProps, ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, TOUCH } from '@/lib/theme';
import { initials } from '@/lib/format';

export type IconName = ComponentProps<typeof Ionicons>['name'];

const AVATAR_COLORS = ['#F69008', '#13243D', '#0EA5E9', '#16A34A', '#9333EA', '#DB2777', '#CA8A04', '#0F766E'];
function hashColor(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

export function Avatar({ name, size = 44 }: { name: string; size?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: hashColor(name), alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: '#fff', fontWeight: '700', fontSize: size * 0.38 }}>{initials(name)}</Text>
    </View>
  );
}

export function ChannelIcon({ channel, size = 16 }: { channel: string | null | undefined; size?: number }) {
  if (channel === 'instagram_dm') return <Ionicons name="logo-instagram" size={size} color={colors.instagram} />;
  if (channel === 'facebook_dm') return <MaterialCommunityIcons name="facebook-messenger" size={size} color={colors.messenger} />;
  return <Ionicons name="logo-whatsapp" size={size} color={colors.whatsapp} />;
}

// Botón grande de acción con icono + texto (fila de la ficha del lead).
export function BigAction({ icon, label, onPress, color = colors.navy, disabled, iconNode }: {
  icon?: IconName; label: string; onPress(): void; color?: string; disabled?: boolean; iconNode?: ReactNode;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.big, { opacity: disabled ? 0.4 : pressed ? 0.7 : 1 }]}
    >
      <View style={[styles.bigIcon, { backgroundColor: color }]}>
        {iconNode ?? <Ionicons name={icon!} size={24} color="#fff" />}
      </View>
      <Text style={styles.bigLabel}>{label}</Text>
    </Pressable>
  );
}

// Botón de acción compacto (tarjeta de lead).
export function ChipAction({ icon, label, onPress, color = colors.navy, tint }: {
  icon: IconName; label: string; onPress(): void; color?: string; tint?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.chip, { backgroundColor: tint ?? '#F3F0EA', opacity: pressed ? 0.6 : 1 }]}
    >
      <Ionicons name={icon} size={18} color={color} />
      <Text style={[styles.chipText, { color }]}>{label}</Text>
    </Pressable>
  );
}

export function PrimaryButton({ label, onPress, loading, disabled, style }: {
  label: string; onPress(): void; loading?: boolean; disabled?: boolean; style?: ViewStyle;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      style={({ pressed }) => [styles.primary, { opacity: disabled ? 0.5 : pressed ? 0.85 : 1 }, style]}
    >
      {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>{label}</Text>}
    </Pressable>
  );
}

export function EmptyState({ icon, title, subtitle }: { icon: IconName; title: string; subtitle?: string }) {
  return (
    <View style={styles.empty}>
      <Ionicons name={icon} size={44} color={colors.faint} />
      <Text style={styles.emptyTitle}>{title}</Text>
      {subtitle ? <Text style={styles.emptySub}>{subtitle}</Text> : null}
    </View>
  );
}

// Cabecera de pantallas de detalle (con botón atrás).
export function DetailHeader({ title, subtitle, right, onBack }: { title: string; subtitle?: ReactNode; right?: ReactNode; onBack?(): void }) {
  const insets = useSafeAreaInsets();
  const back = onBack ?? (() => (router.canGoBack() ? router.back() : router.replace('/')));
  return (
    <View style={[styles.header, { paddingTop: insets.top + 4 }]}>
      <Pressable onPress={back} hitSlop={10} style={styles.headerBtn} accessibilityLabel="Volver">
        <Ionicons name="arrow-back" size={24} color={colors.text} />
      </Pressable>
      <View style={{ flex: 1 }}>
        <Text style={styles.headerTitle} numberOfLines={1}>{title}</Text>
        {typeof subtitle === 'string' ? <Text style={styles.headerSub} numberOfLines={1}>{subtitle}</Text> : subtitle}
      </View>
      {right}
    </View>
  );
}

export const styles = StyleSheet.create({
  big: { flex: 1, alignItems: 'center', gap: 6, minHeight: TOUCH },
  bigIcon: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  bigLabel: { fontSize: 13, fontWeight: '600', color: colors.text },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 40, paddingHorizontal: 14, borderRadius: radius.pill },
  chipText: { fontSize: 14, fontWeight: '600' },
  primary: { height: 52, borderRadius: radius.md, backgroundColor: colors.orange, alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  empty: { alignItems: 'center', paddingVertical: 60, paddingHorizontal: 32, gap: 8 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: colors.text, textAlign: 'center' },
  emptySub: { fontSize: 14, color: colors.muted, textAlign: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 8, paddingBottom: 8, backgroundColor: colors.canvas },
  headerBtn: { width: TOUCH, height: TOUCH, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: colors.text },
  headerSub: { fontSize: 13, color: colors.muted },
});
