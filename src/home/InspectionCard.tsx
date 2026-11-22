/**
 * One inspection in a list (Home "Continue" and History, UI-BRIEF §4 and §6): display code,
 * reference, unit type and date, status in words, verdict and sync badge, plus actions.
 */
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { LocalRow } from '@/data/local';
import { catalog } from '@/inspection/catalog';
import { displayCode } from '@/inspection/review';
import { SyncBadge } from '@/inspection/sync';
import { useSession, useT } from '@/session';
import { Frame } from '@/ui/Frame';
import { TextButton, Txt } from '@/ui/controls';
import { colors, palette, space } from '@/ui/theme';

const BADGE_COLOUR: Record<SyncBadge, string> = {
  synced: palette.passDark,
  pending: palette.amberDark,
  failed: palette.amberDark,
  conflict: palette.failDark,
};

interface Props {
  row: LocalRow;
  /** Null in the demo: nothing is ever sent, so there is no badge. */
  badge: SyncBadge | null;
  /** "Step 4" for drafts on Home. */
  showStep?: boolean;
  actions?: React.ReactNode;
}

export function InspectionCard({ row, badge, showStep = false, actions }: Props) {
  const { locale } = useSession();
  const tr = useT();
  const open = () => router.push({ pathname: '/inspection/[id]', params: { id: row.id } });
  const unit = catalog.unitTypes.find((u) => u.code === row.summary.unitType)?.label[locale];
  const verdictQuestion = catalog.questions.find((q) => q.code === catalog.summary.verdict);
  const verdict = verdictQuestion?.options?.find((o) => o.value === row.summary.verdict)?.label[locale];
  const details = [
    row.summary.tripRef ?? tr('home.noReference'),
    unit,
    row.summary.inspectionDate,
    row.summary.truckPlate,
    row.summary.driverName,
  ].filter(Boolean);

  return (
    <Frame name="card" padding={space.xs}>
      <Pressable onPress={open} accessibilityRole="button" accessibilityLabel={`${displayCode(row.id)}, ${details.join(', ')}`}>
        <View style={styles.top}>
          <Txt variant="label">{displayCode(row.id)}</Txt>
          <Txt variant="small" color={row.status === 'draft' ? colors.warningText : colors.text}>
            {showStep && row.status === 'draft' ? tr('home.step', { number: row.currentStep }) : tr(`status.${row.status}`)}
          </Txt>
        </View>
        <Txt variant="small">{details.join(' · ')}</Txt>
        <View style={styles.top}>
          {verdict ? (
            <Txt variant="label" color={row.summary.verdict === 'FIT' ? palette.passDark : palette.failDark}>
              {verdict.toUpperCase()}
            </Txt>
          ) : (
            <View />
          )}
          {badge ? (
            <Txt variant="small" color={BADGE_COLOUR[badge]}>
              {tr(`sync.${badge}`)}
            </Txt>
          ) : null}
        </View>
      </Pressable>
      {actions ? <View style={styles.actions}>{actions}</View> : null}
    </Frame>
  );
}

export { TextButton as CardAction };

const styles = StyleSheet.create({
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space.s },
  actions: { flexDirection: 'row', flexWrap: 'wrap', columnGap: space.m },
});
