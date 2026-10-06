import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View, type DimensionValue, type ViewStyle } from 'react-native';
import { colors, radius } from '@/lib/theme';

export function Bone({ width, height = 14, style }: { width: DimensionValue; height?: number; style?: ViewStyle }) {
  const a = useRef(new Animated.Value(0.5)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(a, { toValue: 1, duration: 650, useNativeDriver: true }),
      Animated.timing(a, { toValue: 0.5, duration: 650, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [a]);
  return <Animated.View style={[{ width, height, borderRadius: 6, backgroundColor: colors.skeleton, opacity: a }, style]} />;
}

// Tarjetas fantasma mientras carga una lista.
export function CardSkeleton({ count = 5 }: { count?: number }) {
  return (
    <View style={{ padding: 16, gap: 12 }}>
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={styles.card}>
          <Bone width="60%" height={16} />
          <Bone width="35%" style={{ marginTop: 10 }} />
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
            <Bone width={90} height={36} /><Bone width={90} height={36} />
          </View>
        </View>
      ))}
    </View>
  );
}

export function RowSkeleton({ count = 8 }: { count?: number }) {
  return (
    <View style={{ paddingHorizontal: 16 }}>
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 14, gap: 12 }}>
          <Bone width={48} height={48} style={{ borderRadius: 24 }} />
          <View style={{ flex: 1, gap: 8 }}><Bone width="50%" height={15} /><Bone width="80%" /></View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: radius.lg, padding: 16, borderWidth: 1, borderColor: colors.border },
});
