export const theme = {
  colors: {
    surface: '#FFFFFF',
    onSurface: '#1A1D24',
    surfaceSecondary: '#F5F7FA',
    onSurfaceSecondary: '#4A5568',
    surfaceTertiary: '#EDF0FF',
    onSurfaceTertiary: '#3B4CF6',
    surfaceInverse: '#1A1D24',
    onSurfaceInverse: '#FFFFFF',
    brand: '#3B4CF6',
    brandPrimary: '#3B4CF6',
    brandSecondary: '#6B4EE6',
    onBrandPrimary: '#FFFFFF',
    onBrandSecondary: '#FFFFFF',
    brandTertiary: '#EDF0FF',
    onBrandTertiary: '#3B4CF6',
    border: '#E2E8F0',
    borderStrong: '#3B4CF6',
    divider: '#EDF2F7',
    success: '#38A169',
    error: '#E53E3E',
    warning: '#DD6B20',
    muted: '#94A3B8',
  },
  spacing: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 },
  radius: { sm: 6, md: 12, lg: 20, pill: 999 },
  font: {
    display: 'System',
    text: 'System',
  },
  shadow: {
    card: {
      shadowColor: '#3B4CF6',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.08,
      shadowRadius: 12,
      elevation: 3,
    },
  },
};

export const gradient = ['#3B4CF6', '#6B4EE6'] as const;
