import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { GradientButton } from '@/src/components/GradientButton';
import { LopiLogo } from '@/src/components/LopiLogo';
import { useAuth } from '@/src/lib/auth';
import { theme } from '@/src/theme';


export default function Login() {
  const router = useRouter();
  const { login } = useAuth();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    if (!identifier || !password) { setErr('Completa todos los campos'); return; }
    setBusy(true); setErr(null);
    try { await login(identifier.trim(), password); }
    catch (e: any) { setErr(e.message || 'Error al iniciar sesión'); }
    finally { setBusy(false); }
  }

  return (
    <LinearGradient colors={[theme.colors.brandPrimary, theme.colors.brandSecondary]} style={{ flex: 1 }}>
      <SafeAreaView style={{ flex: 1 }}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
            <View style={{ alignItems: 'center', marginTop: 40, marginBottom: 32 }}>
              <View style={styles.logoWrap}><LopiLogo size={72} /></View>
              <Text style={styles.tagline}>¿Qué hay pa&apos; hacer?</Text>
            </View>

            <View style={styles.card}>
              <Text style={styles.title}>Bienvenido de vuelta</Text>
              <Text style={styles.subtitle}>Inicia sesión con tu cuenta LOPI</Text>

              <TextInput
                testID="login-identifier-input"
                placeholder="Usuario o email"
                placeholderTextColor={theme.colors.muted}
                autoCapitalize="none"
                autoCorrect={false}
                value={identifier}
                onChangeText={setIdentifier}
                style={styles.input}
              />
              <TextInput
                testID="login-password-input"
                placeholder="Contraseña"
                placeholderTextColor={theme.colors.muted}
                secureTextEntry
                value={password}
                onChangeText={setPassword}
                style={styles.input}
              />

              {err ? <Text style={styles.error} testID="login-error">{err}</Text> : null}

              <GradientButton
                testID="login-submit-button"
                title="Entrar"
                onPress={submit}
                loading={busy}
                style={{ marginTop: 8 }}
              />

              <Pressable
                testID="go-to-register-link"
                onPress={() => router.push('/(auth)/register')}
                style={{ marginTop: 20, alignItems: 'center' }}
              >
                <Text style={styles.linkText}>
                  ¿Nuevo en LOPI? <Text style={{ color: theme.colors.brandPrimary, fontWeight: '800' }}>Regístrate</Text>
                </Text>
              </Pressable>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 1, padding: theme.spacing.lg },
  logoWrap: { backgroundColor: '#fff', paddingHorizontal: 22, paddingVertical: 10, borderRadius: theme.radius.pill },
  tagline: { color: '#fff', fontSize: 20, fontWeight: '700', marginTop: 14, textShadowColor: 'rgba(0,0,0,0.2)', textShadowRadius: 4 },
  card: { backgroundColor: '#fff', borderRadius: theme.radius.lg, padding: theme.spacing.xl, gap: 12 },
  title: { fontSize: 22, fontWeight: '900', color: theme.colors.onSurface },
  subtitle: { fontSize: 14, color: theme.colors.onSurfaceSecondary, marginBottom: 8 },
  input: {
    borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceSecondary,
    borderRadius: theme.radius.md, paddingHorizontal: 14, paddingVertical: 14, fontSize: 15, color: theme.colors.onSurface,
  },
  error: { color: theme.colors.error, fontSize: 13, marginTop: 4 },
  linkText: { fontSize: 14, color: theme.colors.onSurfaceSecondary },
  demoBox: { marginTop: 16, padding: 12, backgroundColor: theme.colors.surfaceTertiary, borderRadius: theme.radius.md },
  demoTitle: { fontSize: 12, color: theme.colors.brandPrimary, fontWeight: '800', marginBottom: 2 },
  demoText: { fontSize: 12, color: theme.colors.onSurfaceSecondary },
});
