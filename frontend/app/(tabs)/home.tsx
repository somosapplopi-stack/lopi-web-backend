import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { LopiLogo } from '@/src/components/LopiLogo';
import { ParcheCard, type ParcheCardData } from '@/src/components/ParcheCard';
import { api } from '@/src/lib/api';
import { useAuth } from '@/src/lib/auth';
import { theme } from '@/src/theme';

export default function Home() {
  const { user } = useAuth();
  const router = useRouter();
  const [parches, setParches] = useState<ParcheCardData[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [unread, setUnread] = useState(0);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    try {
      const [data, notif] = await Promise.all([
        api<ParcheCardData[]>('/parches/feed'),
        api<{ unread: number }>('/notifications').catch(() => ({ unread: 0 })),
      ]);
      setParches(data);
      setUnread(notif.unread || 0);
    } catch (e: any) { setErr(e.message || 'Error al cargar'); }
  }, []);

  useFocusEffect(useCallback(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]));

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <LopiLogo size={34} />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Pressable testID="home-friends-btn" onPress={() => router.push('/friends')} style={styles.iconBtn}>
              <Ionicons name="people" size={22} color={theme.colors.brandPrimary} />
            </Pressable>
            <Pressable testID="home-notif-btn" onPress={() => router.push('/notifications')} style={styles.iconBtn}>
              <Ionicons name="notifications" size={22} color={theme.colors.brandPrimary} />
              {unread > 0 && <View style={styles.dot}><Text style={styles.dotText}>{unread > 9 ? '9+' : unread}</Text></View>}
            </Pressable>
          </View>
        </View>
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
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  iconBtn: { width: 40, height: 40, borderRadius: 999, backgroundColor: theme.colors.surfaceTertiary, alignItems: 'center', justifyContent: 'center' },
  dot: { position: 'absolute', top: -2, right: -2, minWidth: 18, height: 18, borderRadius: 999, backgroundColor: theme.colors.error, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4, borderWidth: 2, borderColor: '#fff' },
  dotText: { color: '#fff', fontSize: 10, fontWeight: '900' },
  hi: { fontSize: 18, fontWeight: '800', marginTop: 8, color: theme.colors.onSurface },
  tagline: { fontSize: 13, color: theme.colors.onSurfaceSecondary, marginTop: 2 },
  empty: { alignItems: 'center', padding: 40 },
  emptyEmoji: { fontSize: 48, marginBottom: 12 },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: theme.colors.onSurface },
  emptyText: { fontSize: 14, color: theme.colors.onSurfaceSecondary, marginTop: 6, textAlign: 'center' },
  errText: { fontSize: 12, color: theme.colors.error, marginTop: 8 },
});
