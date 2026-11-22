/**
 * The inspections on the phone and the outbox, for Home and History. Reloaded every time
 * the screen comes back into view (after the form, for example).
 */
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert } from 'react-native';

import { deleteFile } from '@/data/files';
import { getLocal, LocalMode, LocalRow } from '@/data/local';
import { displayCode } from '@/inspection/review';
import { needsAttention, OutboxOp, syncBadge } from '@/inspection/sync';
import { useSession, useT } from '@/session';
import { useSync } from '@/sync';

import { canDeleteInspection, syncLine } from './rules';

export function useInspections() {
  const { state } = useSession();
  const tr = useT();
  const [rows, setRows] = useState<LocalRow[]>([]);
  const [outbox, setOutbox] = useState<OutboxOp[]>([]);
  const [mode, setMode] = useState<LocalMode | null>(null);

  const load = useCallback(async () => {
    const store = await getLocal();
    const [list, notes, current] = await Promise.all([store.listInspections(), store.outbox(), store.getMode()]);
    setRows(list);
    setOutbox(notes);
    setMode(current);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  // After every sync cycle, too: new copies may have arrived.
  const { subscribe } = useSync();
  useEffect(() => subscribe(() => void load()), [subscribe, load]);

  const user = state.status === 'signedIn' ? state.profile : null;

  /** Asks first, naming exactly what goes (UI-BRIEF §9), then deletes rows, notes and files. */
  function confirmDelete(row: LocalRow) {
    const reference = row.summary.tripRef ?? tr('home.noReference');
    Alert.alert(tr('history.deleteTitle'), tr('history.deleteBody', { code: displayCode(row.id), reference }), [
      { text: tr('common.cancel'), style: 'cancel' },
      {
        text: tr('common.delete'),
        style: 'destructive',
        onPress: async () => {
          const store = await getLocal();
          const files = await store.deleteInspection(row.id, new Date().toISOString());
          files.forEach(deleteFile);
          await load();
        },
      },
    ]);
  }

  return {
    rows,
    demo: mode === 'demo',
    syncLine: syncLine(outbox),
    badgeOf: (id: string) => syncBadge(outbox, id),
    canDelete: (row: LocalRow) => user !== null && canDeleteInspection(row, user),
    confirmDelete,
    reload: load,
    /** S8: the notes a person has to look at. */
    attention: outbox.filter(needsAttention),
    unsent: outbox.length,
  };
}
