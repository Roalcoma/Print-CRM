// Inicio de sesión. Opción oculta: mantener pulsado el logo para cambiar el servidor (pruebas).
import { useRef, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/lib/auth';
import { errMsg } from '@/lib/api';
import { DEFAULT_API_URL } from '@/lib/config';
import { colors, radius } from '@/lib/theme';
import { useKeyboardHeight } from '@/lib/useKeyboard';
import { PrimaryButton } from '@/components/ui';
import { useToast } from '@/components/Toast';

export default function Login() {
  const insets = useSafeAreaInsets();
  const kb = useKeyboardHeight();
  const { signIn, apiUrl, setApiUrl } = useAuth();
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showServer, setShowServer] = useState(apiUrl !== DEFAULT_API_URL);
  const [server, setServer] = useState(apiUrl);
  const pwRef = useRef<TextInput>(null);

  const submit = async () => {
    if (!email.trim() || !password) { setError('Escribe tu correo y tu contraseña'); return; }
    setBusy(true); setError(null);
    try {
      if (showServer && server.trim() !== apiUrl) await setApiUrl(server);
      await signIn(email, password);
    } catch (e) {
      setError(errMsg(e));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
    } finally { setBusy(false); }
  };

  const toggleServer = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setShowServer(s => !s);
    toast.show(showServer ? 'Opciones de servidor ocultas' : 'Opciones de servidor');
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.canvas, paddingBottom: kb }}>
      <ScrollView contentContainerStyle={[styles.wrap, { paddingTop: insets.top + 48, paddingBottom: insets.bottom + 24 }]} keyboardShouldPersistTaps="handled">
        <Pressable onLongPress={toggleServer} delayLongPress={1500} style={{ alignSelf: 'center' }} accessibilityLabel="Logo de Rocco">
          <Image source={require('../../assets/splash-icon.png')} style={styles.logo} />
        </Pressable>
        <Text style={styles.brand}>Rocco</Text>
        <Text style={styles.tag}>Tus leads y mensajes, a un toque</Text>

        <View style={styles.form}>
          <Text style={styles.label}>Correo</Text>
          <TextInput
            style={styles.input} value={email} onChangeText={setEmail}
            placeholder="tu@empresa.com" placeholderTextColor={colors.faint}
            autoCapitalize="none" autoCorrect={false} keyboardType="email-address" autoComplete="email" textContentType="username"
            returnKeyType="next" onSubmitEditing={() => pwRef.current?.focus()}
          />
          <Text style={styles.label}>Contraseña</Text>
          <View>
            <TextInput
              ref={pwRef} style={[styles.input, { paddingRight: 52 }]} value={password} onChangeText={setPassword}
              placeholder="••••••••" placeholderTextColor={colors.faint}
              secureTextEntry={!showPw} autoComplete="current-password" textContentType="password"
              returnKeyType="go" onSubmitEditing={submit}
            />
            <Pressable onPress={() => setShowPw(s => !s)} style={styles.eye} hitSlop={8} accessibilityLabel={showPw ? 'Ocultar contraseña' : 'Mostrar contraseña'}>
              <Ionicons name={showPw ? 'eye-off-outline' : 'eye-outline'} size={22} color={colors.muted} />
            </Pressable>
          </View>

          {showServer ? (
            <>
              <Text style={styles.label}>Servidor</Text>
              <TextInput
                style={styles.input} value={server} onChangeText={setServer}
                autoCapitalize="none" autoCorrect={false} keyboardType="url" placeholder={DEFAULT_API_URL} placeholderTextColor={colors.faint}
              />
              <Pressable onPress={() => setServer(DEFAULT_API_URL)} hitSlop={6}>
                <Text style={styles.reset}>Usar el servidor por defecto</Text>
              </Pressable>
            </>
          ) : null}

          {error ? <Text style={styles.error}>{error}</Text> : null}
          <PrimaryButton label="Entrar" onPress={submit} loading={busy} style={{ marginTop: 20 }} />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexGrow: 1, paddingHorizontal: 24 },
  logo: { width: 88, height: 88, resizeMode: 'contain' },
  brand: { fontSize: 30, fontWeight: '800', color: colors.navy, textAlign: 'center', marginTop: 12 },
  tag: { fontSize: 15, color: colors.muted, textAlign: 'center', marginTop: 4 },
  form: { marginTop: 36 },
  label: { fontSize: 14, fontWeight: '600', color: colors.text, marginTop: 14, marginBottom: 6 },
  input: {
    height: 52, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card,
    paddingHorizontal: 16, fontSize: 16, color: colors.text,
  },
  eye: { position: 'absolute', right: 0, top: 0, height: 52, width: 52, alignItems: 'center', justifyContent: 'center' },
  reset: { color: colors.orangeDark, fontSize: 13, marginTop: 8 },
  error: { color: colors.danger, fontSize: 14, marginTop: 14, fontWeight: '500' },
});
