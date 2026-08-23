import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { api } from '@/src/lib/api';
import { theme } from '@/src/theme';

const AVATAR_FALLBACK = 'https://ui-avatars.com/api/?background=3B4CF6&color=fff&name=';

type Notif = {
  id: string;
  kind: string;
  title: string;
  body: string;
  data: Record<string, any>;
  read: boolean;
  created_at: string;
};

function timeAgo(iso: string): string {
  try {
    const diff = (Date.now() - new Date(iso).getTime()) / 1000;
    if (diff < 60) return 'ahora';
    if (diff < 3600) return `hace ${Math.floor(diff / 60)}m`;
    if (diff < 86400) return `hace ${Math.floor(diff / 3600)}h`;
    return `hace ${Math.floor(diff / 86400)}d`;
  } catch { return ''; }
}

const ICONS: Record<string, any> = {
  comment: 'chatbubble', chat: 'chatbubbles', join: 'people', friend_request: 'person-add', friend_accept: 'person', default: 'notifications',
};

export default function Notifications() {
  const router = useRouter();
  const [items, setItems] = useState<Notif[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const data = await api<{ items: Notif[]; unread: number }>('/notifications');
      setItems(data.items);
      // mark all read
      if (data.unread > 0) api('/notifications/read-all', { method: 'POST' }).catch(() => {});
    } catch (e) { console.warn(e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  function onPress(n: Notif) {
    const pid = n.data?.parche_id;
    if (pid) router.push(`/parche/${pid}`);
    else if (n.kind === 'friend_request' || n.kind === 'friend_accept') router.push('/friends');
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.surface }} edges={['top']}>
      <View style={styles.header}>
        <Pressable testID="notif-back-btn" onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="chevron-back" size={26} color={theme.colors.onSurface} />
        </Pressable>
        <Text style={styles.title}>Notificaciones</Text>
        <View style={{ width: 26 }} />
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={theme.colors.brandPrimary} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(x) => x.id}
          renderItem={({ item }) => (
            <Pressable testID={`notif-item-${item.id}`} onPress={() => onPress(item)} style={[styles.row, !item.read && styles.unread]}>
              <LinearGradient colors={[theme.colors.brandPrimary, theme.colors.brandSecondary]} style={styles.iconWrap}>
                <Ionicons name={ICONS[item.kind] || ICONS.default} size={18} color="#fff" />
              </LinearGradient>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>{item.title}</Text>
                <Text style={styles.rowBody} numberOfLines={2}>{item.body}</Text>
                <Text style={styles.rowTime}>{timeAgo(item.created_at)}</Text>
              </View>
              {!item.read && <View style={styles.dot} />}
            </Pressable>
          )}
          ListEmptyComponent={<Text style={styles.empty}>Sin notificaciones aún.</Text>}
          contentContainerStyle={{ paddingBottom: 40 }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: theme.spacing.lg, paddingVertical: theme.spacing.md, borderBottomWidth: 1, borderBottomColor: theme.colors.divider },
  title: { fontSize: 18, fontWeight: '900', color: theme.colors.onSurface },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: theme.spacing.lg, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: theme.colors.divider },
  unread: { backgroundColor: theme.colors.surfaceTertiary },
  iconWrap: { width: 40, height: 40, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontSize: 14, fontWeight: '800', color: theme.colors.onSurface },
  rowBody: { fontSize: 13, color: theme.colors.onSurfaceSecondary, marginTop: 2 },
  rowTime: { fontSize: 11, color: theme.colors.muted, marginTop: 4 },
  dot: { width: 8, height: 8, borderRadius: 999, backgroundColor: theme.colors.brandPrimary },
  empty: { textAlign: 'center', color: theme.colors.onSurfaceSecondary, padding: 40 },
});
