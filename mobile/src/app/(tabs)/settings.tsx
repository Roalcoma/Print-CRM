// Ajustes mínimos: cuenta, notificaciones, desbloqueo biométrico y cerrar sesión.
import { useEffect, useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import Constants from 'expo-constants';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api, ApiError, errMsg } from '@/lib/api';
import { biometricAvailable, useAuth } from '@/lib/auth';
import { getPushStatus, onPushStatus, registerForPush, type PushStatus } from '@/lib/push';
import { colors, radius } from '@/lib/theme';
import type { NotificationPrefs } from '@/lib/types';
import { Avatar, type IconName } from '@/components/ui';
import { Bone } from '@/components/Skeleton';
import { useToast } from '@/components/Toast';

const PREFS: { key: keyof NotificationPrefs; label: string; icon: IconName }[] = [
  { key: 'new_lead', label: 'Nuevos leads', icon: 'person-add-outline' },
  { key: 'new_message', label: 'Mensajes nuevos', icon: 'chatbubble-ellipses-outline' },
  { key: 'appointment', label: 'Citas agendadas o canceladas', icon: 'calendar-outline' },
  { key: 'task', label: 'Tareas por vencer', icon: 'checkbox-outline' },
  { key: 'system', label: 'Avisos del sistema', icon: 'warning-outline' },
];

const ROLE: Record<string, string> = { owner: 'Propietario', admin: 'Administrador', member: 'Miembro', user: 'Usuario' };

