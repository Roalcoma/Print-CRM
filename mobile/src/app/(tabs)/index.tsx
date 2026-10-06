// Leads (pantalla de inicio): pipeline → etapas en pestañas deslizables → tarjetas con scroll infinito.
import { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator, FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput,
  useWindowDimensions, View, type NativeScrollEvent, type NativeSyntheticEvent,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api, errMsg } from '@/lib/api';
import { callPhone, openWhatsApp } from '@/lib/actions';
import { on } from '@/lib/events';
import { PAGE_SIZE } from '@/lib/config';
import { getItem, KEYS, setItem } from '@/lib/storage';
import { leadName } from '@/lib/format';
import { colors, radius } from '@/lib/theme';
import type { Opportunity, OppPage, OppTotal, Pipeline, Stage } from '@/lib/types';
import { LeadCard } from '@/components/LeadCard';
import { CardSkeleton } from '@/components/Skeleton';
import { EmptyState } from '@/components/ui';
import { Sheet } from '@/components/Sheet';
import { StageSheet } from '@/components/StageSheet';
import { useToast } from '@/components/Toast';

interface Col { items: Opportunity[]; loadingMore: boolean }
type Cols = Record<string, Col>;

const countsOf = (totals: OppTotal[]) => {
  const c: Record<string, number> = {};
  for (const t of totals) c[t.stage_id] = (c[t.stage_id] ?? 0) + t.count;
  return c;
};

