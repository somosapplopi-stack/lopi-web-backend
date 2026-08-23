import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ParcheCard, type ParcheCardData } from '@/src/components/ParcheCard';
import { api } from '@/src/lib/api';
import { theme } from '@/src/theme';

type Tab = 'joined' | 'created' | 'saved';

export default function MyParches() {
  const [tab, setTab] = useState<Tab>('joined');
  const [items, setItems] = useState<ParcheCardData[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = tab === 'joined' ? 'joined=true' : tab === 'created' ? 'only_mine=true' : 'saved=true';
      const data = await api<ParcheCardData[]>(`/parches/feed?${params}`);
      setItems(data);
    } catch (e) { console.warn(e); }
    finally { setLoading(false); }
  }, [tab]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const tabs: { key: Tab; label: string }[] = [
    { key: 'joined', label: 'Uniéndome' },
    { key: 'created', label: 'Creados' },
    { key: 'saved', label: 'Guardados' },
  ];

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.h1}>Mis Parches</Text>
        <View style={styles.tabs}>
          {tabs.map((t) => (
            <Pressable key={t.key} testID={`myparches-tab-${t.key}`} onPress={() => setTab(t.key)} style={[styles.tab, tab === t.key && styles.tabActive]}>
              <Text style={[styles.tabText, tab === t.key && styles.tabTextActive]}>{t.label}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={theme.colors.brandPrimary} />
        </View>
      ) : (
        <FlatList
          testID="myparches-list"
          data={items}
          keyExtractor={(x) => x.id}
          renderItem={({ item }) => <ParcheCard parche={item} onChange={(u) => setItems((prev) => prev.map((p) => (p.id === u.id ? u : p)))} />}
          contentContainerStyle={{ paddingVertical: theme.spacing.md, paddingBottom: 40 }}
          ListEmptyComponent={<Text style={styles.empty}>Nada aquí todavía. Únete o crea un parche.</Text>}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.surfaceSecondary },
  header: { backgroundColor: '#fff', paddingHorizontal: theme.spacing.lg, paddingTop: 4, paddingBottom: 8, gap: 10 },
  h1: { fontSize: 24, fontWeight: '900', color: theme.colors.onSurface },
  tabs: { flexDirection: 'row', gap: 8 },
  tab: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: theme.radius.pill, backgroundColor: theme.colors.surfaceSecondary, borderWidth: 1.5, borderColor: 'transparent' },
  tabActive: { borderColor: theme.colors.brandPrimary, backgroundColor: theme.colors.surfaceTertiary },
  tabText: { fontSize: 13, fontWeight: '700', color: theme.colors.onSurfaceSecondary },
  tabTextActive: { color: theme.colors.brandPrimary },
  empty: { textAlign: 'center', padding: 40, color: theme.colors.onSurfaceSecondary },
});
