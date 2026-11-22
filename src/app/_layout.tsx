import { AtkinsonHyperlegible_400Regular, AtkinsonHyperlegible_700Bold } from '@expo-google-fonts/atkinson-hyperlegible';
import { DotGothic16_400Regular } from '@expo-google-fonts/dotgothic16';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';

import { SessionProvider, useSession } from '@/session';
import { colors } from '@/ui/theme';

// Keep the splash screen until the fonts and the saved session are ready.
SplashScreen.preventAutoHideAsync();

/**
 * Root layout: wraps every screen of the app.
 *
 * Stack.Protected decides which screens exist: signed in, only the app group; signed
 * out, only the sign-in screen and the demo picker. When the session changes, Expo
 * Router moves to a screen that exists, so no screen has to redirect by hand.
 */
export default function RootLayout() {
  const [fontsLoaded] = useFonts({ DotGothic16_400Regular, AtkinsonHyperlegible_400Regular, AtkinsonHyperlegible_700Bold });
  return (
    <SessionProvider>
      <Routes fontsLoaded={fontsLoaded} />
    </SessionProvider>
  );
}

function Routes({ fontsLoaded }: { fontsLoaded: boolean }) {
  const { state } = useSession();
  const ready = fontsLoaded && state.status !== 'loading';

  useEffect(() => {
    if (ready) {
      SplashScreen.hideAsync();
    }
  }, [ready]);

  if (!ready) {
    return null;
  }
  const signedIn = state.status === 'signedIn';
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
      <Stack.Protected guard={signedIn}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="sign-in" />
        <Stack.Screen name="demo" options={{ presentation: 'modal' }} />
      </Stack.Protected>
    </Stack>
  );
}
