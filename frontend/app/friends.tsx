import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator, FlatList, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { api } from '@/src/lib/api';
import { theme } from '@/src/theme';

const AVATAR_FALLBACK = 'https://ui-avatars.com/api/?background=3B4CF6&color=fff&name=';

type MiniUser = { id: string; name: string; username: string; photo?: string | null; city?: string };
type FriendRow = { friendship_id: string; user: MiniUser; since?: string; created_at?: string };
type SearchRow = MiniUser & { relation: 'none' | 'friends' | 'sent' | 'received' };

type Tab = 'friends' | 'received' | 'sent' | 'search';

export default function Friends() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('friends');
  const [friends, setFriends] = useState<FriendRow[]>([]);
  const [received, setReceived] = useState<FriendRow[]>([]);
  const [sent, setSent] = useState<FriendRow[]>([]);
  const [searchQ, setSearchQ] = useState('');
  const [searchResults, setSearchResults] = useState<SearchRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [f, r, s] = await Promise.all([
        api<FriendRow[]>('/friends'),
        api<FriendRow[]>('/friends/requests/received'),
        api<FriendRow[]>('/friends/requests/sent'),
      ]);
      setFriends(f); setReceived(r); setSent(s);
    } catch (e) { console.warn(e); }
    finally { setLoading(false); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function search(text: string) {
    setSearchQ(text);
    if (text.length < 2) { setSearchResults([]); return; }
    try {
      const res = await api<SearchRow[]>(`/users/search?q=${encodeURIComponent(text)}`);
      setSearchResults(res);
    } catch (e) { console.warn(e); }
  }

  async function sendRequest(userId: string) {
    try {
      await api(`/friends/request/${userId}`, { method: 'POST' });
      await search(searchQ);
      await load();
    } catch (e: any) { console.warn(e.message); }
  }
  async function accept(fid: string) { await api(`/friends/accept/${fid}`, { method: 'POST' }); await load(); }
  async function reject(fid: string) { await api(`/friends/reject/${fid}`, { method: 'POST' }); await load(); }
  async function remove(userId: string) { await api(`/friends/${userId}`, { method: 'DELETE' }); await load(); }

  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: 'friends', label: 'Amigos', count: friends.length },
    { key: 'received', label: 'Recibidas', count: received.length },
    { key: 'sent', label: 'Enviadas', count: sent.length },
    { key: 'search', label: 'Buscar' },
  ];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.surface }} edges={['top']}>
      <View style={styles.header}>
        <Pressable testID="friends-back-btn" onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="chevron-back" size={26} color={theme.colors.onSurface} />
        </Pressable>
        <Text style={styles.title}>Amigos</Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow} style={styles.chipsScroll}>
        {tabs.map((t) => (
          <Pressable key={t.key} testID={`friends-tab-${t.key}`} onPress={() => setTab(t.key)} style={[styles.chip, tab === t.key && styles.chipActive]}>
            <Text style={[styles.chipText, tab === t.key && styles.chipTextActive]}>
              {t.label}{typeof t.count === 'number' ? ` (${t.count})` : ''}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {tab === 'search' && (
        <View style={styles.searchBox}>
          <Ionicons name="search" size={18} color={theme.colors.muted} />
          <TextInput
            testID="friends-search-input"
            placeholder="Buscar usuarios por nombre o @user"
            placeholderTextColor={theme.colors.muted}
            value={searchQ}
            onChangeText={search}
            style={{ flex: 1, fontSize: 15, color: theme.colors.onSurface }}
            autoCapitalize="none"
          />
        </View>
      )}

      {loading && tab !== 'search' ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={theme.colors.brandPrimary} />
      ) : (
        <FlatList
          testID={`friends-list-${tab}`}
          data={
            tab === 'friends' ? friends :
            tab === 'received' ? received :
            tab === 'sent' ? sent :
            searchResults as any
          }
          keyExtractor={(item: any) => item.friendship_id || item.id}
          contentContainerStyle={{ padding: theme.spacing.md, gap: 8, paddingBottom: 40 }}
          renderItem={({ item }: any) => {
            if (tab === 'search') {
              const s: SearchRow = item;
              return (
                <View style={styles.row}>
                  <Image source={{ uri: s.photo || AVATAR_FALLBACK + encodeURIComponent(s.name) }} style={styles.avatar} contentFit="cover" />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.name}>{s.name}</Text>
                    <Text style={styles.sub}>@{s.username}{s.city ? ` · ${s.city}` : ''}</Text>
                  </View>
                  {s.relation === 'friends' ? (
                    <View style={styles.pillGreen}><Text style={styles.pillTextGreen}>✓ Amigos</Text></View>
                  ) : s.relation === 'sent' ? (
                    <View style={styles.pillGray}><Text style={styles.pillTextGray}>Enviada</Text></View>
                  ) : s.relation === 'received' ? (
                    <View style={styles.pillGray}><Text style={styles.pillTextGray}>Pendiente</Text></View>
                  ) : (
                    <Pressable testID={`send-req-${s.id}`} onPress={() => sendRequest(s.id)} style={styles.pillBlue}>
                      <Ionicons name="person-add" size={14} color="#fff" />
                      <Text style={styles.pillTextBlue}>Agregar</Text>
                    </Pressable>
                  )}
                </View>
              );
            }
            const row: FriendRow = item;
            return (
              <View style={styles.row}>
                <Image source={{ uri: row.user.photo || AVATAR_FALLBACK + encodeURIComponent(row.user.name) }} style={styles.avatar} contentFit="cover" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{row.user.name}</Text>
                  <Text style={styles.sub}>@{row.user.username}{row.user.city ? ` · ${row.user.city}` : ''}</Text>
                </View>
                {tab === 'friends' && (
                  <Pressable testID={`remove-friend-${row.user.id}`} onPress={() => remove(row.user.id)} style={styles.pillGray}>
                    <Text style={styles.pillTextGray}>Eliminar</Text>
                  </Pressable>
                )}
                {tab === 'received' && (
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    <Pressable testID={`reject-${row.friendship_id}`} onPress={() => reject(row.friendship_id)} style={styles.pillGray}><Text style={styles.pillTextGray}>Rechazar</Text></Pressable>
                    <Pressable testID={`accept-${row.friendship_id}`} onPress={() => accept(row.friendship_id)} style={styles.pillBlue}><Text style={styles.pillTextBlue}>Aceptar</Text></Pressable>
                  </View>
                )}
                {tab === 'sent' && (
                  <View style={styles.pillGray}><Text style={styles.pillTextGray}>Pendiente</Text></View>
                )}
              </View>
            );
          }}
          ListEmptyComponent={
            <Text style={styles.empty}>
              {tab === 'search' ? (searchQ ? 'Sin resultados.' : 'Empieza a escribir para buscar.') : 'Sin registros.'}
            </Text>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: theme.spacing.lg, paddingVertical: theme.spacing.md, borderBottomWidth: 1, borderBottomColor: theme.colors.divider },
  title: { fontSize: 18, fontWeight: '900', color: theme.colors.onSurface },
  chipsScroll: { maxHeight: 56, backgroundColor: '#fff' },
  chipsRow: { gap: 8, paddingHorizontal: theme.spacing.lg, paddingVertical: 10 },
  chip: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: theme.radius.pill, borderWidth: 1.5, borderColor: theme.colors.border, backgroundColor: '#fff', flexShrink: 0, height: 36, alignItems: 'center', justifyContent: 'center' },
  chipActive: { borderColor: theme.colors.brandPrimary, backgroundColor: theme.colors.surfaceTertiary },
  chipText: { fontSize: 13, color: theme.colors.onSurfaceSecondary, fontWeight: '700' },
  chipTextActive: { color: theme.colors.brandPrimary },
  searchBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.colors.surfaceSecondary, borderRadius: theme.radius.pill, paddingHorizontal: 14, paddingVertical: 10, gap: 8, marginHorizontal: theme.spacing.lg, marginBottom: theme.spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#fff', padding: 10, borderRadius: theme.radius.md, ...theme.shadow.card },
  avatar: { width: 44, height: 44, borderRadius: 999, backgroundColor: theme.colors.surfaceSecondary },
  name: { fontSize: 14, fontWeight: '800', color: theme.colors.onSurface },
  sub: { fontSize: 12, color: theme.colors.onSurfaceSecondary, marginTop: 2 },
  pillBlue: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: theme.colors.brandPrimary, paddingVertical: 6, paddingHorizontal: 10, borderRadius: theme.radius.pill },
  pillTextBlue: { color: '#fff', fontWeight: '800', fontSize: 12 },
  pillGray: { backgroundColor: theme.colors.surfaceSecondary, paddingVertical: 6, paddingHorizontal: 10, borderRadius: theme.radius.pill, borderWidth: 1, borderColor: theme.colors.border },
  pillTextGray: { color: theme.colors.onSurfaceSecondary, fontWeight: '700', fontSize: 12 },
  pillGreen: { backgroundColor: '#DCFCE7', paddingVertical: 6, paddingHorizontal: 10, borderRadius: theme.radius.pill },
  pillTextGreen: { color: '#166534', fontWeight: '800', fontSize: 12 },
  empty: { textAlign: 'center', color: theme.colors.onSurfaceSecondary, padding: 40 },
});
