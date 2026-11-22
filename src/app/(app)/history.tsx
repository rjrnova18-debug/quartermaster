import { useState } from 'react';
import { Share, StyleSheet, View } from 'react-native';

import { getLocal } from '@/data/local';
import { CardAction, InspectionCard } from '@/home/InspectionCard';
import { useInspections } from '@/home/useInspections';
import { localDate } from '@/i18n';
import { catalog } from '@/inspection/catalog';
import { buildReport, filterHistory, HistoryFilter, reportState, shareText } from '@/inspection/review';
import { openReport, REPORT_ACTION } from '@/report/generate';
import { useSession, useT } from '@/session';
import { PixelButton, Screen, TextButton, TextField, Txt } from '@/ui/controls';
import { colors, space } from '@/ui/theme';

const FILTERS: HistoryFilter[] = ['all', 'drafts', 'completed', 'today'];

/** History (UI-BRIEF §6, R5): search, four filters, and the actions on each inspection. */
export default function HistoryScreen() {
  const { locale } = useSession();
  const tr = useT();
  const list = useInspections();
  const [filter, setFilter] = useState<HistoryFilter>('all');
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  const shown = filterHistory(list.rows, filter, search, localDate());
  const byId = new Map(list.rows.map((row) => [row.id, row]));

  /** R9: the plain-text summary, through the phone's share sheet. */
  async function share(id: string) {
    const inspection = await (await getLocal()).getInspection(id);
    if (inspection) await Share.share({ message: shareText(buildReport(catalog, inspection, locale)) });
  }

  async function report(id: string) {
    const row = byId.get(id)!;
    setBusy(id);
    setFailed(null);
    try {
      await openReport(id, reportState(row), locale, tr);
    } catch {
      setFailed(id);
    } finally {
      setBusy(null);
      list.reload();
    }
  }

  return (
    <Screen>
      <Txt variant="heading" accessibilityRole="header">
        {tr('history.title')}
      </Txt>
      <TextField label={tr('history.search')} value={search} onChangeText={setSearch} autoCorrect={false} autoCapitalize="none" />
      <View style={styles.filters} accessibilityRole="tablist">
        {FILTERS.map((f) => (
          <PixelButton
            key={f}
            variant={f === filter ? 'primary' : 'secondary'}
            label={tr(`history.${f}`)}
            onPress={() => setFilter(f)}
            style={styles.filter}
          />
        ))}
      </View>

      {shown.length === 0 ? (
        <View style={styles.empty}>
          <Txt color={colors.textMuted}>{tr('history.empty')}</Txt>
          {search !== '' ? <TextButton label={tr('history.clearSearch')} onPress={() => setSearch('')} /> : null}
        </View>
      ) : null}

      {shown.map(({ id }) => {
        const row = byId.get(id)!;
        const reportAction = REPORT_ACTION[reportState(row)];
        return (
          <InspectionCard
            key={id}
            row={row}
            badge={list.demo ? null : list.badgeOf(id)}
            actions={
              <>
                {reportAction ? (
                  <CardAction label={busy === id ? tr('report.busy') : tr(reportAction)} onPress={() => (busy ? undefined : report(id))} />
                ) : null}
                <CardAction label={tr('history.share')} onPress={() => share(id)} />
                {failed === id ? <Txt variant="small" color={colors.error}>{tr('report.failed')}</Txt> : null}
                {list.canDelete(row) ? <CardAction label={tr('common.delete')} onPress={() => list.confirmDelete(row)} /> : null}
              </>
            }
          />
        );
      })}
    </Screen>
  );
}

const styles = StyleSheet.create({
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  filter: { flexGrow: 1 },
  empty: { gap: space.xs },
});
