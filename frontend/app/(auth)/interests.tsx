import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { GradientButton } from '@/src/components/GradientButton';
import { CATEGORIES } from '@/src/lib/categories';
import { useAuth } from '@/src/lib/auth';
import { theme } from '@/src/theme';

const REQUIRED = 5;

export default function Interests() {
  const router = useRouter();
  const { setInterests, user } = useAuth();
  const [selected, setSelected] = useState<string[]>(user?.interests || []);
  const [busy, setBusy] = useState(false);

  function toggle(slug: string) {
    Haptics.selectionAsync();
    setSelected((s) => (s.includes(slug) ? s.filter((x) => x !== slug) : s.length >= REQUIRED ? s : [...s, slug]));
  }

  async function submit() {
    if (selected.length < REQUIRED) return;
    setBusy(true);
    try { await setInterests(selected); router.replace('/(tabs)/home'); }
    catch (e) { console.warn(e); }
    finally { setBusy(false); }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.surface }} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>¿Que hay pa&apos;<Text style={{ color: theme.colors.brandSecondary }}> hacer?</Text></Text>
        <Text style={styles.subtitle}>Escoge tus {REQUIRED} parches favoritos</Text>
      </View>

      <ScrollView contentContainerStyle={styles.grid}>
        {CATEGORIES.map((c) => {
          const active = selected.includes(c.slug);
          return (
            <Pressable
              key={c.slug}
              testID={`interest-${c.slug}`}
              onPress={() => toggle(c.slug)}
              style={styles.item}
            >
              <View style={[styles.circle, active && styles.circleActive]}>
                <LinearGradient
                  colors={active ? [theme.colors.brandPrimary, theme.colors.brandSecondary] : ['#EDF0FF', '#EDF0FF']}
                  style={styles.circleInner}
                >
                  <Text style={styles.emoji}>{c.emoji}</Text>
                </LinearGradient>
                {active && (
                  <View style={styles.check}>
                    <Ionicons name="checkmark" size={14} color="#fff" />
                  </View>
                )}
              </View>
              <Text style={styles.itemText} numberOfLines={1}>{c.name}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={styles.footer}>
        <Text style={styles.counter} testID="interests-counter">
          {selected.length}/{REQUIRED} seleccionados
        </Text>
        <GradientButton
          testID="interests-continue-button"
          title="Continuar"
          onPress={submit}
          loading={busy}
          disabled={selected.length < REQUIRED}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.md, paddingBottom: theme.spacing.md, alignItems: 'center' },
  title: { fontSize: 26, fontWeight: '900', color: theme.colors.onSurface },
  subtitle: { fontSize: 15, color: theme.colors.onSurfaceSecondary, marginTop: 6, fontWeight: '600' },
  grid: {
    flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg, paddingBottom: 140,
  },
  item: { width: '30%', alignItems: 'center', marginBottom: theme.spacing.md },
  circle: {
    width: 90, height: 90, borderRadius: 999, alignItems: 'center', justifyContent: 'center',
    borderWidth: 4, borderColor: theme.colors.brandPrimary, backgroundColor: '#fff',
  },
  circleActive: { borderColor: theme.colors.brandSecondary },
  circleInner: { width: '100%', height: '100%', borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  emoji: { fontSize: 42 },
  check: { position: 'absolute', bottom: -2, right: -2, backgroundColor: theme.colors.success, borderRadius: 999, padding: 4, borderWidth: 2, borderColor: '#fff' },
  itemText: { marginTop: 6, fontSize: 13, fontWeight: '700', color: theme.colors.onSurface },
  footer: {
    position: 'absolute', left: 0, right: 0, bottom: 0, padding: theme.spacing.lg, gap: 8,
    backgroundColor: 'rgba(255,255,255,0.95)', borderTopWidth: 1, borderTopColor: theme.colors.divider,
  },
  counter: { textAlign: 'center', fontWeight: '700', color: theme.colors.onSurfaceSecondary, fontSize: 13 },
});
