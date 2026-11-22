/**
 * The directory as views (UI-BRIEF §7): a searchable list with "Add new", and the short
 * form to add or edit a record. Used by the Directory screen and, as a picker, by the
 * inspection form, which then fills its questions from the chosen record (F15).
 */
import { randomUUID } from 'expo-crypto';
import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getLocal } from '@/data/local';
import { MessageKey } from '@/i18n';
import { Frame } from '@/ui/Frame';
import { Notice, PixelButton, TextField, Txt } from '@/ui/controls';
import { colors, space, TOUCH_TARGET } from '@/ui/theme';

import { DirectoryKind, DirectoryRecord, FIELDS, recordDetail, RecordProblem, recordProblems, recordTitle, searchRecords } from './rules';

type Tr = (key: MessageKey, values?: Record<string, string | number>) => string;

const emptyRecord = (kind: DirectoryKind): DirectoryRecord => {
  const record: DirectoryRecord = { id: randomUUID() };
  for (const spec of FIELDS[kind]) record[spec.key] = '';
  return record;
};

// ---------------------------------------------------------------- list

interface BrowserProps {
  kind: DirectoryKind;
  tr: Tr;
  /** Inspectors may add; only supervisors edit and delete (ACCESS.md). */
  canEdit: boolean;
  /** In the form: tapping a record chooses it instead of editing it. */
  onPick?: (record: DirectoryRecord) => void;
}

export function DirectoryBrowser({ kind, tr, canEdit, onPick }: BrowserProps) {
  const [records, setRecords] = useState<DirectoryRecord[]>([]);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<DirectoryRecord | null>(null);
  const [version, setVersion] = useState(0); // bumped after a save to reload the list

  useEffect(() => {
    let active = true;
    getLocal()
      .then((store) => store.listDirectory(kind))
      .then((list) => active && setRecords(list));
    return () => {
      active = false;
    };
  }, [kind, version]);

  if (editing) {
    return (
      <RecordForm
        kind={kind}
        tr={tr}
        initial={editing}
        others={records}
        canDelete={canEdit && records.some((r) => r.id === editing.id)}
        onDone={(saved) => {
          setEditing(null);
          setVersion((v) => v + 1);
          if (saved && onPick) onPick(saved); // "Add new" from the form fills the questions at once
        }}
        onChoose={onPick}
      />
    );
  }

  const shown = searchRecords(kind, records, search);
  return (
    <View style={styles.gap}>
      <TextField label={tr('directory.search')} value={search} onChangeText={setSearch} autoCorrect={false} />
      <PixelButton variant="secondary" label={tr('directory.add')} onPress={() => setEditing(emptyRecord(kind))} />
      {shown.length === 0 ? <Txt color={colors.textMuted}>{tr('directory.empty')}</Txt> : null}
      {shown.map((record) => {
        const action = onPick ? () => onPick(record) : canEdit ? () => setEditing(record) : undefined;
        return (
          <Pressable key={record.id} onPress={action} disabled={!action} accessibilityRole={action ? 'button' : 'text'}>
            <Frame name="card" padding={space.xs}>
              <View style={styles.row}>
                <Txt variant="label">{recordTitle(kind, record)}</Txt>
              </View>
              {recordDetail(kind, record) ? <Txt variant="small">{recordDetail(kind, record)}</Txt> : null}
            </Frame>
          </Pressable>
        );
      })}
      {!onPick && !canEdit ? <Txt variant="small" color={colors.textMuted}>{tr('directory.readOnly')}</Txt> : null}
    </View>
  );
}

// ---------------------------------------------------------------- add and edit

interface FormProps {
  kind: DirectoryKind;
  tr: Tr;
  initial: DirectoryRecord;
  others: DirectoryRecord[];
  canDelete: boolean;
  /** Called with the saved record, or null when cancelled or deleted. */
  onDone: (saved: DirectoryRecord | null) => void;
  /** In the form, a duplicate can be chosen instead of being added again. */
  onChoose?: (record: DirectoryRecord) => void;
}

function RecordForm({ kind, tr, initial, others, canDelete, onDone, onChoose }: FormProps) {
  const [record, setRecord] = useState(initial);
  const [problems, setProblems] = useState<RecordProblem[]>([]);

  const problemOf = (key: string) => {
    const problem = problems.find((p) => p.field === key);
    if (!problem) return null;
    if (problem.reason === 'duplicate') return tr('directory.duplicate', { name: recordTitle(kind, problem.existing) });
    return tr(`problem.${problem.reason}`);
  };
  const duplicate = problems.find((p) => p.reason === 'duplicate');

  async function save() {
    const found = recordProblems(kind, record, others);
    setProblems(found);
    if (found.length > 0) return;
    const store = await getLocal();
    onDone(await store.saveDirectoryRecord(kind, record, new Date().toISOString()));
  }

  async function remove() {
    const store = await getLocal();
    await store.deleteDirectoryRecord(kind, record.id, new Date().toISOString());
    onDone(null);
  }

  return (
    <View style={styles.gap}>
      {FIELDS[kind].map((spec) => (
        <TextField
          key={spec.key}
          label={`${tr(`field.${spec.key}` as MessageKey)}${spec.required ? ` · ${tr('form.required')}` : ''}`}
          value={record[spec.key]}
          onChangeText={(text) => setRecord((current) => ({ ...current, [spec.key]: text }))}
          error={problemOf(spec.key)}
          keyboardType={spec.digits ? 'number-pad' : 'default'}
          autoCapitalize={spec.plate ? 'characters' : 'words'}
          autoCorrect={false}
        />
      ))}
      {duplicate && duplicate.reason === 'duplicate' && onChoose ? (
        <PixelButton variant="secondary" label={tr('directory.useExisting')} onPress={() => onChoose(duplicate.existing)} />
      ) : null}
      <PixelButton label={tr('directory.save')} onPress={save} />
      <PixelButton variant="secondary" label={tr('directory.cancel')} onPress={() => onDone(null)} />
      {canDelete ? (
        <>
          <Notice text={tr('directory.deleteNote')} />
          <PixelButton variant="secondary" label={tr('directory.delete')} onPress={remove} />
        </>
      ) : null}
    </View>
  );
}

// ---------------------------------------------------------------- picker for the form

export function DirectoryPicker({ kind, tr, canEdit, onPick, onClose }: {
  kind: DirectoryKind; tr: Tr; canEdit: boolean; onPick: (record: DirectoryRecord) => void; onClose: () => void;
}) {
  return (
    <Modal animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.modal}>
        <Txt variant="heading" accessibilityRole="header">{tr(`directory.${kind}`)}</Txt>
        <View style={styles.flex}>
          <DirectoryList kind={kind} tr={tr} canEdit={canEdit} onPick={onPick} />
        </View>
        <PixelButton variant="secondary" label={tr('directory.cancel')} onPress={onClose} />
      </SafeAreaView>
    </Modal>
  );
}

/** The browser inside a scroll view, for screens and the picker. */
export function DirectoryList(props: BrowserProps) {
  return (
    <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
      <DirectoryBrowser {...props} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  gap: { gap: space.m },
  row: { flexDirection: 'row', justifyContent: 'space-between', minHeight: TOUCH_TARGET - 24 },
  modal: { flex: 1, backgroundColor: colors.background, padding: space.m, gap: space.m },
  scroll: { paddingBottom: space.xl },
});