export default function LeadsScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const toast = useToast();

  const [pipelines, setPipelines] = useState<Pipeline[] | null>(null);
  const [pipelineId, setPipelineId] = useState<string | null>(null);
  const [cols, setCols] = useState<Cols>({});
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [search, setSearch] = useState('');
  const [pipeSheet, setPipeSheet] = useState(false);
  const [moving, setMoving] = useState<Opportunity | null>(null);

  const pager = useRef<FlatList<Stage>>(null);
  const tabsRef = useRef<ScrollView>(null);
  const tabX = useRef<Record<number, number>>({});
  const loadSeq = useRef(0);
  const lastLoad = useRef(0);

  const pipeline = useMemo(() => pipelines?.find(p => p.id === pipelineId) ?? null, [pipelines, pipelineId]);
  const stages = useMemo(() => pipeline?.stages ?? [], [pipeline]);

  // Pipelines (y el último elegido).
  const loadPipelines = useCallback(async () => {
    try {
      const [list, saved] = await Promise.all([api.get<Pipeline[]>('/pipelines'), getItem(KEYS.pipeline)]);
      setPipelines(list);
      setPipelineId(cur => (cur && list.some(p => p.id === cur)) ? cur : (list.find(p => p.id === saved)?.id ?? list[0]?.id ?? null));
      if (!list.length) setLoading(false);
      setError(null);
    } catch (e) {
      setError(errMsg(e));
      setLoading(false);
    }
  }, []);
  useEffect(() => { loadPipelines(); }, [loadPipelines]);

  // Primera página de todas las etapas + totales, en una sola petición.
  const loadAll = useCallback(async (mode: 'initial' | 'refresh' | 'silent' = 'initial') => {
    if (!pipelineId) return;
    const seq = ++loadSeq.current;
    if (mode === 'initial') setLoading(true);
    if (mode === 'refresh') setRefreshing(true);
    try {
      const page = await api.post<OppPage>('/opportunities/query', {
        pipelineId, limit: PAGE_SIZE, group: 'stage', search: search || undefined, sort_by: 'created_at', sort_dir: 'desc',
      });
      if (seq !== loadSeq.current) return;
      const next: Cols = {};
      for (const o of page.opportunities) (next[o.stage_id] ??= { items: [], loadingMore: false }).items.push(o);
      setCols(next);
      setCounts(countsOf(page.totals));
      setError(null);
      lastLoad.current = Date.now();
    } catch (e) {
      if (seq !== loadSeq.current) return;
      if (mode === 'initial') setError(errMsg(e)); else toast.show(errMsg(e), 'error');
    } finally {
      if (seq === loadSeq.current) { setLoading(false); setRefreshing(false); }
    }
  }, [pipelineId, search, toast]);
  useEffect(() => { loadAll('initial'); }, [loadAll]);

  // Al volver a la pestaña (p. ej. tras mover un lead en la ficha) o al llegar un lead nuevo.
  useFocusEffect(useCallback(() => {
    if (lastLoad.current && Date.now() - lastLoad.current > 30_000) loadAll('silent');
  }, [loadAll]));
  useEffect(() => {
    const offs = [on('push:lead', () => loadAll('silent')), on('opps:changed', () => loadAll('silent'))];
    return () => offs.forEach(o => o());
  }, [loadAll]);

  // Búsqueda con espera corta mientras se escribe.
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchText.trim()), 350);
    return () => clearTimeout(t);
  }, [searchText]);

  const loadMore = useCallback(async (stageId: string) => {
    const col = cols[stageId];
    const total = counts[stageId] ?? 0;
    if (!pipelineId || !col || col.loadingMore || col.items.length >= total) return;
    const seq = loadSeq.current;
    setCols(c => ({ ...c, [stageId]: { ...c[stageId], loadingMore: true } }));
    try {
      const page = await api.post<OppPage>('/opportunities/query', {
        pipelineId, limit: PAGE_SIZE, offset: col.items.length, stageId, group: 'stage',
        search: search || undefined, sort_by: 'created_at', sort_dir: 'desc',
      });
      if (seq !== loadSeq.current) return;
      setCols(c => {
        const have = new Set(c[stageId]?.items.map(o => o.id));
        return { ...c, [stageId]: { items: [...(c[stageId]?.items ?? []), ...page.opportunities.filter(o => !have.has(o.id))], loadingMore: false } };
      });
      setCounts(countsOf(page.totals));
    } catch (e) {
      setCols(c => ({ ...c, [stageId]: { ...c[stageId], loadingMore: false } }));
      toast.show(errMsg(e), 'error');
    }
  }, [cols, counts, pipelineId, search, toast]);

  const goToStage = (i: number) => {
    setIndex(i);
    pager.current?.scrollToIndex({ index: i, animated: true });
  };
  useEffect(() => {
    const x = tabX.current[index];
    if (x !== undefined) tabsRef.current?.scrollTo({ x: Math.max(0, x - 24), animated: true });
  }, [index]);
  useEffect(() => { setIndex(0); pager.current?.scrollToOffset({ offset: 0, animated: false }); }, [pipelineId]);

  const onPagerEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.round(e.nativeEvent.contentOffset.x / width);
    if (i !== index) setIndex(i);
  };

  const pickPipeline = (p: Pipeline) => {
    setPipeSheet(false);
    if (p.id === pipelineId) return;
    setPipelineId(p.id);
    setItem(KEYS.pipeline, p.id);
  };

  // Mover de etapa: optimista, y se recarga si el servidor lo rechaza.
  const moveTo = async (opp: Opportunity, stage: Stage) => {
    setMoving(null);
    const from = opp.stage_id;
    const moved = { ...opp, stage_id: stage.id };
    setCols(c => ({
      ...c,
      [from]: { ...(c[from] ?? { loadingMore: false }), items: (c[from]?.items ?? []).filter(o => o.id !== opp.id) },
      [stage.id]: { ...(c[stage.id] ?? { loadingMore: false }), items: [moved, ...(c[stage.id]?.items ?? [])] },
    }));
    setCounts(c => ({ ...c, [from]: Math.max(0, (c[from] ?? 1) - 1), [stage.id]: (c[stage.id] ?? 0) + 1 }));
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    try {
      await api.patch(`/opportunities/${opp.id}`, { stage_id: stage.id });
      toast.show(`${leadName(opp)} → ${stage.name}`, 'success');
    } catch (e) {
      toast.show(errMsg(e), 'error');
      loadAll('silent');
    }
  };

  const onOpen = useCallback((o: Opportunity) => router.push({ pathname: '/lead/[id]', params: { id: o.id } }), []);
  const onMove = useCallback((o: Opportunity) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setMoving(o);
  }, []);
  const onCall = useCallback((o: Opportunity) => { callPhone(o.contact_phone); }, []);
  const onWhatsApp = useCallback(async (o: Opportunity) => {
    const r = await openWhatsApp(o.contact_id, o.contact_phone, leadName(o));
    if (r === 'none') toast.show('Este lead no tiene teléfono ni conversación', 'error');
  }, [toast]);

  const header = (
    <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
      <View style={styles.titleRow}>
        <Pressable
          style={{ flex: 1 }}
          disabled={(pipelines?.length ?? 0) < 2}
          onPress={() => setPipeSheet(true)}
          accessibilityRole="button"
          accessibilityLabel="Cambiar pipeline"
        >
          <Text style={styles.title}>Leads</Text>
          {pipeline ? (
            <View style={styles.pipeRow}>
              <Text style={styles.pipeName} numberOfLines={1}>{pipeline.name}</Text>
              {(pipelines?.length ?? 0) > 1 ? <Ionicons name="chevron-down" size={16} color={colors.orangeDark} /> : null}
            </View>
          ) : null}
        </Pressable>
        <Pressable
          onPress={() => { if (searchOpen) { setSearchText(''); } setSearchOpen(s => !s); }}
          style={styles.iconBtn} hitSlop={6} accessibilityLabel={searchOpen ? 'Cerrar búsqueda' : 'Buscar'}
        >
          <Ionicons name={searchOpen ? 'close' : 'search'} size={24} color={colors.text} />
        </Pressable>
      </View>
      {searchOpen ? (
        <View style={styles.searchBox}>
          <Ionicons name="search" size={18} color={colors.faint} />
          <TextInput
            autoFocus value={searchText} onChangeText={setSearchText} placeholder="Buscar por nombre, empresa o email"
            placeholderTextColor={colors.faint} style={styles.searchInput} returnKeyType="search" autoCorrect={false}
          />
          {searchText ? <Pressable onPress={() => setSearchText('')} hitSlop={8}><Ionicons name="close-circle" size={18} color={colors.faint} /></Pressable> : null}
        </View>
      ) : null}
      {stages.length ? (
        <ScrollView ref={tabsRef} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
          {stages.map((s, i) => {
            const active = i === index;
            return (
              <Pressable
                key={s.id}
                onPress={() => goToStage(i)}
                onLayout={e => { tabX.current[i] = e.nativeEvent.layout.x; }}
                style={[styles.tab, active && styles.tabActive]}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
              >
                <View style={[styles.tabDot, { backgroundColor: s.color || colors.orange }]} />
                <Text style={[styles.tabText, active && styles.tabTextActive]} numberOfLines={1}>{s.name}</Text>
                <Text style={[styles.tabCount, active && styles.tabCountActive]}>{counts[s.id] ?? 0}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}
    </View>
  );

  let body: ReactNode;
  if (error && !Object.keys(cols).length) {
    body = (
      <View style={{ flex: 1 }}>
        <EmptyState icon="cloud-offline-outline" title="No se pudieron cargar los leads" subtitle={error} />
        <Pressable onPress={() => { setError(null); pipelines ? loadAll('initial') : loadPipelines(); }} style={styles.retry}>
          <Text style={styles.retryText}>Reintentar</Text>
        </Pressable>
      </View>
    );
  } else if (pipelines && !pipelines.length) {
    body = <EmptyState icon="git-branch-outline" title="Aún no hay pipelines" subtitle="Créalos desde la versión web de Rocco." />;
  } else if (loading || !pipeline) {
    body = <CardSkeleton />;
  } else {
    body = (
      <FlatList
        ref={pager}
        data={stages}
        keyExtractor={s => s.id}
        extraData={[cols, counts, refreshing, search, loadMore]}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onPagerEnd}
        getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
        initialNumToRender={1}
        windowSize={3}
        renderItem={({ item }) => (
          <StagePage
            width={width}
            stage={item}
            col={cols[item.id]}
            total={counts[item.id] ?? 0}
            refreshing={refreshing}
            searching={!!search}
            onRefresh={() => loadAll('refresh')}
            onEndReached={() => loadMore(item.id)}
            onOpen={onOpen} onMove={onMove} onCall={onCall} onWhatsApp={onWhatsApp}
          />
        )}
      />
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.canvas }}>
      {header}
      {body}
      <Sheet visible={pipeSheet} onClose={() => setPipeSheet(false)} title="Pipeline">
        <ScrollView>
          {pipelines?.map(p => (
            <Pressable key={p.id} onPress={() => pickPipeline(p)} style={({ pressed }) => [styles.sheetRow, pressed && { backgroundColor: colors.canvas }]}>
              <Text style={[styles.sheetText, p.id === pipelineId && { fontWeight: '700' }]}>{p.name}</Text>
              {p.id === pipelineId ? <Ionicons name="checkmark-circle" size={22} color={colors.orange} /> : null}
            </Pressable>
          ))}
        </ScrollView>
      </Sheet>
      <StageSheet
        visible={!!moving}
        stages={stages}
        currentId={moving?.stage_id}
        title={moving ? `Mover «${leadName(moving)}»` : undefined}
        onClose={() => setMoving(null)}
        onPick={s => moving && moveTo(moving, s)}
      />
    </View>
  );
}

interface PageProps {
  width: number; stage: Stage; col?: Col; total: number; refreshing: boolean; searching: boolean;
  onRefresh(): void; onEndReached(): void;
  onOpen(o: Opportunity): void; onMove(o: Opportunity): void; onCall(o: Opportunity): void; onWhatsApp(o: Opportunity): void;
}

const StagePage = memo(function StagePage({ width, stage, col, total, refreshing, searching, onRefresh, onEndReached, ...actions }: PageProps) {
  const items = col?.items ?? [];
  return (
    <View style={{ width }}>
      <FlatList
        data={items}
        keyExtractor={o => o.id}
        nestedScrollEnabled
        contentContainerStyle={{ padding: 16, paddingBottom: 32, gap: 12, flexGrow: 1 }}
        renderItem={({ item }) => <LeadCard opp={item} stageColor={stage.color} {...actions} />}
        onEndReached={onEndReached}
        onEndReachedThreshold={0.6}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.orange]} tintColor={colors.orange} />}
        ListEmptyComponent={
          <EmptyState
            icon={searching ? 'search-outline' : 'file-tray-outline'}
            title={searching ? 'Sin resultados en esta etapa' : `Nada en «${stage.name}»`}
            subtitle={searching ? undefined : 'Desliza para ver otras etapas'}
          />
        }
        ListFooterComponent={
          col?.loadingMore ? <ActivityIndicator color={colors.orange} style={{ marginVertical: 16 }} />
            : items.length > 0 && items.length >= total ? <Text style={styles.end}>{total} {total === 1 ? 'lead' : 'leads'}</Text> : null
        }
      />
    </View>
  );
});

