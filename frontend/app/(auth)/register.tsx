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
import { useAuth } from '@/src/lib/auth';
import { uploadImage } from '@/src/lib/api';
import { CITIES } from '@/src/lib/categories';
import { theme } from '@/src/theme';

export default function Register() {
  const router = useRouter();
  const { register } = useAuth();
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [city, setCity] = useState(CITIES[0]);
  const [photo, setPhoto] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function pickPhoto() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { setErr('Se necesita permiso para la galería'); return; }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.7,
    });
    if (res.canceled || !res.assets[0]) return;
    setPhoto(res.assets[0].uri); // preview local first
  }

  async function submit() {
    if (!name || !username || !email || !password) { setErr('Completa todos los campos'); return; }
    if (password.length < 6) { setErr('Contraseña mínima 6 caracteres'); return; }
    setBusy(true); setErr(null);
    try {
      // Register FIRST so we can authenticate, then upload photo if any.
      const user = await register({ name, username, email, password, city, photo: null });
      if (photo && !photo.startsWith('http')) {
        try {
          setUploading(true);
          const url = await uploadImage(photo);
          await fetch(''); // no-op
          // Update profile with the uploaded photo url.
          const { api } = await import('@/src/lib/api');
          await api('/auth/profile', { method: 'PATCH', body: { photo: url } });
        } catch (e) { console.warn('photo upload failed', e); }
        finally { setUploading(false); }
      }
      router.replace('/(auth)/interests');
    } catch (e: any) { setErr(e.message || 'Error en el registro'); }
    finally { setBusy(false); }
  }

  return (
    <LinearGradient colors={[theme.colors.brandPrimary, theme.colors.brandSecondary]} style={{ flex: 1 }}>
      <SafeAreaView style={{ flex: 1 }}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
            <Pressable testID="back-to-login-btn" onPress={() => router.back()} style={{ padding: 4 }}>
              <Ionicons name="chevron-back" size={28} color="#fff" />
            </Pressable>

            <View style={styles.card}>
              <Text style={styles.title}>Crea tu cuenta</Text>
              <Text style={styles.subtitle}>Únete a la red social de los parches</Text>

              <Pressable testID="pick-photo-btn" onPress={pickPhoto} style={styles.avatarPick}>
                {photo ? (
                  <Image source={{ uri: photo }} style={styles.avatarImg} contentFit="cover" />
                ) : (
                  <LinearGradient colors={[theme.colors.brandPrimary, theme.colors.brandSecondary]} style={styles.avatarImg}>
                    <Ionicons name="camera" size={28} color="#fff" />
                  </LinearGradient>
                )}
                <Text style={styles.avatarText}>Foto de perfil</Text>
              </Pressable>

              <TextInput testID="reg-name-input" placeholder="Nombre" placeholderTextColor={theme.colors.muted} value={name} onChangeText={setName} style={styles.input} />
              <TextInput testID="reg-username-input" placeholder="Usuario (@)" placeholderTextColor={theme.colors.muted} autoCapitalize="none" value={username} onChangeText={setUsername} style={styles.input} />
              <TextInput testID="reg-email-input" placeholder="Email" placeholderTextColor={theme.colors.muted} autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} style={styles.input} />
              <TextInput testID="reg-password-input" placeholder="Contraseña (min 6)" placeholderTextColor={theme.colors.muted} secureTextEntry value={password} onChangeText={setPassword} style={styles.input} />

              <View>
                <Text style={styles.label}>Ciudad</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 4 }}>
                  {CITIES.map((c) => (
                    <Pressable
                      key={c}
                      testID={`city-chip-${c}`}
                      onPress={() => setCity(c)}
                      style={[styles.cityChip, city === c && styles.cityChipActive]}
                    >
                      <Text style={[styles.cityChipText, city === c && styles.cityChipTextActive]}>{c}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>

              {err ? <Text style={styles.error} testID="register-error">{err}</Text> : null}

              <GradientButton
                testID="register-submit-button"
                title={uploading ? 'Subiendo foto...' : 'Crear cuenta'}
                onPress={submit}
                loading={busy}
                style={{ marginTop: 8 }}
              />
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 1, padding: theme.spacing.lg, gap: 12 },
  card: { backgroundColor: '#fff', borderRadius: theme.radius.lg, padding: theme.spacing.xl, gap: 10 },
  title: { fontSize: 22, fontWeight: '900', color: theme.colors.onSurface },
  subtitle: { fontSize: 14, color: theme.colors.onSurfaceSecondary, marginBottom: 6 },
  avatarPick: { alignItems: 'center', marginVertical: 8 },
  avatarImg: { width: 90, height: 90, borderRadius: 999, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: theme.colors.borderStrong },
  avatarText: { marginTop: 6, color: theme.colors.brandPrimary, fontWeight: '700', fontSize: 13 },
  input: {
    borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceSecondary,
    borderRadius: theme.radius.md, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: theme.colors.onSurface,
  },
  label: { fontSize: 13, color: theme.colors.onSurfaceSecondary, fontWeight: '700', marginTop: 4, marginBottom: 4 },
  cityChip: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: theme.radius.pill, borderWidth: 1.5, borderColor: theme.colors.border, backgroundColor: theme.colors.surface, flexShrink: 0 },
  cityChipActive: { borderColor: theme.colors.brandPrimary, backgroundColor: theme.colors.surfaceTertiary },
  cityChipText: { fontSize: 13, color: theme.colors.onSurfaceSecondary, fontWeight: '600' },
  cityChipTextActive: { color: theme.colors.brandPrimary },
  error: { color: theme.colors.error, fontSize: 13 },
});
