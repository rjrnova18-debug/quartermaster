import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DirectoryList } from '@/directory/DirectoryViews';
import { DirectoryKind } from '@/directory/rules';
import { useSession, useT } from '@/session';
import { PixelButton, TextButton, Txt } from '@/ui/controls';
import { colors, space } from '@/ui/theme';

const KINDS: DirectoryKind[] = ['drivers', 'carriers', 'vehicles'];

/** The directory (UI-BRIEF §7): three tabs, search, add; supervisors also edit and delete. */
export default function DirectoryScreen() {
  const { state } = useSession();
  const tr = useT();
  const [kind, setKind] = useState<DirectoryKind>('drivers');
  const supervisor = state.status === 'signedIn' && state.profile.role === 'supervisor';

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <Txt variant="heading" accessibilityRole="header">
          {tr('directory.title')}
        </Txt>
        <View style={styles.tabs} accessibilityRole="tablist">
          {KINDS.map((k) => (
            <PixelButton
              key={k}
              variant={k === kind ? 'primary' : 'secondary'}
              label={tr(`directory.${k}`)}
              onPress={() => setKind(k)}
              style={styles.tab}
            />
          ))}
        </View>
      </View>
      <View style={styles.list}>
        {/* key: a new list (and a fresh search) for each tab */}
        <DirectoryList key={kind} kind={kind} tr={tr} canEdit={supervisor} />
      </View>
      <TextButton label={tr('form.backHome')} onPress={() => router.back()} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, paddingHorizontal: space.m, gap: space.s },
  header: { gap: space.s, paddingTop: space.s },
  tabs: { flexDirection: 'row', gap: space.xs },
  tab: { flex: 1 },
  list: { flex: 1 },
});
