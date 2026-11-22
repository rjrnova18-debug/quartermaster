import { randomUUID } from 'expo-crypto';
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { getLocal } from '@/data/local';
import { CardAction, InspectionCard } from '@/home/InspectionCard';
import { useInspections } from '@/home/useInspections';
import { localDate } from '@/i18n';
import { homeSummary } from '@/inspection/review';
import { useSession, useT } from '@/session';
import { Frame } from '@/ui/Frame';
import { PixelButton, Screen, Sprite, Txt } from '@/ui/controls';
import { colors, palette, space } from '@/ui/theme';

/**
 * Home (UI-BRIEF §4): greeting, today's numbers (R6), "New inspection", the drafts to
 * continue, the way to History, Directory and Profile, and the sync line.
 */
export default function HomeScreen() {
  const { state } = useSession();
  const tr = useT();
  const list = useInspections();
  if (state.status !== 'signedIn') return null;

  const { profile } = state;
  const summary = homeSummary(list.rows, localDate());
  const resume = summary.resume.map((r) => list.rows.find((row) => row.id === r.id)!);

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

  const sync = list.syncLine;
  const syncText = list.demo
    ? tr('sync.demo')
    : sync.kind === 'synced'
      ? tr('sync.allSynced')
      : tr(sync.kind === 'waiting' ? 'sync.waiting' : 'sync.attention', { count: sync.count });

  return (
    <Screen>
      <Sprite name="yardScene" />
      <Txt variant="heading" accessibilityRole="header">
        {tr('home.greeting', { name: profile.fullName.split(' ')[0] })}
      </Txt>

      <View style={styles.counters}>
        <Counter value={summary.inspectionsToday} label={tr('home.today')} />
        <Counter value={summary.draftsPending} label={tr('home.drafts')} />
      </View>

      <PixelButton label={tr('home.newInspection')} onPress={newInspection} style={styles.main} />

      <Txt variant="label">{tr('home.continue')}</Txt>
      {resume.length === 0 ? <Txt color={colors.textMuted}>{tr('home.noDrafts')}</Txt> : null}
      {resume.map((row) => (
        <InspectionCard
          key={row.id}
          row={row}
          badge={list.demo ? null : list.badgeOf(row.id)}
          showStep
          actions={list.canDelete(row) ? <CardAction label={tr('common.delete')} onPress={() => list.confirmDelete(row)} /> : null}
        />
      ))}

      <View style={styles.entries}>
        <PixelButton variant="secondary" label={tr('home.history')} onPress={() => router.push('/history')} style={styles.entry} />
        <PixelButton variant="secondary" label={tr('home.directory')} onPress={() => router.push('/directory')} style={styles.entry} />
        <PixelButton variant="secondary" label={tr('home.profile')} onPress={() => router.push('/profile')} style={styles.entry} />
      </View>

      <Txt
        variant="small"
        color={!list.demo && sync.kind === 'attention' ? colors.error : colors.textMuted}
        accessibilityLiveRegion="polite"
      >
        {syncText}
      </Txt>
    </Screen>
  );
}

function Counter({ value, label }: { value: number; label: string }) {
  return (
    <Frame name="panel" padding={space.xs} style={styles.counter}>
      <Txt variant="title" color={palette.orangeDark} style={styles.center}>
        {value}
      </Txt>
      <Txt variant="small" style={styles.center}>
        {label}
      </Txt>
    </Frame>
  );
}

const styles = StyleSheet.create({
  counters: { flexDirection: 'row', gap: space.s },
  counter: { flex: 1 },
  center: { textAlign: 'center' },
  main: { minHeight: 72 },
  entries: { flexDirection: 'row', flexWrap: 'wrap', gap: space.s },
  entry: { flexGrow: 1 },
});
