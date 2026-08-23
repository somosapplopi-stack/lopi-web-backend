import { Stack, useRouter, useSegments, usePathname } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect, useRef } from "react";
import { LogBox, View, ActivityIndicator } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { useIconFonts } from "@/src/hooks/use-icon-fonts";
import { AuthProvider, useAuth } from "@/src/lib/auth";
import { bootstrapWebHead } from "@/src/lib/web-shell";

LogBox.ignoreAllLogs(true);

SplashScreen.preventAutoHideAsync();
bootstrapWebHead();

function RootNavigator() {
  const { user, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const pathname = usePathname();
  // Remember where the user was before we bounced them to /login (deep links).
  const pendingRoute = useRef<string | null>(null);

  useEffect(() => {
    if (loading) return;
    const inAuth = segments[0] === '(auth)';

    if (!user) {
      if (!inAuth) {
        // Preserve deep link target so we can restore it after login/register.
        if (pathname && pathname !== '/' && !pathname.startsWith('/(auth)')) {
          pendingRoute.current = pathname;
        }
        router.replace('/(auth)/login');
      }
      return;
    }

    // User is logged in
    if (!user.interests || user.interests.length < 5) {
      if (segments[segments.length - 1] !== 'interests') {
        router.replace('/(auth)/interests');
      }
      return;
    }

    if (inAuth) {
      const target = pendingRoute.current;
      pendingRoute.current = null;
      router.replace(target || '/(tabs)/home');
    }
  }, [user, loading, segments, router, pathname]);

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' }}>
        <ActivityIndicator size="large" color="#3B4CF6" />
      </View>
    );
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}

export default function RootLayout() {
  const [loaded, error] = useIconFonts();

  useEffect(() => {
    if (loaded || error) SplashScreen.hideAsync();
  }, [loaded, error]);

  if (!loaded && !error) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AuthProvider>
          <RootNavigator />
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