const styles = StyleSheet.create({
  header: { backgroundColor: colors.canvas, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  titleRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16 },
  title: { fontSize: 28, fontWeight: '800', color: colors.navy },
  pipeRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 1 },
  pipeName: { fontSize: 15, fontWeight: '600', color: colors.orangeDark, maxWidth: 260 },
  iconBtn: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  searchBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginTop: 10, paddingHorizontal: 14,
    height: 46, borderRadius: radius.md, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
  },
  searchInput: { flex: 1, fontSize: 16, color: colors.text, paddingVertical: 0 },
  tabs: { paddingHorizontal: 12, paddingVertical: 10, gap: 8 },
  tab: {
    flexDirection: 'row', alignItems: 'center', gap: 6, height: 40, paddingHorizontal: 14, borderRadius: radius.pill,
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, maxWidth: 220,
  },
  tabActive: { backgroundColor: colors.navy, borderColor: colors.navy },
  tabDot: { width: 8, height: 8, borderRadius: 4 },
  tabText: { fontSize: 14, fontWeight: '600', color: colors.text, flexShrink: 1 },
  tabTextActive: { color: '#fff' },
  tabCount: { fontSize: 12, fontWeight: '700', color: colors.muted, backgroundColor: '#F3F0EA', paddingHorizontal: 7, paddingVertical: 1, borderRadius: radius.pill, overflow: 'hidden' },
  tabCountActive: { color: colors.navy, backgroundColor: colors.orange },
  retry: { alignSelf: 'center', paddingHorizontal: 24, height: 48, justifyContent: 'center', borderRadius: radius.pill, backgroundColor: colors.navy },
  retryText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  sheetRow: { flexDirection: 'row', alignItems: 'center', minHeight: 56, paddingHorizontal: 20 },
  sheetText: { flex: 1, fontSize: 16, color: colors.text },
  end: { textAlign: 'center', color: colors.faint, fontSize: 13, marginTop: 8 },
});
