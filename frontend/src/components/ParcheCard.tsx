import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { CATEGORY_MAP } from '@/src/lib/categories';
import { theme } from '@/src/theme';
import { api } from '@/src/lib/api';
import * as Haptics from 'expo-haptics';
import { useState } from 'react';

export type ParcheCardData = {
  id: string;
  title: string;
  description?: string;
  category: string;
  city: string;
  location?: string;
  date: string;
  time_start: string;
  capacity: number;
  photo?: string | null;
  creator: { id: string; name: string; username: string; photo?: string | null };
  participants_count: number;
  likes_count: number;
  comments_count: number;
  liked: boolean;
  joined: boolean;
  saved: boolean;
};

const AVATAR_FALLBACK = 'https://ui-avatars.com/api/?background=3B4CF6&color=fff&name=';

function formatDate(dateStr: string, timeStr: string) {
  try {
    const d = new Date(`${dateStr}T${timeStr || '00:00'}:00`);
    const months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
    return `${d.getDate()} ${months[d.getMonth()]}, ${timeStr}`;
  } catch { return `${dateStr} ${timeStr}`; }
}

export function ParcheCard({ parche, onChange }: { parche: ParcheCardData; onChange?: (p: ParcheCardData) => void }) {
  const router = useRouter();
  const [state, setState] = useState(parche);
  const cat = CATEGORY_MAP[state.category];

  async function toggle(action: 'like' | 'save') {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const updated = await api<ParcheCardData>(`/parches/${state.id}/${action}`, { method: 'POST' });
      setState(updated);
      onChange?.(updated);
    } catch (e) { console.warn(e); }
  }

  return (
    <Pressable
      testID={`parche-card-${state.id}`}
      style={styles.card}
      onPress={() => router.push(`/parche/${state.id}`)}
    >
      <View style={styles.headerRow}>
        <Image
          source={{ uri: state.creator.photo || AVATAR_FALLBACK + encodeURIComponent(state.creator.name) }}
          style={styles.avatar}
          contentFit="cover"
        />
        <View style={{ flex: 1, marginLeft: theme.spacing.md }}>
          <Text style={styles.creatorName} numberOfLines={1}>{state.creator.name}</Text>
          <Text style={styles.subCaption} numberOfLines={1}>
            {(cat?.name || state.category)}: {formatDate(state.date, state.time_start)} · {state.location || state.city}
          </Text>
        </View>
        <Pressable testID={`parche-detail-link-${state.id}`} onPress={() => router.push(`/parche/${state.id}`)} hitSlop={8}>
          <Text style={styles.detailLink}>Detalles ›</Text>
        </Pressable>
      </View>

      <View style={styles.heroWrap}>
        {state.photo ? (
          <Image source={{ uri: state.photo }} style={styles.hero} contentFit="cover" />
        ) : (
          <LinearGradient colors={[theme.colors.brandPrimary, theme.colors.brandSecondary]} style={styles.hero}>
            <Text style={styles.heroFallback}>{cat?.emoji || '✨'}</Text>
          </LinearGradient>
        )}
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{cat?.emoji} {cat?.name || state.category}</Text>
        </View>
      </View>

      <Text style={styles.title} numberOfLines={2}>{state.title}</Text>
      {state.description ? <Text style={styles.description} numberOfLines={2}>{state.description}</Text> : null}

      <View style={styles.actionsRow}>
        <Pressable
          testID={`like-btn-${state.id}`}
          style={styles.actionBtn}
          onPress={() => toggle('like')}
          hitSlop={8}
        >
          <Ionicons name={state.liked ? 'heart' : 'heart-outline'} size={20} color={state.liked ? '#E53E3E' : theme.colors.onSurfaceSecondary} />
          <Text style={styles.actionText}>{state.likes_count}</Text>
        </Pressable>
        <View style={styles.actionBtn}>
          <Ionicons name="chatbubble-outline" size={19} color={theme.colors.onSurfaceSecondary} />
          <Text style={styles.actionText}>{state.comments_count}</Text>
        </View>
        <View style={styles.actionBtn}>
          <Ionicons name="people-outline" size={20} color={theme.colors.onSurfaceSecondary} />
          <Text style={styles.actionText}>{state.participants_count}/{state.capacity}</Text>
        </View>
        <View style={{ flex: 1 }} />
        <Pressable testID={`save-btn-${state.id}`} onPress={() => toggle('save')} hitSlop={8}>
          <Ionicons name={state.saved ? 'bookmark' : 'bookmark-outline'} size={22} color={state.saved ? theme.colors.brandPrimary : theme.colors.onSurfaceSecondary} />
        </Pressable>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.surface,
    marginHorizontal: theme.spacing.lg,
    marginBottom: theme.spacing.lg,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.md,
    ...theme.shadow.card,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center' },
  avatar: { width: 40, height: 40, borderRadius: 999, backgroundColor: theme.colors.surfaceSecondary },
  creatorName: { fontSize: 15, fontWeight: '700', color: theme.colors.onSurface },
  subCaption: { fontSize: 12, color: theme.colors.onSurfaceSecondary, marginTop: 2 },
  detailLink: { color: theme.colors.brandPrimary, fontWeight: '600', fontSize: 13 },
  heroWrap: { marginTop: theme.spacing.md, borderRadius: theme.radius.md, overflow: 'hidden' },
  hero: { width: '100%', height: 200, alignItems: 'center', justifyContent: 'center' },
  heroFallback: { fontSize: 72 },
  badge: {
    position: 'absolute', top: 12, left: 12,
    backgroundColor: 'rgba(26,29,36,0.6)',
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: theme.radius.pill,
  },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '600' },
  title: { marginTop: theme.spacing.md, fontSize: 17, fontWeight: '800', color: theme.colors.onSurface },
  description: { marginTop: 4, fontSize: 13, color: theme.colors.onSurfaceSecondary },
  actionsRow: { flexDirection: 'row', alignItems: 'center', marginTop: theme.spacing.md, gap: theme.spacing.lg },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  actionText: { fontSize: 13, color: theme.colors.onSurfaceSecondary, fontWeight: '600' },
});
