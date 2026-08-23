import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { GradientButton } from '@/src/components/GradientButton';
import { api } from '@/src/lib/api';
import { CATEGORY_MAP } from '@/src/lib/categories';
import { theme } from '@/src/theme';

const AVATAR_FALLBACK = 'https://ui-avatars.com/api/?background=3B4CF6&color=fff&name=';

export default function ParcheDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [p, setP] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    try {
      setLoading(true);
      const data = await api<any>(`/parches/${id}`);
      setP(data);
    } catch (e: any) { setErr(e.message); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [id]);

  async function toggleJoin() {
    if (!p) return;
    setBusy(true); setErr(null);
    try {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      const action = p.joined ? 'leave' : 'join';
      const updated = await api<any>(`/parches/${p.id}/${action}`, { method: 'POST' });
      setP(updated);
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  }

  async function toggle(action: 'like' | 'save') {
    if (!p) return;
    try {
      const updated = await api<any>(`/parches/${p.id}/${action}`, { method: 'POST' });
      setP(updated);
    } catch (e) { console.warn(e); }
  }

  if (loading) return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' }}>
      <ActivityIndicator size="large" color={theme.colors.brandPrimary} />
    </View>
  );
  if (!p) return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#fff', padding: 20 }}>
      <Text style={{ color: theme.colors.error }}>Parche no encontrado.</Text>
    </SafeAreaView>
  );

  const cat = CATEGORY_MAP[p.category];
  const isFull = p.participants_count >= p.capacity;

  return (
    <View style={{ flex: 1, backgroundColor: '#fff' }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 140 }}>
        <View style={styles.heroBox}>
          {p.photo ? (
            <Image source={{ uri: p.photo }} style={styles.hero} contentFit="cover" />
          ) : (
            <LinearGradient colors={[theme.colors.brandPrimary, theme.colors.brandSecondary]} style={styles.hero}>
              <Text style={{ fontSize: 84 }}>{cat?.emoji || '✨'}</Text>
            </LinearGradient>
          )}
          <LinearGradient colors={['rgba(0,0,0,0.5)', 'transparent']} style={styles.heroScrimTop} />
          <SafeAreaView style={styles.heroActions} edges={['top']}>
            <Pressable testID="detail-back-btn" onPress={() => router.back()} style={styles.iconBtn}>
              <Ionicons name="chevron-back" size={24} color="#fff" />
            </Pressable>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Pressable testID="detail-like-btn" onPress={() => toggle('like')} style={styles.iconBtn}>
                <Ionicons name={p.liked ? 'heart' : 'heart-outline'} size={22} color={p.liked ? '#FF6B6B' : '#fff'} />
              </Pressable>
              <Pressable testID="detail-save-btn" onPress={() => toggle('save')} style={styles.iconBtn}>
                <Ionicons name={p.saved ? 'bookmark' : 'bookmark-outline'} size={22} color="#fff" />
              </Pressable>
            </View>
          </SafeAreaView>
        </View>

        <View style={styles.content}>
          <View style={styles.catRow}>
            <View style={styles.catPill}>
              <Text style={styles.catPillText}>{cat?.emoji} {cat?.name || p.category}</Text>
            </View>
          </View>
          <Text style={styles.title}>{p.title}</Text>

          <View style={styles.creatorRow}>
            <Image source={{ uri: p.creator.photo || AVATAR_FALLBACK + encodeURIComponent(p.creator.name) }} style={styles.creatorAvatar} contentFit="cover" />
            <View>
              <Text style={styles.creatorLabel}>Organizado por</Text>
              <Text style={styles.creatorName}>{p.creator.name} · @{p.creator.username}</Text>
            </View>
          </View>

          <View style={styles.infoGrid}>
            <InfoTile icon="calendar-outline" label="Fecha" value={`${p.date}`} />
            <InfoTile icon="time-outline" label="Hora" value={`${p.time_start}${p.time_end ? ` – ${p.time_end}` : ''}`} />
            <InfoTile icon="location-outline" label="Lugar" value={`${p.location || '—'}, ${p.city}`} />
            <InfoTile icon="people-outline" label="Cupos" value={`${p.participants_count}/${p.capacity}`} />
          </View>

          {p.description ? (
            <>
              <Text style={styles.sectionTitle}>Descripción</Text>
              <Text style={styles.description}>{p.description}</Text>
            </>
          ) : null}

          <View style={styles.metaRow}>
            <View style={styles.metaItem}><Ionicons name="heart" size={16} color="#E53E3E" /><Text style={styles.metaText}>{p.likes_count} me gusta</Text></View>
            <View style={styles.metaItem}><Ionicons name="people" size={16} color={theme.colors.brandPrimary} /><Text style={styles.metaText}>{p.participants_count} participando</Text></View>
          </View>

          {err ? <Text style={{ color: theme.colors.error, marginTop: 8 }} testID="detail-error">{err}</Text> : null}
        </View>
      </ScrollView>

      <SafeAreaView style={styles.stickyBottom} edges={['bottom']}>
        <GradientButton
          testID="join-parche-btn"
          title={p.joined ? 'Salir del parche' : isFull ? 'Parche lleno' : 'Unirme al parche'}
          onPress={toggleJoin}
          loading={busy}
          disabled={!p.joined && isFull}
        />
      </SafeAreaView>
    </View>
  );
}