const PUSH_NOTE: Partial<Record<PushStatus, string>> = {
  'not-configured': 'Esta versión de la app aún no tiene activadas las notificaciones push.',
  denied: 'Las notificaciones están bloqueadas para Rocco en los ajustes del teléfono.',
  emulator: 'Las notificaciones push solo funcionan en un teléfono real.',
  error: 'No se pudo activar las notificaciones en este dispositivo.',
};

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { user, signOut, biometricEnabled, setBiometric, apiUrl } = useAuth();
  const [prefs, setPrefs] = useState<NotificationPrefs | null>(null);
  const [prefsError, setPrefsError] = useState<string | null>(null);
  const [push, setPush] = useState<PushStatus>(getPushStatus());
  const [bioAvail, setBioAvail] = useState(false);

  useEffect(() => onPushStatus(setPush), []);
  useEffect(() => { biometricAvailable().then(setBioAvail); }, []);
  useEffect(() => {
    api.get<{ prefs?: NotificationPrefs } & Partial<NotificationPrefs>>('/me/notification-prefs')
      .then(r => setPrefs({ new_lead: true, new_message: true, appointment: true, task: true, system: true, ...(r.prefs ?? r) }))
      .catch(e => setPrefsError(e instanceof ApiError && e.status === 404
        ? 'Tu servidor de Rocco aún no admite elegir qué notificaciones recibir.'
        : `No se pudieron cargar tus preferencias (${errMsg(e)}).`));
  }, []);

  const togglePref = async (key: keyof NotificationPrefs, value: boolean) => {
    if (!prefs) return;
    const prev = prefs;
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    try { await api.put('/me/notification-prefs', { prefs: next }); } catch (e) { setPrefs(prev); toast.show(errMsg(e), 'error'); }
  };

  const toggleBio = async (on: boolean) => {
    const ok = await setBiometric(on);
    if (!ok && on) toast.show('No se pudo activar el desbloqueo', 'error');
  };

  const confirmSignOut = () => Alert.alert('Cerrar sesión', '¿Seguro que quieres salir? Dejarás de recibir notificaciones en este teléfono.', [
    { text: 'Cancelar', style: 'cancel' },
    { text: 'Cerrar sesión', style: 'destructive', onPress: () => { signOut(); } },
  ]);

  const note = PUSH_NOTE[push];

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.canvas }} contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: 40 }}>
      <Text style={styles.title}>Ajustes</Text>

      {user ? (
        <View style={[styles.card, styles.userCard]}>
          <Avatar name={user.name} size={56} />
          <View style={{ flex: 1 }}>
            <Text style={styles.userName} numberOfLines={1}>{user.name}</Text>
            <Text style={styles.userMeta} numberOfLines={1}>{user.email}</Text>
            <Text style={styles.userMeta} numberOfLines={1}>{[user.orgName, ROLE[user.role] ?? user.role].filter(Boolean).join(' · ')}</Text>
          </View>
        </View>
      ) : null}

      <Text style={styles.section}>Notificaciones</Text>
      <View style={styles.card}>
        {note ? (
          <Pressable
            style={styles.note}
            onPress={() => (push === 'denied' ? Linking.openSettings() : push === 'error' ? registerForPush() : undefined)}
          >
            <Ionicons name="information-circle-outline" size={20} color={colors.warnText} />
            <Text style={styles.noteText}>{note}{push === 'denied' ? ' Toca para abrirlos.' : push === 'error' ? ' Toca para reintentar.' : ''}</Text>
          </Pressable>
        ) : null}
        {prefs ? PREFS.map((p, i) => (
          <View key={p.key} style={[styles.row, i > 0 && styles.rowBorder]}>
            <Ionicons name={p.icon} size={22} color={colors.navy} />
            <Text style={styles.rowLabel}>{p.label}</Text>
            <Switch
              value={prefs[p.key]}
              onValueChange={v => togglePref(p.key, v)}
              trackColor={{ true: colors.orange, false: '#D6D1C8' }}
              thumbColor="#fff"
              accessibilityLabel={p.label}
            />
          </View>
        )) : prefsError ? (
          <Text style={styles.muted}>{prefsError}</Text>
        ) : (
          <View style={{ padding: 16, gap: 14 }}>{PREFS.map(p => <Bone key={p.key} width="70%" height={18} />)}</View>
        )}
      </View>

      <Text style={styles.section}>Seguridad</Text>
      <View style={styles.card}>
        <View style={styles.row}>
          <Ionicons name="finger-print" size={22} color={colors.navy} />
          <View style={{ flex: 1 }}>
            <Text style={styles.rowLabel}>Desbloqueo con huella o rostro</Text>
            {!bioAvail ? <Text style={styles.rowHint}>No hay huella o rostro configurado en este teléfono</Text> : null}
          </View>
          <Switch
            value={biometricEnabled}
            disabled={!bioAvail && !biometricEnabled}
            onValueChange={toggleBio}
            trackColor={{ true: colors.orange, false: '#D6D1C8' }}
            thumbColor="#fff"
          />
        </View>
      </View>

      <Pressable onPress={confirmSignOut} style={({ pressed }) => [styles.card, styles.logout, pressed && { opacity: 0.7 }]} accessibilityRole="button">
        <Ionicons name="log-out-outline" size={22} color={colors.danger} />
        <Text style={styles.logoutText}>Cerrar sesión</Text>
      </Pressable>

      <Text style={styles.footer}>Rocco {Constants.expoConfig?.version ?? ''} · {apiUrl.replace(/^https?:\/\//, '')}</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 28, fontWeight: '800', color: colors.navy, paddingHorizontal: 16, marginBottom: 12 },
  section: { fontSize: 13, fontWeight: '700', color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.6, paddingHorizontal: 20, marginTop: 20, marginBottom: 8 },
  card: { marginHorizontal: 16, backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  userCard: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16 },
  userName: { fontSize: 18, fontWeight: '700', color: colors.text },
  userMeta: { fontSize: 14, color: colors.muted, marginTop: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingVertical: 8, minHeight: 60 },
  rowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  rowLabel: { flex: 1, fontSize: 16, color: colors.text },
  rowHint: { fontSize: 12, color: colors.muted, marginTop: 2 },
  note: { flexDirection: 'row', gap: 8, padding: 12, margin: 10, borderRadius: radius.md, backgroundColor: colors.warnSoft },
  noteText: { flex: 1, fontSize: 13, color: colors.warnText },
  muted: { padding: 16, color: colors.muted, fontSize: 14 },
  logout: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, height: 56, marginTop: 28 },
  logoutText: { fontSize: 16, fontWeight: '700', color: colors.danger },
  footer: { textAlign: 'center', color: colors.faint, fontSize: 12, marginTop: 20 },
});
