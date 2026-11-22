import { randomUUID } from 'expo-crypto';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { getLocal } from '@/data/local';
import { localDate } from '@/i18n';
import { catalog } from '@/inspection/catalog';
import { isAnswerable } from '@/inspection/form';
import { InspectionRow } from '@/inspection/model';
import { displayCode } from '@/inspection/review';
import { useSession, useT } from '@/session';
import { Frame } from '@/ui/Frame';
import { PixelButton, Screen, Sprite, Txt } from '@/ui/controls';
import { colors, space } from '@/ui/theme';

/**
 * Home, for now: who is signed in, "New inspection" and the inspections on the phone.
 * The real home (counters, drafts to continue, sync line) is built in F3e.
 */
export default function HomeScreen() {
  const { state, signOut, locale } = useSession();
  const tr = useT();
  const [rows, setRows] = useState<InspectionRow[]>([]);

  // Reload whenever the screen comes back into view (after the form, for example).
  useFocusEffect(
    useCallback(() => {
      let active = true;
      getLocal()
        .then((store) => store.listInspections())
        .then((list) => active && setRows(list));
      return () => {
        active = false;
      };
    }, []),
  );

  if (state.status !== 'signedIn') {
    return null;
  }
  const { profile, demo } = state;
  const firstName = profile.fullName.split(' ')[0];

  async function newInspection() {
    const store = await getLocal();
    const now = new Date();
    const created = await store.createInspection({
      id: randomUUID(),
      createdBy: profile.id,
      inspectorName: profile.fullName,
      today: localDate(now),
      now: now.toISOString(),
    });
    router.push({ pathname: '/inspection/[id]', params: { id: created.id } });
  }

  const unitLabel = (code: string | null) => catalog.unitTypes.find((u) => u.code === code)?.label[locale];

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

      <PixelButton label={tr('home.newInspection')} onPress={newInspection} />
      <PixelButton variant="secondary" label={tr('home.directory')} onPress={() => router.push('/directory')} />

      <Txt variant="label">{tr('home.inspections')}</Txt>
      {rows.length === 0 ? <Txt color={colors.textMuted}>{tr('home.empty')}</Txt> : null}
      {rows.map((row) => (
        <Pressable
          key={row.id}
          onPress={() => router.push({ pathname: '/inspection/[id]', params: { id: row.id } })}
          accessibilityRole="button"
        >
          <Frame name="card" padding={space.xs}>
            <View style={styles.rowTop}>
              <Txt variant="label">{displayCode(row.id)}</Txt>
              <Txt variant="small" color={row.status === 'draft' ? colors.warningText : colors.text}>
                {tr(`status.${row.status}`)}
              </Txt>
            </View>
            <Txt variant="small">
              {[row.summary.tripRef ?? tr('home.noReference'), unitLabel(row.summary.unitType), row.summary.inspectionDate]
                .filter(Boolean)
                .join(' · ')}
            </Txt>
          </Frame>
        </Pressable>
      ))}

      <Txt variant="small" color={colors.textMuted}>
        {tr('home.comingSoon')}{' '}
        {tr('home.formVersion', {
          version: catalog.version,
          questions: catalog.questions.filter(isAnswerable).length,
          steps: catalog.steps.length,
        })}
      </Txt>
      <PixelButton variant="secondary" label={demo ? tr('home.leaveDemo') : tr('home.signOut')} onPress={signOut} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  greeting: { gap: space.xs },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', gap: space.s },
});
