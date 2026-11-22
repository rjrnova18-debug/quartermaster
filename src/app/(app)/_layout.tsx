import { Stack } from 'expo-router';
import { View } from 'react-native';

import { useSession, useT } from '@/session';
import { DemoMarker } from '@/ui/controls';
import { colors } from '@/ui/theme';

/** The signed-in part of the app. In demo mode a "DEMO" tag stays on every screen. */
export default function AppLayout() {
  const { state } = useSession();
  const tr = useT();
  const demo = state.status === 'signedIn' && state.demo;

  return (
    <View style={{ flex: 1 }}>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }} />
      {demo ? <DemoMarker label={tr('demo.marker')} /> : null}
    </View>
  );
}
