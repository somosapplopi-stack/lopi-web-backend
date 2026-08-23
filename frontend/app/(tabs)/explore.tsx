import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator, FlatList, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ParcheCard, type ParcheCardData } from '@/src/components/ParcheCard';
import { api } from '@/src/lib/api';
import { useAuth } from '@/src/lib/auth';
import { CATEGORIES, CITIES } from '@/src/lib/categories';
import { theme } from '@/src/theme';

type When = 'all' | 'today' | 'week' | 'my-city' | 'my-interests';

export default function Explore() {
  const { user } = useAuth();
  const [q, setQ] = useState('');
  const [when, setWhen] = useState<When>('all');
  const [category, setCategory] = useState<string | null>(null);
  const [city, setCity] = useState<string | null>(null);
  const [items, setItems] = useState<ParcheCardData[]>([]);
  const [loading, setLoading] = useState(true);

  const params = useMemo(() => {
    const p = new URLSearchParams();
    if (q.trim()) p.set('q', q.trim());
    if (when === 'today') p.set('when', 'today');
    if (when === 'week') p.set('when', 'week');
    if (when === 'my-city' && user?.city) p.set('city', user.city);
    if (when === 'my-interests') { /* filter client-side below */ }
    if (city) p.set('city', city);
    if (category) p.set('category', category);
    return p.toString();
  }, [q, when, category, city, user]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      let data = await api<ParcheCardData[]>(`/parches/feed${params ? `?${params}` : ''}`);
      if (when === 'my-interests' && user?.interests) {
        data = data.filter((p) => user.interests.includes(p.category));
      }
      setItems(data);
    } catch (e) { console.warn(e); }
    finally { setLoading(false); }
  }, [params, when, user]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const filters: { key: When; label: string }[] = [
    { key: 'all', label: 'Todos' },
    { key: 'today', label: 'Hoy' },
    { key: 'week', label: 'Esta semana' },
    { key: 'my-city', label: 'Cerca de mí' },
    { key: 'my-interests', label: 'Mis intereses' },
  ];

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.h1}>Explorar</Text>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={18} color={theme.colors.muted} />
          <TextInput
            testID="explore-search-input"
            placeholder="¿Qué quieres hacer?"
            placeholderTextColor={theme.colors.muted}
            value={q}
            onChangeText={setQ}
            onSubmitEditing={load}
            returnKeyType="search"
            style={styles.searchInput}
          />
          {q ? (
            <Pressable onPress={() => { setQ(''); }} hitSlop={8}>
              <Ionicons name="close-circle" size={18} color={theme.colors.muted} />
            </Pressable>
          ) : null}
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow} style={styles.chipsScroll}>
          {filters.map((f) => (
            <Pressable
              key={f.key}
              testID={`filter-when-${f.key}`}
              onPress={() => setWhen(f.key)}
              style={[styles.chip, when === f.key && styles.chipActive]}
            >
              <Text style={[styles.chipText, when === f.key && styles.chipTextActive]}>{f.label}</Text>
            </Pressable>
          ))}
        </ScrollView>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow} style={styles.chipsScroll}>
          <Pressable testID="filter-city-all" onPress={() => setCity(null)} style={[styles.chip, !city && styles.chipActive]}>
            <Text style={[styles.chipText, !city && styles.chipTextActive]}>🌎 Todas</Text>
          </Pressable>
          {CITIES.map((c) => (
            <Pressable
              key={c}
              testID={`filter-city-${c}`}
              onPress={() => setCity(city === c ? null : c)}
              style={[styles.chip, city === c && styles.chipActive]}
            >
              <Text style={[styles.chipText, city === c && styles.chipTextActive]}>{c}</Text>
            </Pressable>
          ))}
        </ScrollView>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow} style={styles.chipsScroll}>
          <Pressable testID="filter-cat-all" onPress={() => setCategory(null)} style={[styles.chip, !category && styles.chipActive]}>
            <Text style={[styles.chipText, !category && styles.chipTextActive]}>✨ Todas</Text>
          </Pressable>
          {CATEGORIES.map((c) => (
            <Pressable
              key={c.slug}
              testID={`filter-cat-${c.slug}`}
              onPress={() => setCategory(category === c.slug ? null : c.slug)}
              style={[styles.chip, category === c.slug && styles.chipActive]}
            >
              <Text style={[styles.chipText, category === c.slug && styles.chipTextActive]}>{c.emoji} {c.name}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={theme.colors.brandPrimary} />
        </View>
      ) : (
        <FlatList
          testID="explore-results"
          data={items}
          keyExtractor={(x) => x.id}
          renderItem={({ item }) => <ParcheCard parche={item} onChange={(u) => setItems((prev) => prev.map((p) => (p.id === u.id ? u : p)))} />}
          contentContainerStyle={{ paddingTop: theme.spacing.md, paddingBottom: 40 }}
          ListEmptyComponent={<Text style={styles.empty}>Sin resultados. Prueba con otros filtros.</Text>}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.surfaceSecondary },
  header: { backgroundColor: '#fff', paddingHorizontal: theme.spacing.lg, paddingTop: 8, paddingBottom: 8, gap: 10 },
  h1: { fontSize: 24, fontWeight: '900', color: theme.colors.onSurface },
  searchBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.colors.surfaceSecondary, borderRadius: theme.radius.pill, paddingHorizontal: 14, paddingVertical: 10, gap: 8 },
  searchInput: { flex: 1, fontSize: 15, color: theme.colors.onSurface, paddingVertical: 0 },
  chipsScroll: { marginHorizontal: -theme.spacing.lg },
  chipsRow: { gap: 8, paddingHorizontal: theme.spacing.lg },
  chip: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: theme.radius.pill, borderWidth: 1.5, borderColor: theme.colors.border, backgroundColor: '#fff', flexShrink: 0, height: 36, alignItems: 'center', justifyContent: 'center' },
  chipActive: { borderColor: theme.colors.brandPrimary, backgroundColor: theme.colors.surfaceTertiary },
  chipText: { fontSize: 13, color: theme.colors.onSurfaceSecondary, fontWeight: '700' },
  chipTextActive: { color: theme.colors.brandPrimary },
  empty: { textAlign: 'center', padding: 40, color: theme.colors.onSurfaceSecondary },
});
