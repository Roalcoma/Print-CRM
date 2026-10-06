// Bandeja de mensajes: conversaciones recientes con no leídos destacados.
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api, errMsg, qs } from '@/lib/api';
import { openChat } from '@/lib/actions';
import { emit, on } from '@/lib/events';
import { PAGE_SIZE } from '@/lib/config';
import { convName, listTime } from '@/lib/format';
import { useUnread } from '@/lib/unread';
import { colors, radius } from '@/lib/theme';
import type { Conversation } from '@/lib/types';
import { Avatar, ChannelIcon, EmptyState } from '@/components/ui';
import { RowSkeleton } from '@/components/Skeleton';
import { useToast } from '@/components/Toast';

type Filter = 'all' | 'unread';

export default function MessagesScreen() {
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { unread, refreshUnread } = useUnread();
  const [filter, setFilter] = useState<Filter>('all');
  const [items, setItems] = useState<Conversation[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchText, setSearchText] = useState('');
  const [q, setQ] = useState('');
  const seq = useRef(0);

  const params = useCallback((offset: number) => qs({
    limit: PAGE_SIZE, offset, status: 'all', unread: filter === 'unread' ? 'true' : undefined, q: q || undefined,
  }), [filter, q]);

  const load = useCallback(async (mode: 'initial' | 'refresh' | 'silent') => {
    const s = ++seq.current;
    if (mode === 'initial') setLoading(true);
    if (mode === 'refresh') setRefreshing(true);
    try {
      const r = await api.get<{ conversations: Conversation[]; total: number }>(`/conversations${params(0)}`);
      if (s !== seq.current) return;
      setItems(r.conversations); setTotal(r.total); setError(null);
    } catch (e) {
      if (s !== seq.current) return;
      if (mode === 'initial') setError(errMsg(e)); else if (mode === 'refresh') toast.show(errMsg(e), 'error');
    } finally {
      if (s === seq.current) { setLoading(false); setRefreshing(false); }
    }
    refreshUnread();
  }, [params, toast, refreshUnread]);

  useEffect(() => { load('initial'); }, [load]);
  // Al volver a la pestaña (no en el primer montaje, que ya carga arriba).
  const loadRef = useRef(load);
  loadRef.current = load;
  const seen = useRef(false);
  useFocusEffect(useCallback(() => {
    if (seen.current) loadRef.current('silent');
    seen.current = true;
  }, []));
  useEffect(() => on('push:message', () => load('silent')), [load]);
  // Si el contador global cambia (polling), refrescar la lista para que se vean los nuevos.
  const prevUnread = useRef(unread);
  useEffect(() => {
    if (unread !== prevUnread.current) { prevUnread.current = unread; load('silent'); }
  }, [unread, load]);

  useEffect(() => {
    const t = setTimeout(() => setQ(searchText.trim()), 350);
    return () => clearTimeout(t);
  }, [searchText]);

  const loadMore = async () => {
    if (loadingMore || items.length >= total) return;
    setLoadingMore(true);
    const s = seq.current;
    try {
      const r = await api.get<{ conversations: Conversation[]; total: number }>(`/conversations${params(items.length)}`);
      if (s !== seq.current) return;
      setItems(prev => {
        const have = new Set(prev.map(c => c.id));
        return [...prev, ...r.conversations.filter(c => !have.has(c.id))];
      });
      setTotal(r.total);
    } catch (e) { toast.show(errMsg(e), 'error'); } finally { setLoadingMore(false); }
  };

  const open = (c: Conversation) => {
    // Se marca leída al abrir el chat; lo reflejamos ya en la lista.
    if (c.unread_count > 0) {
      setItems(prev => (filter === 'unread' ? prev.filter(x => x.id !== c.id) : prev.map(x => (x.id === c.id ? { ...x, unread_count: 0 } : x))));
      setTimeout(() => emit('conversations:changed'), 1500);
    }
    openChat({ id: c.id, channel: c.channel, name: convName(c) });
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.canvas }}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Text style={styles.title}>Mensajes</Text>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={18} color={colors.faint} />
          <TextInput
            value={searchText} onChangeText={setSearchText} placeholder="Buscar nombre o teléfono"
            placeholderTextColor={colors.faint} style={styles.searchInput} autoCorrect={false} returnKeyType="search"
          />
          {searchText ? <Pressable onPress={() => setSearchText('')} hitSlop={8}><Ionicons name="close-circle" size={18} color={colors.faint} /></Pressable> : null}
        </View>
        <View style={styles.filters}>
          {(['all', 'unread'] as Filter[]).map(f => (
            <Pressable key={f} onPress={() => setFilter(f)} style={[styles.filter, filter === f && styles.filterOn]} accessibilityRole="tab" accessibilityState={{ selected: filter === f }}>
              <Text style={[styles.filterText, filter === f && { color: '#fff' }]}>
                {f === 'all' ? 'Todas' : `No leídas${unread ? ` (${unread})` : ''}`}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {loading ? <RowSkeleton /> : error ? (
        <View>
          <EmptyState icon="cloud-offline-outline" title="No se pudieron cargar los mensajes" subtitle={error} />
          <Pressable onPress={() => load('initial')} style={styles.retry}><Text style={styles.retryText}>Reintentar</Text></Pressable>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={c => c.id}
          renderItem={({ item }) => <ConvRow c={item} onPress={() => open(item)} />}
          ItemSeparatorComponent={() => <View style={styles.sep} />}
          onEndReached={loadMore}
          onEndReachedThreshold={0.5}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load('refresh')} colors={[colors.orange]} tintColor={colors.orange} />}
          ListEmptyComponent={
            <EmptyState
              icon={filter === 'unread' ? 'checkmark-done-outline' : 'chatbubbles-outline'}
              title={filter === 'unread' ? 'Todo leído' : q ? 'Sin resultados' : 'Aún no hay conversaciones'}
              subtitle={filter === 'unread' ? 'No tienes mensajes pendientes.' : undefined}
            />
          }
          ListFooterComponent={loadingMore ? <ActivityIndicator color={colors.orange} style={{ marginVertical: 16 }} /> : null}
          contentContainerStyle={{ paddingBottom: 24, flexGrow: 1 }}
        />
      )}
    </View>
  );
}

