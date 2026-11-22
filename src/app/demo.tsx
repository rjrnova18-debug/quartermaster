import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { DEMO_PEOPLE, DemoPersonKey } from '@/demo/demo-data';
import { useSession, useT } from '@/session';
import { Frame } from '@/ui/Frame';
import { PixelButton, Screen, Txt } from '@/ui/controls';
import { space } from '@/ui/theme';

/** The demo picker (ACCESS.md §1): be the inspector or the supervisor. No account needed. */
export default function DemoScreen() {
  const { startDemo } = useSession();
  const tr = useT();
  const nameOf = (key: DemoPersonKey) => DEMO_PEOPLE.find((p) => p.key === key)!.fullName;

  return (
    <Screen>
      <Txt variant="heading" accessibilityRole="header">
        {tr('demo.title')}
      </Txt>
      <Txt>{tr('demo.body')}</Txt>

      <Frame name="card" padding={space.s}>
        <View style={styles.choice}>
          <PixelButton label={tr('demo.inspector')} onPress={() => startDemo('sam')} />
          <Txt variant="small">{tr('demo.inspectorHint', { name: nameOf('sam') })}</Txt>
        </View>
      </Frame>

      <Frame name="card" padding={space.s}>
        <View style={styles.choice}>
          <PixelButton label={tr('demo.supervisor')} onPress={() => startDemo('robin')} />
          <Txt variant="small">{tr('demo.supervisorHint', { name: nameOf('robin') })}</Txt>
        </View>
      </Frame>

      <PixelButton variant="secondary" label={tr('demo.back')} onPress={() => router.back()} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  choice: { gap: space.s },
});