function InfoTile({ icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <View style={styles.infoTile}>
      <Ionicons name={icon} size={18} color={theme.colors.brandPrimary} />
      <View>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={styles.infoValue} numberOfLines={2}>{value}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  heroBox: { position: 'relative' },
  hero: { width: '100%', height: 320, alignItems: 'center', justifyContent: 'center' },
  heroScrimTop: { position: 'absolute', top: 0, left: 0, right: 0, height: 120 },
  heroActions: { position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: theme.spacing.md, flexDirection: 'row', justifyContent: 'space-between', paddingTop: 4 },
  iconBtn: { width: 40, height: 40, borderRadius: 999, backgroundColor: 'rgba(0,0,0,0.35)', alignItems: 'center', justifyContent: 'center' },
  content: { padding: theme.spacing.lg, marginTop: -24, backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24 },
  catRow: { flexDirection: 'row' },
  catPill: { backgroundColor: theme.colors.surfaceTertiary, paddingVertical: 6, paddingHorizontal: 12, borderRadius: theme.radius.pill },
  catPillText: { color: theme.colors.brandPrimary, fontWeight: '800', fontSize: 12 },
  title: { fontSize: 26, fontWeight: '900', color: theme.colors.onSurface, marginTop: 8 },
  creatorRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: theme.spacing.md, paddingVertical: theme.spacing.md, borderBottomWidth: 1, borderBottomColor: theme.colors.divider },
  creatorAvatar: { width: 46, height: 46, borderRadius: 999 },
  creatorLabel: { fontSize: 11, color: theme.colors.onSurfaceSecondary, fontWeight: '700' },
  creatorName: { fontSize: 14, color: theme.colors.onSurface, fontWeight: '800' },
  infoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.md, marginTop: theme.spacing.md },
  infoTile: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, width: '47%', backgroundColor: theme.colors.surfaceSecondary, padding: 12, borderRadius: theme.radius.md },
  infoLabel: { fontSize: 11, color: theme.colors.onSurfaceSecondary, fontWeight: '700' },
  infoValue: { fontSize: 14, color: theme.colors.onSurface, fontWeight: '700', marginTop: 2 },
  sectionTitle: { fontSize: 16, fontWeight: '900', color: theme.colors.onSurface, marginTop: theme.spacing.lg, marginBottom: 6 },
  description: { fontSize: 14, color: theme.colors.onSurfaceSecondary, lineHeight: 22 },
  metaRow: { flexDirection: 'row', gap: 16, marginTop: theme.spacing.md },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontSize: 13, color: theme.colors.onSurfaceSecondary, fontWeight: '700' },
  stickyBottom: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: theme.spacing.lg, paddingTop: 12, backgroundColor: 'rgba(255,255,255,0.98)', borderTopWidth: 1, borderTopColor: theme.colors.divider },
});