function ConvRow({ c, onPress }: { c: Conversation; onPress(): void }) {
  const name = convName(c);
  const unread = c.unread_count > 0;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressed && { backgroundColor: '#EFEBE4' }]} accessibilityRole="button" accessibilityLabel={`${name}${unread ? `, ${c.unread_count} sin leer` : ''}`}>
      <View>
        <Avatar name={name} size={50} />
        <View style={styles.channel}><ChannelIcon channel={c.channel} size={14} /></View>
      </View>
      <View style={{ flex: 1 }}>
        <View style={styles.rowTop}>
          <Text style={[styles.name, unread && { fontWeight: '800' }]} numberOfLines={1}>{name}</Text>
          <Text style={[styles.time, unread && { color: colors.orangeDark, fontWeight: '700' }]}>{listTime(c.last_message_at)}</Text>
        </View>
        <View style={styles.rowTop}>
          <Text style={[styles.preview, unread && { color: colors.text, fontWeight: '600' }]} numberOfLines={1}>
            {c.last_message_preview || ' '}
          </Text>
          {unread ? <Text style={styles.badge}>{c.unread_count > 99 ? '99+' : c.unread_count}</Text> : null}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 16, paddingBottom: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  title: { fontSize: 28, fontWeight: '800', color: colors.navy, marginBottom: 10 },
  searchBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, height: 46, borderRadius: radius.md,
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
  },
  searchInput: { flex: 1, fontSize: 16, color: colors.text, paddingVertical: 0 },
  filters: { flexDirection: 'row', gap: 8, marginTop: 10 },
  filter: { height: 38, paddingHorizontal: 16, borderRadius: radius.pill, justifyContent: 'center', backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  filterOn: { backgroundColor: colors.navy, borderColor: colors.navy },
  filterText: { fontSize: 14, fontWeight: '600', color: colors.text },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, minHeight: 72 },
  channel: { position: 'absolute', right: -2, bottom: -2, backgroundColor: '#fff', borderRadius: 10, padding: 2 },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { flex: 1, fontSize: 16, fontWeight: '600', color: colors.text },
  time: { fontSize: 12, color: colors.faint },
  preview: { flex: 1, fontSize: 14, color: colors.muted, marginTop: 3 },
  badge: { minWidth: 22, height: 22, borderRadius: 11, backgroundColor: colors.orange, color: '#fff', fontSize: 12, fontWeight: '800', textAlign: 'center', textAlignVertical: 'center', lineHeight: 22, paddingHorizontal: 6, overflow: 'hidden' },
  sep: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginLeft: 78 },
  retry: { alignSelf: 'center', paddingHorizontal: 24, height: 48, justifyContent: 'center', borderRadius: radius.pill, backgroundColor: colors.navy },
  retryText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
