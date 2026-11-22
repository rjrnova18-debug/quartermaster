import { StyleSheet, View } from 'react-native';

import { catalog } from '@/inspection/catalog';
import { isAnswerable } from '@/inspection/form';
import { useSession, useT } from '@/session';
import { Frame } from '@/ui/Frame';
import { PixelButton, Screen, Sprite, Txt } from '@/ui/controls';
import { colors, space } from '@/ui/theme';

/**
 * Home, for now: who is signed in and a way out. The real home (counters, "New
 * inspection", drafts to continue, sync line) is built in F3e.
 */
export default function HomeScreen() {
  const { state, signOut } = useSession();
  const tr = useT();
  if (state.status !== 'signedIn') {
    return null;
  }
  const { profile, demo } = state;
  const firstName = profile.fullName.split(' ')[0];

  return (
    <Screen>
      <Sprite name="yardScene" />
      <View style={styles.greeting}>
        <Txt variant="heading" accessibilityRole="header">
          {tr('home.greeting', { name: firstName })}
        </Txt>
        <Txt color={colors.textMuted}>
          {profile.fullName} · {tr(`role.${profile.role}`)}
        </Txt>
      </View>

      <Frame name="card" padding={space.s}>
        <Txt>{tr('home.comingSoon')}</Txt>
        <Txt variant="small" color={colors.textMuted}>
          {tr('home.formVersion', {
            version: catalog.version,
            questions: catalog.questions.filter(isAnswerable).length,
            steps: catalog.steps.length,
          })}
        </Txt>
      </Frame>

      <View style={styles.spacer} />
      <PixelButton variant="secondary" label={demo ? tr('home.leaveDemo') : tr('home.signOut')} onPress={signOut} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  greeting: { gap: space.xs },
  spacer: { flex: 1 },
});
