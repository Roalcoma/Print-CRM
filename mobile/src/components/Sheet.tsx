// Bottom sheet nativo (Modal + Animated), sin dependencias extra.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, Dimensions, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius } from '@/lib/theme';
import { useKeyboardHeight } from '@/lib/useKeyboard';

interface Props { visible: boolean; onClose(): void; title?: string; children: ReactNode }

export function Sheet({ visible, onClose, title, children }: Props) {
  const insets = useSafeAreaInsets();
  const [mounted, setMounted] = useState(visible);
  const anim = useRef(new Animated.Value(0)).current;
  const kb = useKeyboardHeight();

  useEffect(() => {
    if (visible) {
      setMounted(true);
      Animated.spring(anim, { toValue: 1, useNativeDriver: true, speed: 18, bounciness: 2 }).start();
    } else if (mounted) {
      Animated.timing(anim, { toValue: 0, duration: 180, useNativeDriver: true }).start(() => setMounted(false));
    }
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!mounted) return null;
  const h = Dimensions.get('window').height;
  return (
    <Modal transparent visible animationType="none" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <View style={{ flex: 1 }}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, { opacity: anim }]}>
          <Pressable style={{ flex: 1 }} onPress={onClose} accessibilityLabel="Cerrar" />
        </Animated.View>
        <Animated.View
          style={[styles.sheet, {
            bottom: kb, paddingBottom: (kb ? 0 : insets.bottom) + 12, maxHeight: (h - kb) * 0.85,
            transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [h * 0.6, 0] }) }],
          }]}
        >
          <View style={styles.handle} />
          {title ? <Text style={styles.title}>{title}</Text> : null}
          {children}
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { backgroundColor: 'rgba(19,36,61,0.45)' },
  sheet: {
    position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: colors.card,
    borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, paddingTop: 8,
  },
  handle: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: colors.border, marginBottom: 8 },
  title: { fontSize: 17, fontWeight: '700', color: colors.text, paddingHorizontal: 20, paddingVertical: 8 },
});
