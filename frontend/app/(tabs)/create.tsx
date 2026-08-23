import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { GradientButton } from '@/src/components/GradientButton';
import { api, uploadImage } from '@/src/lib/api';
import { useAuth } from '@/src/lib/auth';
import { CATEGORIES, CITIES } from '@/src/lib/categories';
import { theme } from '@/src/theme';

export default function CreateParche() {
  const router = useRouter();
  const { user } = useAuth();

  const [photo, setPhoto] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<string>(user?.interests?.[0] || CATEGORIES[0].slug);
  const [city, setCity] = useState<string>(user?.city || CITIES[0]);
  const [location, setLocation] = useState('');
  const [date, setDate] = useState(() => new Date(Date.now() + 24 * 3600 * 1000).toISOString().slice(0, 10));
  const [timeStart, setTimeStart] = useState('19:00');
  const [capacity, setCapacity] = useState('10');
  const [visibility, setVisibility] = useState<'public' | 'friends' | 'approval'>('public');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function pickPhoto() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { setErr('Permiso denegado'); return; }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'], allowsEditing: true, aspect: [16, 10], quality: 0.7,
    });
    if (res.canceled || !res.assets[0]) return;
    const uri = res.assets[0].uri;
    setPhoto(uri);
  }

  function reset() {
    setPhoto(null); setTitle(''); setDescription(''); setLocation('');
    setCapacity('10'); setTimeStart('19:00'); setErr(null);
  }

  async function submit() {
    if (!title.trim()) { setErr('El título es obligatorio'); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { setErr('Fecha inválida (YYYY-MM-DD)'); return; }
    if (!/^\d{1,2}:\d{2}$/.test(timeStart)) { setErr('Hora inválida (HH:MM)'); return; }
    const cap = parseInt(capacity, 10);
    if (!cap || cap < 1) { setErr('Capacidad inválida'); return; }

    setBusy(true); setErr(null);
    try {
      let photoUrl: string | null = null;
      if (photo) {
        setUploading(true);
        try { photoUrl = await uploadImage(photo); }
        catch (e) { console.warn('upload', e); }
        finally { setUploading(false); }
      }
      const created = await api<{ id: string }>('/parches', {
        method: 'POST',
        body: {
          title: title.trim(), description: description.trim(), category, city,
          location: location.trim(), date, time_start: timeStart, capacity: cap, visibility,
          photo: photoUrl,
        },
      });
      reset();
      router.push(`/parche/${created.id}`);
    } catch (e: any) { setErr(e.message || 'Error al crear el parche'); }
    finally { setBusy(false); }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.surface }} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.h1}>Crear parche</Text>
        <Text style={styles.subtitle}>Hazlo un parche, hazlo simple, hazlo ahora</Text>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: theme.spacing.lg, paddingBottom: 120 }} keyboardShouldPersistTaps="handled">
          <Pressable testID="create-photo-btn" onPress={pickPhoto} style={styles.photoPick}>
            {photo ? (
              <Image source={{ uri: photo }} style={styles.photoImg} contentFit="cover" />
            ) : (
              <LinearGradient colors={[theme.colors.brandPrimary, theme.colors.brandSecondary]} style={styles.photoImg}>
                <Ionicons name="image" size={32} color="#fff" />
                <Text style={styles.photoText}>Agregar foto</Text>
              </LinearGradient>
            )}
          </Pressable>

          <Text style={styles.label}>Título</Text>
          <TextInput testID="create-title-input" placeholder="¿A qué invitas?" placeholderTextColor={theme.colors.muted} value={title} onChangeText={setTitle} style={styles.input} />

          <Text style={styles.label}>Descripción</Text>
          <TextInput
            testID="create-description-input"
            placeholder="Cuéntanos los detalles..." placeholderTextColor={theme.colors.muted}
            value={description} onChangeText={setDescription} multiline numberOfLines={3}
            style={[styles.input, { height: 90, textAlignVertical: 'top' }]}
          />

          <Text style={styles.label}>Categoría</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
            {CATEGORIES.map((c) => (
              <Pressable key={c.slug} testID={`create-cat-${c.slug}`} onPress={() => setCategory(c.slug)} style={[styles.chip, category === c.slug && styles.chipActive]}>
                <Text style={[styles.chipText, category === c.slug && styles.chipTextActive]}>{c.emoji} {c.name}</Text>
              </Pressable>
            ))}
          </ScrollView>

          <Text style={styles.label}>Ciudad</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
            {CITIES.map((c) => (
              <Pressable key={c} testID={`create-city-${c}`} onPress={() => setCity(c)} style={[styles.chip, city === c && styles.chipActive]}>
                <Text style={[styles.chipText, city === c && styles.chipTextActive]}>{c}</Text>
              </Pressable>
            ))}
          </ScrollView>

          <Text style={styles.label}>Ubicación / lugar</Text>
          <TextInput testID="create-location-input" placeholder="Ej: Parque San Pío" placeholderTextColor={theme.colors.muted} value={location} onChangeText={setLocation} style={styles.input} />

          <View style={{ flexDirection: 'row', gap: theme.spacing.md }}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Fecha</Text>
              <TextInput testID="create-date-input" placeholder="YYYY-MM-DD" placeholderTextColor={theme.colors.muted} value={date} onChangeText={setDate} style={styles.input} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Hora</Text>
              <TextInput testID="create-time-input" placeholder="HH:MM" placeholderTextColor={theme.colors.muted} value={timeStart} onChangeText={setTimeStart} style={styles.input} />
            </View>
            <View style={{ width: 90 }}>
              <Text style={styles.label}>Cupos</Text>
              <TextInput testID="create-capacity-input" keyboardType="number-pad" value={capacity} onChangeText={setCapacity} style={styles.input} />
            </View>
          </View>

          <Text style={styles.label}>Visibilidad</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {(['public', 'friends', 'approval'] as const).map((v) => (
              <Pressable key={v} testID={`create-visibility-${v}`} onPress={() => setVisibility(v)} style={[styles.chip, visibility === v && styles.chipActive, { flex: 1, alignItems: 'center' }]}>
                <Text style={[styles.chipText, visibility === v && styles.chipTextActive]}>
                  {v === 'public' ? 'Público' : v === 'friends' ? 'Solo amigos' : 'Requiere aprobación'}
                </Text>
              </Pressable>
            ))}
          </View>

          {err ? <Text style={styles.error} testID="create-error">{err}</Text> : null}

          <GradientButton
            testID="create-submit-button"
            title={uploading ? 'Subiendo foto...' : 'Publicar parche'}
            onPress={submit}
            loading={busy}
            style={{ marginTop: theme.spacing.lg }}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: theme.spacing.lg, paddingTop: 4, paddingBottom: 8, backgroundColor: '#fff' },
  h1: { fontSize: 24, fontWeight: '900', color: theme.colors.onSurface },
  subtitle: { fontSize: 13, color: theme.colors.onSurfaceSecondary, marginTop: 4 },
  photoPick: { borderRadius: theme.radius.lg, overflow: 'hidden', marginBottom: theme.spacing.md },
  photoImg: { width: '100%', height: 180, alignItems: 'center', justifyContent: 'center' },
  photoText: { color: '#fff', fontWeight: '700', marginTop: 6 },
  label: { fontSize: 13, fontWeight: '700', color: theme.colors.onSurfaceSecondary, marginTop: theme.spacing.md, marginBottom: 6 },
  input: { borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceSecondary, borderRadius: theme.radius.md, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: theme.colors.onSurface },
  chipsRow: { gap: 8, paddingVertical: 2 },
  chip: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: theme.radius.pill, borderWidth: 1.5, borderColor: theme.colors.border, backgroundColor: '#fff', flexShrink: 0, height: 36, alignItems: 'center', justifyContent: 'center' },
  chipActive: { borderColor: theme.colors.brandPrimary, backgroundColor: theme.colors.surfaceTertiary },
  chipText: { fontSize: 13, color: theme.colors.onSurfaceSecondary, fontWeight: '700' },
  chipTextActive: { color: theme.colors.brandPrimary },
  error: { color: theme.colors.error, marginTop: 12, textAlign: 'center' },
});
