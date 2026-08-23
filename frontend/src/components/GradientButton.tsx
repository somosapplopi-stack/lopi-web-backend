import { LinearGradient } from 'expo-linear-gradient';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { theme } from '@/src/theme';

export function GradientButton({
  title, onPress, disabled, loading, style, testID, icon,
}: {
  title: string; onPress: () => void; disabled?: boolean; loading?: boolean;
  style?: ViewStyle; testID?: string; icon?: React.ReactNode;
}) {
  return (
    <Pressable testID={testID} onPress={onPress} disabled={disabled || loading} style={[{ borderRadius: theme.radius.pill, overflow: 'hidden' }, style]}>
      <LinearGradient
        colors={disabled ? ['#B0B7C3', '#B0B7C3'] : [theme.colors.brandPrimary, theme.colors.brandSecondary]}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={styles.btn}
      >
        {loading ? <ActivityIndicator color="#fff" /> : (
          <View style={styles.row}>
            {icon}
            <Text style={styles.text}>{title}</Text>
          </View>
        )}
      </LinearGradient>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: { paddingVertical: 14, paddingHorizontal: 20, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  text: { color: '#fff', fontWeight: '800', fontSize: 15, letterSpacing: 0.2 },
});
