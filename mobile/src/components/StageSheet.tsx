// Selector de etapa (mover lead) en bottom sheet.
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Sheet } from './Sheet';
import { colors } from '@/lib/theme';
import type { Stage } from '@/lib/types';

interface Props {
  visible: boolean;
  stages: Stage[];
  currentId?: string | null;
  title?: string;
  onClose(): void;
  onPick(stage: Stage): void;
}

export function StageSheet({ visible, stages, currentId, title = 'Mover a etapa', onClose, onPick }: Props) {
  return (
    <Sheet visible={visible} onClose={onClose} title={title}>
      <ScrollView>
        {stages.map(s => {
          const current = s.id === currentId;
          return (
            <Pressable
              key={s.id}
              onPress={() => (current ? onClose() : onPick(s))}
              style={({ pressed }) => [styles.row, pressed && { backgroundColor: '#F6F4F0' }]}
              accessibilityRole="button"
              accessibilityState={{ selected: current }}
            >
              <View style={[styles.dot, { backgroundColor: s.color || colors.orange }]} />
              <Text style={[styles.name, current && { fontWeight: '700' }]}>{s.name}</Text>
              {current ? <Ionicons name="checkmark-circle" size={22} color={colors.orange} /> : null}
            </Pressable>
          );
        })}
      </ScrollView>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 56, paddingHorizontal: 20 },
  dot: { width: 14, height: 14, borderRadius: 7 },
  name: { flex: 1, fontSize: 16, color: colors.text },
});
