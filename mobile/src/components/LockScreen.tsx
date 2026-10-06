// Pantalla de bloqueo (desbloqueo con huella/rostro). Se superpone a la navegación para no perder
// la pantalla en la que estaba el usuario (o a la que lleva una notificación).
import { useEffect } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/lib/auth';
import { colors, radius } from '@/lib/theme';

export function LockScreen() {
  const { unlock, signOut, user } = useAuth();
  useEffect(() => { unlock(); }, [unlock]);
  return (
    <View style={[StyleSheet.absoluteFill, styles.wrap]}>
      <Image source={require('../../assets/splash-icon.png')} style={styles.logo} />
      <Text style={styles.title}>Rocco está bloqueado</Text>
      {user ? <Text style={styles.sub}>{user.name}</Text> : null}
      <Pressable onPress={unlock} style={({ pressed }) => [styles.btn, pressed && { opacity: 0.85 }]} accessibilityRole="button">
        <Ionicons name="finger-print" size={26} color="#fff" />
        <Text style={styles.btnText}>Desbloquear</Text>
      </Pressable>
      <Pressable onPress={signOut} hitSlop={10} style={{ marginTop: 24 }}>
        <Text style={styles.link}>Cerrar sesión</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { backgroundColor: colors.canvas, alignItems: 'center', justifyContent: 'center', padding: 32, zIndex: 100 },
  logo: { width: 96, height: 96, resizeMode: 'contain', marginBottom: 20 },
  title: { fontSize: 20, fontWeight: '700', color: colors.text },
  sub: { fontSize: 15, color: colors.muted, marginTop: 4 },
  btn: { marginTop: 32, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.orange, paddingHorizontal: 28, height: 56, borderRadius: radius.pill },
  btnText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  link: { color: colors.muted, fontSize: 15, textDecorationLine: 'underline' },
});
