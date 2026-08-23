import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { api } from '@/src/lib/api';
import { useAuth } from '@/src/lib/auth';
import { theme } from '@/src/theme';

const AVATAR_FALLBACK = 'https://ui-avatars.com/api/?background=3B4CF6&color=fff&name=';

type Msg = {
  id: string;
  parche_id: string;
  text: string;
  author: { id: string; name: string; username: string; photo?: string | null };
  created_at: string;
};

function fmtTime(iso: string): string {
  try {
    const d = new Date(iso);
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
  } catch { return ''; }
}

export default function Chat() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [parcheTitle, setParcheTitle] = useState('Chat del parche');
  const listRef = useRef<FlatList<Msg>>(null);

  const load = useCallback(async () => {
    try {
      const [messages, parche] = await Promise.all([
        api<Msg[]>(`/parches/${id}/messages`),
        api<any>(`/parches/${id}`),
      ]);
      setMsgs(messages);
      setParcheTitle(parche.title);
    } catch (e: any) { setErr(e.message || 'No se pudo cargar el chat'); }
    finally { setLoading(false); }
  }, [id]);

  useEffect(() => { load(); const t = setInterval(load, 5000); return () => clearInterval(t); }, [load]);

  async function send() {
    const t = text.trim();
    if (!t) return;
    setSending(true);
    try {
      const created = await api<Msg>(`/parches/${id}/messages`, { method: 'POST', body: { text: t } });
      setMsgs((prev) => [...prev, created]);
      setText('');
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
    } catch (e: any) { setErr(e.message || 'No se pudo enviar'); }
    finally { setSending(false); }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.surfaceSecondary }} edges={['top']}>
      <View style={styles.header}>
        <Pressable testID="chat-back-btn" onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="chevron-back" size={26} color={theme.colors.onSurface} />
        </Pressable>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={styles.title} numberOfLines={1}>{parcheTitle}</Text>
          <Text style={styles.subtitle}>Chat grupal · solo participantes</Text>
        </View>
        <View style={{ width: 26 }} />
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={theme.colors.brandPrimary} />
      ) : err && msgs.length === 0 ? (
        <View style={styles.errBox}>
          <Ionicons name="lock-closed" size={40} color={theme.colors.muted} />
          <Text style={styles.errText}>{err}</Text>
          <Pressable onPress={() => router.replace(`/parche/${id}`)} style={styles.errBtn}>
            <Text style={{ color: '#fff', fontWeight: '800' }}>Volver al parche</Text>
          </Pressable>
        </View>
      ) : (
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }} keyboardVerticalOffset={0}>
          <FlatList
            ref={listRef}
            testID="chat-messages"
            data={msgs}
            keyExtractor={(m) => m.id}
            contentContainerStyle={{ padding: theme.spacing.md, gap: 8 }}
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
            renderItem={({ item }) => {
              const mine = item.author.id === user?.id;
              return (
                <View style={[styles.msgRow, mine && { flexDirection: 'row-reverse' }]}>
                  <Image source={{ uri: item.author.photo || AVATAR_FALLBACK + encodeURIComponent(item.author.name) }} style={styles.msgAvatar} contentFit="cover" />
                  <View style={[styles.bubbleWrap, mine ? styles.bubbleMine : styles.bubbleTheirs]}>
                    {!mine && <Text style={styles.msgName}>{item.author.name}</Text>}
                    <Text style={[styles.msgText, mine && { color: '#fff' }]}>{item.text}</Text>
                    <Text style={[styles.msgTime, mine && { color: 'rgba(255,255,255,0.8)' }]}>{fmtTime(item.created_at)}</Text>
                  </View>
                </View>
              );
            }}
            ListEmptyComponent={<Text style={styles.empty}>Sé el primero en escribir 👋</Text>}
          />

          <View style={styles.inputRow}>
            <TextInput
              testID="chat-input"
              placeholder="Escribe un mensaje..."
              placeholderTextColor={theme.colors.muted}
              value={text}
              onChangeText={setText}
              style={styles.input}
              multiline
            />
            <Pressable testID="chat-send-btn" onPress={send} disabled={sending || !text.trim()} style={[styles.sendBtn, !text.trim() && { opacity: 0.5 }]}>
              <Ionicons name="send" size={18} color="#fff" />
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: theme.spacing.md, paddingVertical: theme.spacing.md, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: theme.colors.divider },
  title: { fontSize: 16, fontWeight: '900', color: theme.colors.onSurface },
  subtitle: { fontSize: 11, color: theme.colors.onSurfaceSecondary, marginTop: 2 },
  msgRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  msgAvatar: { width: 30, height: 30, borderRadius: 999 },
  bubbleWrap: { maxWidth: '75%', paddingHorizontal: 12, paddingVertical: 8, borderRadius: theme.radius.lg },
  bubbleTheirs: { backgroundColor: '#fff', borderTopLeftRadius: 4 },
  bubbleMine: { backgroundColor: theme.colors.brandPrimary, borderTopRightRadius: 4 },
  msgName: { fontSize: 11, fontWeight: '800', color: theme.colors.brandPrimary, marginBottom: 2 },
  msgText: { fontSize: 14, color: theme.colors.onSurface, lineHeight: 20 },
  msgTime: { fontSize: 10, color: theme.colors.muted, marginTop: 4, textAlign: 'right' },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, padding: theme.spacing.md, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: theme.colors.divider },
  input: { flex: 1, borderRadius: theme.radius.lg, backgroundColor: theme.colors.surfaceSecondary, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, color: theme.colors.onSurface, maxHeight: 100, minHeight: 40 },
  sendBtn: { width: 44, height: 44, borderRadius: 999, backgroundColor: theme.colors.brandPrimary, alignItems: 'center', justifyContent: 'center' },
  empty: { textAlign: 'center', color: theme.colors.onSurfaceSecondary, padding: 40 },
  errBox: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: theme.spacing.xl, gap: 12 },
  errText: { textAlign: 'center', color: theme.colors.onSurfaceSecondary, fontSize: 14 },
  errBtn: { backgroundColor: theme.colors.brandPrimary, paddingHorizontal: 20, paddingVertical: 12, borderRadius: theme.radius.pill },
});
