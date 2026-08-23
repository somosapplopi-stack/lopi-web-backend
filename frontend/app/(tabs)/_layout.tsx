import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Platform, StyleSheet, View } from 'react-native';
import { theme } from '@/src/theme';

function CenterPlus({ focused }: { focused: boolean }) {
  return (
    <View style={styles.plusOuter}>
      <LinearGradient colors={[theme.colors.brandPrimary, theme.colors.brandSecondary]} style={styles.plusInner}>
        <Ionicons name="add" size={30} color="#fff" />
      </LinearGradient>
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.colors.brandPrimary,
        tabBarInactiveTintColor: '#A0AEC0',
        tabBarStyle: {
          height: Platform.OS === 'ios' ? 84 : 68,
          paddingTop: 8,
          paddingBottom: Platform.OS === 'ios' ? 24 : 10,
          borderTopWidth: 1, borderTopColor: theme.colors.divider,
          backgroundColor: '#fff',
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '700' },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{ title: 'Inicio', tabBarIcon: ({ color }) => <Ionicons name="home" size={22} color={color} /> }}
      />
      <Tabs.Screen
        name="explore"
        options={{ title: 'Explorar', tabBarIcon: ({ color }) => <Ionicons name="search" size={22} color={color} /> }}
      />
      <Tabs.Screen
        name="create"
        options={{
          title: '',
          tabBarIcon: ({ focused }) => <CenterPlus focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="my-parches"
        options={{ title: 'Mis Parches', tabBarIcon: ({ color }) => <Ionicons name="calendar" size={22} color={color} /> }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: 'Perfil', tabBarIcon: ({ color }) => <Ionicons name="person" size={22} color={color} /> }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  plusOuter: {
    width: 56, height: 56, borderRadius: 999, alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#fff', marginTop: -18,
    shadowColor: '#3B4CF6', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 8, elevation: 5,
  },
  plusInner: { width: 48, height: 48, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
});
