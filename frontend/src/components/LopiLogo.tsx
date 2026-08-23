import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, Text, View } from 'react-native';
import { theme } from '@/src/theme';

export function LopiLogo({ size = 48 }: { size?: number }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <Text style={[styles.text, { fontSize: size }]}>Lopi</Text>
      <LinearGradient
        colors={[theme.colors.brandPrimary, theme.colors.brandSecondary]}
        style={[styles.dot, { width: size * 0.24, height: size * 0.24, borderRadius: 999, marginLeft: 2, marginTop: -size * 0.2 }]}
      >
        <View style={[styles.eye, { width: size * 0.06, height: size * 0.06 }]} />
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  text: {
    fontWeight: '900',
    color: theme.colors.brandPrimary,
    letterSpacing: -1,
    fontFamily: 'System',
  },
  dot: { alignItems: 'center', justifyContent: 'center' },
  eye: { backgroundColor: '#fff', borderRadius: 999 },
});
