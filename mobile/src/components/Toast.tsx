// Avisos breves (errores en español, confirmaciones) sin bloquear la pantalla.
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { Animated, StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius } from '@/lib/theme';

type Kind = 'error' | 'success' | 'info';
const Ctx = createContext<{ show(msg: string, kind?: Kind): void }>({ show: () => {} });

export function ToastProvider({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  const [toast, setToast] = useState<{ msg: string; kind: Kind } | null>(null);
  const anim = useRef(new Animated.Value(0)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback((msg: string, kind: Kind = 'info') => {
    if (timer.current) clearTimeout(timer.current);
    setToast({ msg, kind });
    Animated.spring(anim, { toValue: 1, useNativeDriver: true, speed: 20, bounciness: 4 }).start();
    timer.current = setTimeout(() => {
      Animated.timing(anim, { toValue: 0, duration: 180, useNativeDriver: true }).start(() => setToast(null));
    }, kind === 'error' ? 4000 : 2500);
  }, [anim]);

  // Valor estable: si cambiara en cada aviso, las pantallas que dependen de `toast` recargarían.
  const value = useMemo(() => ({ show }), [show]);
  const bg = toast?.kind === 'error' ? colors.danger : toast?.kind === 'success' ? colors.success : colors.navy;
  return (
    <Ctx.Provider value={value}>
      {children}
      {toast && (
        <Animated.View
          pointerEvents="none"
          accessibilityLiveRegion="polite"
          style={[styles.toast, {
            top: insets.top + 8, backgroundColor: bg, opacity: anim,
            transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [-20, 0] }) }],
          }]}
        >
          <Text style={styles.text}>{toast.msg}</Text>
        </Animated.View>
      )}
    </Ctx.Provider>
  );
}

export const useToast = () => useContext(Ctx);

const styles = StyleSheet.create({
  toast: {
    position: 'absolute', left: 16, right: 16, paddingVertical: 14, paddingHorizontal: 16,
    borderRadius: radius.md, elevation: 8, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 10, shadowOffset: { width: 0, height: 4 },
  },
  text: { color: '#fff', fontSize: 15, fontWeight: '600' },
});
