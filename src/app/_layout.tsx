import { Stack } from 'expo-router';

/**
 * Root layout: wraps every screen of the app.
 * A Stack shows one screen at a time and keeps the previous ones underneath,
 * so the system back button returns to them.
 */
export default function RootLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
