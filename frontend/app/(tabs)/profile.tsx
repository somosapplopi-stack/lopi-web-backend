import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, ScrollView, StyleSheet, Text, TextInput, View, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { GradientButton } from '@/src/components/GradientButton';
import { ParcheCard, type ParcheCardData } from '@/src/components/ParcheCard';
import { api, uploadImage } from '@/src/lib/api';
import { useAuth } from '@/src/lib/auth';
import { CATEGORY_MAP, CITIES } from '@/src/lib/categories';
import { theme } from '@/src/theme';

const AVATAR_FALLBACK = 'https://ui-avatars.com/api/?background=3B4CF6&color=fff&name=';

export default function Profile() {
  const router = useRouter();
  const { user, logout, updateProfile } = useAuth();
  const [tab, setTab] = useState<'created' | 'joined'>('created');
  const [items, setItems] = useState<ParcheCardData[]>([]);
  const [loading, setLoading] = useState(true);
  const [edit, setEdit] = useState(false);
  const [editName, setEditName] = useState(user?.name || '');
  const [editCity, setEditCity] = useState(user?.city || CITIES[0]);
  const [editBio, setEditBio] = useState(user?.bio || '');
  const [saving, setSaving] = useState(false);
  const [stats, setStats] = useState<{ created_count: number; joined_count: number }>({ created_count: 0, joined_count: 0 });

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const params = tab === 'created' ? 'only_mine=true' : 'joined=true';
      const [data, u] = await Promise.all([
        api<ParcheCardData[]>(`/parches/feed?${params}`),
        api<{ created_count: number; joined_count: number }>(`/users/${user.id}`),
      ]);
      setItems(data);
      setStats({ created_count: u.created_count, joined_count: u.joined_count });
    } catch (e) { console.warn(e); }
    finally { setLoading(false); }
  }, [tab, user]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function pickAndUpload() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.7 });
    if (res.canceled || !res.assets[0]) return;
    setSaving(true);
    try {
      const url = await uploadImage(res.assets[0].uri);
      await updateProfile({ photo: url });
    } catch (e) { console.warn(e); }
    finally { setSaving(false); }
  }

  async function saveEdit() {
    setSaving(true);
    try {
      await updateProfile({ name: editName.trim(), city: editCity, bio: editBio.trim() });
      setEdit(false);
    } catch (e) { console.warn(e); }
    finally { setSaving(false); }
  }

  if (!user) return null;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <FlatList
        testID="profile-parches"
        data={items}
        keyExtractor={(x) => x.id}
        renderItem={({ item }) => <ParcheCard parche={item} />}
        contentContainerStyle={{ paddingBottom: 40 }}
        ListEmptyComponent={loading ? null : <Text style={styles.empty}>Sin parches aquí.</Text>}
        ListHeaderComponent={
          <View>
            <LinearGradient colors={[theme.colors.brandPrimary, theme.colors.brandSecondary]} style={styles.hero}>
              <View style={styles.actionsTop}>
                <Pressable testID="edit-profile-btn" onPress={() => setEdit(true)} hitSlop={8}>
                  <Ionicons name="create-outline" size={22} color="#fff" />
                </Pressable>
                <View style={{ flexDirection: 'row', gap: 12 }}>
                  <Pressable testID="profile-friends-btn" onPress={() => router.push('/friends')} hitSlop={8}>
                    <Ionicons name="people-outline" size={22} color="#fff" />
                  </Pressable>
                  {user.role === 'super_admin' && (
                    <Pressable testID="profile-admin-btn" onPress={() => router.push('/admin')} hitSlop={8}>
                      <Ionicons name="shield-checkmark-outline" size={22} color="#fff" />
                    </Pressable>
                  )}
                  <Pressable testID="logout-btn" onPress={logout} hitSlop={8}>
                    <Ionicons name="log-out-outline" size={24} color="#fff" />
                  </Pressable>
                </View>
              </View>
              <Pressable onPress={pickAndUpload} testID="change-avatar-btn">
                <Image source={{ uri: user.photo || AVATAR_FALLBACK + encodeURIComponent(user.name) }} style={styles.avatar} contentFit="cover" />
              </Pressable>
              <Text style={styles.name}>{user.name}</Text>
              <Text style={styles.username}>@{user.username}</Text>
              <Text style={styles.city}>📍 {user.city}</Text>
            </LinearGradient>

            <View style={styles.statsRow}>
              <View style={styles.statBlock}><Text style={styles.statNum}>{user.friends_count}</Text><Text style={styles.statLbl}>Amigos</Text></View>
              <View style={styles.statBlock}><Text style={styles.statNum}>{user.followers_count}</Text><Text style={styles.statLbl}>Seguidores</Text></View>
              <View style={styles.statBlock}><Text style={styles.statNum}>{user.following_count}</Text><Text style={styles.statLbl}>Siguiendo</Text></View>
              <View style={styles.statBlock}><Text style={styles.statNum}>{stats.created_count + stats.joined_count}</Text><Text style={styles.statLbl}>Parches</Text></View>
            </View>

            {user.bio ? <Text style={styles.bio}>{user.bio}</Text> : null}

            <Text style={styles.sectionTitle}>Intereses</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: theme.spacing.lg, gap: theme.spacing.md, paddingBottom: 4 }}>
              {user.interests.map((slug) => {
                const c = CATEGORY_MAP[slug];
                if (!c) return null;
                return (
                  <View key={slug} style={styles.interestChip}>
                    <LinearGradient colors={[theme.colors.brandPrimary, theme.colors.brandSecondary]} style={styles.interestCircle}>
                      <Text style={{ fontSize: 26 }}>{c.emoji}</Text>
                    </LinearGradient>
                    <Text style={styles.interestName} numberOfLines={1}>{c.name}</Text>
                  </View>
                );
              })}
            </ScrollView>

            <View style={styles.tabs}>
              <Pressable testID="profile-tab-created" onPress={() => setTab('created')} style={[styles.tab, tab === 'created' && styles.tabActive]}>
                <Text style={[styles.tabText, tab === 'created' && styles.tabTextActive]}>Creados ({stats.created_count})</Text>
              </Pressable>
              <Pressable testID="profile-tab-joined" onPress={() => setTab('joined')} style={[styles.tab, tab === 'joined' && styles.tabActive]}>
                <Text style={[styles.tabText, tab === 'joined' && styles.tabTextActive]}>Unidos ({stats.joined_count})</Text>
              </Pressable>
            </View>
            {loading ? <ActivityIndicator style={{ marginTop: 16 }} color={theme.colors.brandPrimary} /> : null}
          </View>
        }
      />

      <Modal visible={edit} animationType="slide" transparent onRequestClose={() => setEdit(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Editar perfil</Text>
            <TextInput testID="edit-name-input" value={editName} onChangeText={setEditName} placeholder="Nombre" placeholderTextColor={theme.colors.muted} style={styles.input} />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 4 }}>
              {CITIES.map((c) => (
                <Pressable key={c} testID={`edit-city-${c}`} onPress={() => setEditCity(c)} style={[styles.chip, editCity === c && styles.chipActive]}>
                  <Text style={[styles.chipText, editCity === c && styles.chipTextActive]}>{c}</Text>
                </Pressable>
              ))}
            </ScrollView>
            <TextInput testID="edit-bio-input" value={editBio} onChangeText={setEditBio} placeholder="Bio" placeholderTextColor={theme.colors.muted} multiline style={[styles.input, { height: 80, textAlignVertical: 'top' }]} />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Pressable onPress={() => setEdit(false)} style={[styles.modalBtn, { backgroundColor: theme.colors.surfaceSecondary }]}>
                <Text style={{ color: theme.colors.onSurface, fontWeight: '800' }}>Cancelar</Text>
              </Pressable>
              <View style={{ flex: 1 }}>
                <GradientButton testID="edit-save-btn" title="Guardar" onPress={saveEdit} loading={saving} />
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.surfaceSecondary },
  hero: { alignItems: 'center', paddingTop: theme.spacing.md, paddingBottom: theme.spacing.xl, paddingHorizontal: theme.spacing.lg },
  actionsTop: { position: 'absolute', top: theme.spacing.md, right: theme.spacing.lg, left: theme.spacing.lg, flexDirection: 'row', justifyContent: 'space-between' },
  avatar: { width: 110, height: 110, borderRadius: 999, borderWidth: 4, borderColor: '#fff', marginTop: 12 },
  name: { fontSize: 22, fontWeight: '900', color: '#fff', marginTop: 10 },
  username: { fontSize: 14, color: 'rgba(255,255,255,0.9)', fontWeight: '600' },
  city: { fontSize: 13, color: 'rgba(255,255,255,0.95)', marginTop: 4 },
  statsRow: { flexDirection: 'row', paddingHorizontal: theme.spacing.lg, paddingVertical: theme.spacing.md, backgroundColor: '#fff', justifyContent: 'space-between' },
  statBlock: { alignItems: 'center', flex: 1 },
  statNum: { fontSize: 18, fontWeight: '900', color: theme.colors.onSurface },
  statLbl: { fontSize: 11, color: theme.colors.onSurfaceSecondary, fontWeight: '700' },
  bio: { paddingHorizontal: theme.spacing.lg, paddingVertical: 8, fontSize: 14, color: theme.colors.onSurface, backgroundColor: '#fff' },
  sectionTitle: { fontSize: 16, fontWeight: '900', color: theme.colors.onSurface, paddingHorizontal: theme.spacing.lg, marginTop: theme.spacing.md, marginBottom: 8 },
  interestChip: { alignItems: 'center', width: 84 },
  interestCircle: { width: 68, height: 68, borderRadius: 999, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: theme.colors.brandPrimary, backgroundColor: '#fff' },
  interestName: { marginTop: 6, fontSize: 12, fontWeight: '700', color: theme.colors.onSurface, textAlign: 'center' },
  tabs: { flexDirection: 'row', gap: 8, paddingHorizontal: theme.spacing.lg, marginTop: theme.spacing.md, marginBottom: theme.spacing.sm },
  tab: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: theme.radius.pill, backgroundColor: '#fff', borderBottomWidth: 3, borderBottomColor: 'transparent' },
  tabActive: { borderBottomColor: theme.colors.brandPrimary },
  tabText: { fontSize: 13, fontWeight: '700', color: theme.colors.onSurfaceSecondary },
  tabTextActive: { color: theme.colors.brandPrimary },
  empty: { textAlign: 'center', color: theme.colors.onSurfaceSecondary, padding: 24 },
  input: { borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceSecondary, borderRadius: theme.radius.md, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: theme.colors.onSurface },
  chip: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: theme.radius.pill, borderWidth: 1.5, borderColor: theme.colors.border, backgroundColor: '#fff', flexShrink: 0 },
  chipActive: { borderColor: theme.colors.brandPrimary, backgroundColor: theme.colors.surfaceTertiary },
  chipText: { fontSize: 13, color: theme.colors.onSurfaceSecondary, fontWeight: '700' },
  chipTextActive: { color: theme.colors.brandPrimary },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: '#fff', padding: theme.spacing.lg, gap: 10, borderTopLeftRadius: theme.radius.lg, borderTopRightRadius: theme.radius.lg },
  modalTitle: { fontSize: 18, fontWeight: '900', color: theme.colors.onSurface },
  modalBtn: { flex: 1, paddingVertical: 14, alignItems: 'center', borderRadius: theme.radius.pill },
});
