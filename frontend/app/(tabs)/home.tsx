import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { LopiLogo } from '@/src/components/LopiLogo';
import { ParcheCard, type ParcheCardData } from '@/src/components/ParcheCard';
import { api } from '@/src/lib/api';
import { useAuth } from '@/src/lib/auth';
import { theme } from '@/src/theme';

export default function Home() {
  const { user } = useAuth();
  const [parches, setParches] = useState<ParcheCardData[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    try {
      const data = await api<ParcheCardData[]>('/parches/feed');
      setParches(data);
    } catch (e: any) { setErr(e.message || 'Error al cargar'); }
  }, []);

  useFocusEffect(useCallback(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]));

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <LopiLogo size={34} />
        <Text style={styles.hi}>Hola, {user?.name?.split(' ')[0] || ''} 👋</Text>
        <Text style={styles.tagline}>¿Qué hay pa&apos; hacer hoy?</Text>
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={theme.colors.brandPrimary} />
        </View>
      ) : (
        <FlatList
          testID="home-feed"
          data={parches}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <ParcheCard
              parche={item}
              onChange={(updated) => setParches((prev) => prev.map((p) => (p.id === updated.id ? updated : p)))}
            />
          )}
          contentContainerStyle={{ paddingVertical: theme.spacing.md, paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor={theme.colors.brandPrimary} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyEmoji}>🎉</Text>
              <Text style={styles.emptyTitle}>Aún no hay parches</Text>
              <Text style={styles.emptyText}>Sé el primero en crear uno. Toca el botón +</Text>
              {err ? <Text style={styles.errText}>{err}</Text> : null}
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.surfaceSecondary },
  header: { paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.sm, paddingBottom: theme.spacing.md, backgroundColor: '#fff' },
  hi: { fontSize: 18, fontWeight: '800', marginTop: 8, color: theme.colors.onSurface },
  tagline: { fontSize: 13, color: theme.colors.onSurfaceSecondary, marginTop: 2 },
  empty: { alignItems: 'center', padding: 40 },
  emptyEmoji: { fontSize: 48, marginBottom: 12 },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: theme.colors.onSurface },
  emptyText: { fontSize: 14, color: theme.colors.onSurfaceSecondary, marginTop: 6, textAlign: 'center' },
  errText: { fontSize: 12, color: theme.colors.error, marginTop: 8 },
});
