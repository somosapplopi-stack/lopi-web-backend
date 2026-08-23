import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator, FlatList, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { api } from '@/src/lib/api';
import { useAuth } from '@/src/lib/auth';
import { CATEGORY_MAP } from '@/src/lib/categories';
import { theme } from '@/src/theme';

type Stats = {
  total_users: number;
  new_users: { today: number; week: number; month: number };
  active_users_week: number;
  total_parches: number;
  participations: number;
  pct_with_participants: number;
  users_by_city: { city: string; count: number }[];
  parches_by_city: { city: string; count: number }[];
  top_categories: { category: string; count: number }[];
  top_participation: { id: string; title: string; city: string; photo?: string | null; participants_count: number }[];
};

type AdminUser = { id: string; name: string; username: string; email: string; city: string; role: string; status: string; photo?: string | null; created_at?: string };
type AdminParche = { id: string; title: string; city: string; category: string; participants_count: number; hidden: boolean; photo?: string | null; creator: { name: string } };
type ReportRow = { id: string; target_type: string; reason: string; status: string; created_at: string; reporter: any; target: any };

type Tab = 'stats' | 'users' | 'parches' | 'reports';

export default function Admin() {
  const router = useRouter();
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>('stats');
  const [stats, setStats] = useState<Stats | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [parches, setParches] = useState<AdminParche[]>([]);
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (tab === 'stats') setStats(await api<Stats>('/admin/stats'));
      else if (tab === 'users') setUsers(await api<AdminUser[]>(`/admin/users${q ? `?q=${encodeURIComponent(q)}` : ''}`));
      else if (tab === 'parches') setParches(await api<AdminParche[]>(`/admin/parches${q ? `?q=${encodeURIComponent(q)}` : ''}`));
      else setReports(await api<ReportRow[]>(`/admin/reports${statusFilter ? `?status=${statusFilter}` : ''}`));
    } catch (e) { console.warn(e); }
    finally { setLoading(false); }
  }, [tab, q, statusFilter]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function setUserStatus(userId: string, status: string) {
    try { await api(`/admin/users/${userId}/status`, { method: 'POST', body: { status } }); await load(); }
    catch (e) { console.warn(e); }
  }
  async function hideParche(pid: string, hidden: boolean) {
    try { await api(`/admin/parches/${pid}/status`, { method: 'POST', body: { hidden } }); await load(); }
    catch (e) { console.warn(e); }
  }
  async function deleteParche(pid: string) {
    try { await api(`/admin/parches/${pid}`, { method: 'DELETE' }); await load(); }
    catch (e) { console.warn(e); }
  }
  async function setReportStatus(id: string, status: string) {
    try { await api(`/admin/reports/${id}`, { method: 'PATCH', body: { status } }); await load(); }
    catch (e) { console.warn(e); }
  }

  if (!user || user.role !== 'super_admin') {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', padding: 20 }} edges={['top']}>
        <Ionicons name="lock-closed" size={48} color={theme.colors.muted} />
        <Text style={{ marginTop: 12, fontSize: 16, fontWeight: '800' }}>Solo Super Admin</Text>
        <Pressable onPress={() => router.back()} style={{ marginTop: 20, backgroundColor: theme.colors.brandPrimary, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 999 }}>
          <Text style={{ color: '#fff', fontWeight: '800' }}>Volver</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.surfaceSecondary }} edges={['top']}>
      <View style={styles.header}>
        <Pressable testID="admin-back-btn" onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="chevron-back" size={26} color={theme.colors.onSurface} />
        </Pressable>
        <Text style={styles.title}>Panel Admin</Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow} style={styles.chipsScroll}>
        {(['stats', 'users', 'parches', 'reports'] as Tab[]).map((t) => (
          <Pressable key={t} testID={`admin-tab-${t}`} onPress={() => setTab(t)} style={[styles.chip, tab === t && styles.chipActive]}>
            <Text style={[styles.chipText, tab === t && styles.chipTextActive]}>
              {t === 'stats' ? 'Estadísticas' : t === 'users' ? 'Usuarios' : t === 'parches' ? 'Parches' : 'Reportes'}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {loading && !stats && tab === 'stats' ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={theme.colors.brandPrimary} />
      ) : tab === 'stats' && stats ? (
        <ScrollView contentContainerStyle={{ padding: theme.spacing.md, gap: 12, paddingBottom: 40 }}>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <StatCard label="Usuarios" value={stats.total_users} icon="people" />
            <StatCard label="Parches" value={stats.total_parches} icon="calendar" />
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <StatCard label="Activos 7d" value={stats.active_users_week} icon="pulse" />
            <StatCard label="Participaciones" value={stats.participations} icon="checkmark-done" />
          </View>
          <View style={styles.miniStatsRow}>
            <MiniStat label="Hoy" value={stats.new_users.today} />
            <MiniStat label="Semana" value={stats.new_users.week} />
            <MiniStat label="Mes" value={stats.new_users.month} />
            <MiniStat label="% con participantes" value={`${stats.pct_with_participants}%`} />
          </View>

          <Section title="Usuarios por ciudad" data={stats.users_by_city} labelKey="city" valueKey="count" />
          <Section title="Parches por ciudad" data={stats.parches_by_city} labelKey="city" valueKey="count" />

          <Text style={styles.h2}>Categorías más usadas</Text>
          <View style={styles.card}>
            {stats.top_categories.map((c) => (
              <View key={c.category} style={styles.rowBetween}>
                <Text style={styles.rowLabel}>{CATEGORY_MAP[c.category]?.emoji || '✨'} {CATEGORY_MAP[c.category]?.name || c.category}</Text>
                <Text style={styles.rowNum}>{c.count}</Text>
              </View>
            ))}
          </View>

          <Text style={styles.h2}>Top parches</Text>
          <View style={styles.card}>
            {stats.top_participation.map((p, i) => (
              <Pressable key={p.id} onPress={() => router.push(`/parche/${p.id}`)} style={styles.rowBetween}>
                <Text style={styles.rowLabel} numberOfLines={1}>{i + 1}. {p.title}</Text>
                <Text style={styles.rowNum}>👥 {p.participants_count}</Text>
              </Pressable>
            ))}
          </View>
        </ScrollView>
      ) : tab === 'users' ? (
        <>
          <View style={styles.searchBox}>
            <Ionicons name="search" size={18} color={theme.colors.muted} />
            <TextInput testID="admin-users-search" placeholder="Buscar por nombre / email" placeholderTextColor={theme.colors.muted} value={q} onChangeText={setQ} onSubmitEditing={load} style={{ flex: 1, fontSize: 15 }} autoCapitalize="none" />
          </View>
          <FlatList
            testID="admin-users-list"
            data={users}
            keyExtractor={(x) => x.id}
            contentContainerStyle={{ padding: theme.spacing.md, gap: 8, paddingBottom: 40 }}
            renderItem={({ item }) => (
              <View style={styles.itemCard}>
                <Text style={styles.itemTitle}>{item.name} <Text style={{ fontWeight: '400', color: theme.colors.muted }}>@{item.username}</Text></Text>
                <Text style={styles.itemSub}>{item.email} · {item.city || '—'} · {item.role}</Text>
                <View style={styles.pillsRow}>
                  <View style={[styles.statusPill, item.status === 'active' ? styles.pillOk : item.status === 'suspended' ? styles.pillWarn : styles.pillErr]}>
                    <Text style={styles.pillText}>{item.status}</Text>
                  </View>
                  <View style={{ flex: 1 }} />
                  {item.status !== 'active' && <Pressable testID={`activate-${item.id}`} onPress={() => setUserStatus(item.id, 'active')} style={styles.btnGray}><Text style={styles.btnText}>Activar</Text></Pressable>}
                  {item.status !== 'suspended' && <Pressable testID={`suspend-${item.id}`} onPress={() => setUserStatus(item.id, 'suspended')} style={styles.btnWarn}><Text style={styles.btnText}>Suspender</Text></Pressable>}
                  {item.status !== 'blocked' && <Pressable testID={`block-${item.id}`} onPress={() => setUserStatus(item.id, 'blocked')} style={styles.btnErr}><Text style={styles.btnText}>Bloquear</Text></Pressable>}
                </View>
              </View>
            )}
            ListEmptyComponent={loading ? <ActivityIndicator style={{ marginTop: 40 }} /> : <Text style={styles.empty}>Sin usuarios.</Text>}
          />
        </>
      ) : tab === 'parches' ? (
        <>
          <View style={styles.searchBox}>
            <Ionicons name="search" size={18} color={theme.colors.muted} />
            <TextInput testID="admin-parches-search" placeholder="Buscar parche" placeholderTextColor={theme.colors.muted} value={q} onChangeText={setQ} onSubmitEditing={load} style={{ flex: 1, fontSize: 15 }} />
          </View>
          <FlatList
            testID="admin-parches-list"
            data={parches}
            keyExtractor={(x) => x.id}
            contentContainerStyle={{ padding: theme.spacing.md, gap: 8, paddingBottom: 40 }}
            renderItem={({ item }) => (
              <View style={styles.itemCard}>
                <Pressable onPress={() => router.push(`/parche/${item.id}`)}>
                  <Text style={styles.itemTitle}>{item.title}</Text>
                  <Text style={styles.itemSub}>{item.city} · {CATEGORY_MAP[item.category]?.name || item.category} · {item.participants_count} participantes</Text>
                  <Text style={styles.itemSub}>Creado por {item.creator?.name}</Text>
                </Pressable>
                <View style={styles.pillsRow}>
                  <View style={[styles.statusPill, item.hidden ? styles.pillWarn : styles.pillOk]}>
                    <Text style={styles.pillText}>{item.hidden ? 'oculto' : 'visible'}</Text>
                  </View>
                  <View style={{ flex: 1 }} />
                  <Pressable testID={`toggle-hide-${item.id}`} onPress={() => hideParche(item.id, !item.hidden)} style={styles.btnGray}>
                    <Text style={styles.btnText}>{item.hidden ? 'Mostrar' : 'Ocultar'}</Text>
                  </Pressable>
                  <Pressable testID={`delete-parche-${item.id}`} onPress={() => deleteParche(item.id)} style={styles.btnErr}>
                    <Text style={styles.btnText}>Eliminar</Text>
                  </Pressable>
                </View>
              </View>
            )}
            ListEmptyComponent={loading ? <ActivityIndicator style={{ marginTop: 40 }} /> : <Text style={styles.empty}>Sin parches.</Text>}
          />
        </>
      ) : (
        <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
            {[['', 'Todos'], ['pending', 'Pendiente'], ['in_review', 'En revisión'], ['resolved', 'Resuelto'], ['dismissed', 'Descartado']].map(([v, l]) => (
              <Pressable key={v || 'all'} testID={`admin-reports-filter-${v || 'all'}`} onPress={() => setStatusFilter(v)} style={[styles.chip, statusFilter === v && styles.chipActive]}>
                <Text style={[styles.chipText, statusFilter === v && styles.chipTextActive]}>{l}</Text>
              </Pressable>
            ))}
          </ScrollView>
          <FlatList
            testID="admin-reports-list"
            data={reports}
            keyExtractor={(x) => x.id}
            contentContainerStyle={{ padding: theme.spacing.md, gap: 8, paddingBottom: 40 }}
            renderItem={({ item }) => (
              <View style={styles.itemCard}>
                <Text style={styles.itemTitle}>{item.target_type === 'user' ? '👤 Usuario' : '🎉 Parche'}: {item.target?.name || item.target?.title || '—'}</Text>
                <Text style={styles.itemSub}>Motivo: {item.reason}</Text>
                <Text style={styles.itemSub}>Reportado por {item.reporter?.name}</Text>
                <View style={styles.pillsRow}>
                  <View style={[styles.statusPill,
                    item.status === 'pending' ? styles.pillWarn :
                    item.status === 'in_review' ? styles.pillOk :
                    item.status === 'resolved' ? { backgroundColor: '#DCFCE7' } :
                    { backgroundColor: theme.colors.surfaceSecondary }]}>
                    <Text style={styles.pillText}>{item.status}</Text>
                  </View>
                  <View style={{ flex: 1 }} />
                  {['pending', 'in_review', 'resolved', 'dismissed'].filter((s) => s !== item.status).map((s) => (
                    <Pressable key={s} testID={`set-report-${item.id}-${s}`} onPress={() => setReportStatus(item.id, s)} style={styles.btnGray}>
                      <Text style={styles.btnText}>{s === 'pending' ? 'Pend.' : s === 'in_review' ? 'Revisar' : s === 'resolved' ? 'Resolver' : 'Descartar'}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            )}
            ListEmptyComponent={loading ? <ActivityIndicator style={{ marginTop: 40 }} /> : <Text style={styles.empty}>Sin reportes.</Text>}
          />
        </>
      )}
    </SafeAreaView>
  );
}

function StatCard({ label, value, icon }: { label: string; value: number | string; icon: any }) {
  return (
    <LinearGradient colors={[theme.colors.brandPrimary, theme.colors.brandSecondary]} style={styles.statCard}>
      <Ionicons name={icon} size={22} color="#fff" />
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </LinearGradient>
  );
}

function MiniStat({ label, value }: { label: string; value: number | string }) {
  return (
    <View style={styles.miniStat}>
      <Text style={styles.miniStatValue}>{value}</Text>
      <Text style={styles.miniStatLabel}>{label}</Text>
    </View>
  );
}

function Section({ title, data, labelKey, valueKey }: { title: string; data: any[]; labelKey: string; valueKey: string }) {
  return (
    <>
      <Text style={styles.h2}>{title}</Text>
      <View style={styles.card}>
        {data.length === 0 ? <Text style={styles.empty}>Sin datos</Text> : data.map((d, i) => (
          <View key={i} style={styles.rowBetween}>
            <Text style={styles.rowLabel}>{d[labelKey]}</Text>
            <Text style={styles.rowNum}>{d[valueKey]}</Text>
          </View>
        ))}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: theme.spacing.lg, paddingVertical: theme.spacing.md, borderBottomWidth: 1, borderBottomColor: theme.colors.divider, backgroundColor: '#fff' },
  title: { fontSize: 18, fontWeight: '900', color: theme.colors.onSurface },
  chipsScroll: { maxHeight: 56, backgroundColor: '#fff' },
  chipsRow: { gap: 8, paddingHorizontal: theme.spacing.lg, paddingVertical: 10 },
  chip: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: theme.radius.pill, borderWidth: 1.5, borderColor: theme.colors.border, backgroundColor: '#fff', flexShrink: 0, height: 36, alignItems: 'center', justifyContent: 'center' },
  chipActive: { borderColor: theme.colors.brandPrimary, backgroundColor: theme.colors.surfaceTertiary },
  chipText: { fontSize: 13, color: theme.colors.onSurfaceSecondary, fontWeight: '700' },
  chipTextActive: { color: theme.colors.brandPrimary },
  searchBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.colors.surfaceSecondary, borderRadius: theme.radius.pill, paddingHorizontal: 14, paddingVertical: 10, gap: 8, marginHorizontal: theme.spacing.md, marginTop: 8 },
  statCard: { flex: 1, padding: 16, borderRadius: theme.radius.md, gap: 4 },
  statValue: { color: '#fff', fontSize: 28, fontWeight: '900', marginTop: 4 },
  statLabel: { color: 'rgba(255,255,255,0.9)', fontSize: 12, fontWeight: '700' },
  miniStatsRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  miniStat: { flex: 1, minWidth: '46%', backgroundColor: '#fff', padding: 12, borderRadius: theme.radius.md, alignItems: 'center' },
  miniStatValue: { fontSize: 22, fontWeight: '900', color: theme.colors.brandPrimary },
  miniStatLabel: { fontSize: 11, color: theme.colors.onSurfaceSecondary, fontWeight: '700', marginTop: 2 },
  h2: { fontSize: 15, fontWeight: '900', color: theme.colors.onSurface, marginTop: 8 },
  card: { backgroundColor: '#fff', borderRadius: theme.radius.md, padding: 12, gap: 8 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4, gap: 8 },
  rowLabel: { fontSize: 13, color: theme.colors.onSurface, flex: 1 },
  rowNum: { fontSize: 13, color: theme.colors.brandPrimary, fontWeight: '800' },
  itemCard: { backgroundColor: '#fff', padding: 12, borderRadius: theme.radius.md, gap: 4, ...theme.shadow.card },
  itemTitle: { fontSize: 14, fontWeight: '800', color: theme.colors.onSurface },
  itemSub: { fontSize: 12, color: theme.colors.onSurfaceSecondary },
  pillsRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8, flexWrap: 'wrap' },
  statusPill: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: theme.radius.pill },
  pillOk: { backgroundColor: '#DBEAFE' },
  pillWarn: { backgroundColor: '#FEF3C7' },
  pillErr: { backgroundColor: '#FEE2E2' },
  pillText: { fontSize: 10, fontWeight: '800', color: theme.colors.onSurface },
  btnGray: { backgroundColor: theme.colors.surfaceSecondary, paddingHorizontal: 10, paddingVertical: 6, borderRadius: theme.radius.pill, borderWidth: 1, borderColor: theme.colors.border },
  btnWarn: { backgroundColor: '#FEF3C7', paddingHorizontal: 10, paddingVertical: 6, borderRadius: theme.radius.pill },
  btnErr: { backgroundColor: '#FEE2E2', paddingHorizontal: 10, paddingVertical: 6, borderRadius: theme.radius.pill },
  btnText: { fontSize: 11, fontWeight: '800', color: theme.colors.onSurface },
  empty: { textAlign: 'center', color: theme.colors.onSurfaceSecondary, padding: 40 },
});
