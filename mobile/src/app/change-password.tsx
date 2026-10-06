// Contraseña temporal: hay que cambiarla antes de usar la app.
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/lib/auth';
import { errMsg } from '@/lib/api';
import { colors, radius } from '@/lib/theme';
import { useKeyboardHeight } from '@/lib/useKeyboard';
import { PrimaryButton } from '@/components/ui';
import { useToast } from '@/components/Toast';

export default function ChangePassword() {
  const insets = useSafeAreaInsets();
  const kb = useKeyboardHeight();
  const { changePassword, signOut } = useAuth();
  const toast = useToast();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    if (!current || !next) return setError('Completa todos los campos');
    if (next.length < 8) return setError('La nueva contraseña debe tener al menos 8 caracteres');
    if (next !== repeat) return setError('Las contraseñas no coinciden');
    setBusy(true);
    try {
      await changePassword(current, next);
      toast.show('Contraseña actualizada', 'success');
    } catch (e) { setError(errMsg(e)); } finally { setBusy(false); }
  };

  const field = (label: string, value: string, set: (v: string) => void, auto: 'current-password' | 'new-password') => (
    <>
      <Text style={styles.label}>{label}</Text>
      <TextInput style={styles.input} value={value} onChangeText={set} secureTextEntry autoComplete={auto} autoCapitalize="none" />
    </>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.canvas, paddingBottom: kb }}>
      <ScrollView contentContainerStyle={{ padding: 24, paddingTop: insets.top + 40 }} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Crea tu contraseña</Text>
        <Text style={styles.sub}>Tu cuenta tiene una contraseña temporal. Elige una nueva para continuar.</Text>
        {field('Contraseña temporal', current, setCurrent, 'current-password')}
        {field('Nueva contraseña', next, setNext, 'new-password')}
        {field('Repite la nueva contraseña', repeat, setRepeat, 'new-password')}
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <PrimaryButton label="Guardar y continuar" onPress={submit} loading={busy} style={{ marginTop: 24 }} />
        <Pressable onPress={signOut} style={{ alignSelf: 'center', marginTop: 20 }} hitSlop={10}>
          <Text style={{ color: colors.muted, textDecorationLine: 'underline' }}>Cerrar sesión</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 24, fontWeight: '800', color: colors.navy },
  sub: { fontSize: 15, color: colors.muted, marginTop: 6, marginBottom: 12 },
  label: { fontSize: 14, fontWeight: '600', color: colors.text, marginTop: 14, marginBottom: 6 },
  input: { height: 52, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, paddingHorizontal: 16, fontSize: 16, color: colors.text },
  error: { color: colors.danger, fontSize: 14, marginTop: 14 },
});
