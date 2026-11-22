/**
 * One question of the form, drawn according to its kind (UI-BRIEF §5). The catalog is
 * data, so this one component draws every question; adding a question to
 * questions.json needs no new screen code.
 */
import DateTimePicker from '@react-native-community/datetimepicker';
import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { Image, Modal, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { imageSource } from '@/data/files';
import { DirectoryPicker } from '@/directory/DirectoryViews';
import { DirectoryRecord, FIELDS } from '@/directory/rules';
import { MessageKey } from '@/i18n';
import { catalog } from '@/inspection/catalog';
import { isValidContainerNumber } from '@/inspection/form';
import { Answer, CheckValue, DirectoryName, Locale, Question } from '@/inspection/model';
import { displayValue } from '@/inspection/review';
import { FrameName, SPRITES } from '@/ui/assets.generated';
import { Frame } from '@/ui/Frame';
import { Notice, PixelButton, Sprite, TextButton, TextField, Txt } from '@/ui/controls';
import { colors, fonts, palette, space, TOUCH_TARGET } from '@/ui/theme';

import { SignaturePad } from './SignaturePad';
import { SIGNATURE_HEIGHT, SIGNATURE_WIDTH } from './signature';

interface Props {
  question: Question;
  answer: Answer | undefined;
  /** A problem to mark on the question, already in words. */
  problem: string | null;
  locale: Locale;
  editable: boolean;
  tr: (key: MessageKey, values?: Record<string, string | number>) => string;
  onAnswer: (value: string | null) => void;
  onNote: (note: string) => void;
  media: Media;
  onPickRecord: (directory: DirectoryName, record: DirectoryRecord) => void;
  canEditDirectory: boolean;
}

/** What photo and signature questions need from the form (useInspectionForm). */
export interface Media {
  uriOf: (attachmentId: string) => string | null;
  savedSignature: boolean;
  pickPhoto: (code: string, from: 'camera' | 'library') => Promise<MessageKey | null>;
  sign: (code: string, png: Uint8Array, keepAsMine: boolean) => Promise<void>;
  applySavedSignature: (code: string) => Promise<void>;
  remove: (code: string) => Promise<void>;
}

/** The inspector's own signature: the one that can reuse the saved signature. */
const OWN_SIGNATURE = 'INSPECTOR_SIGNATURE';

export function QuestionView(props: Props) {
  const { question, answer, problem, locale, tr } = props;
  if (question.kind === 'heading') {
    return (
      <Txt variant="heading" accessibilityRole="header" style={styles.heading}>
        {question.label[locale]}
      </Txt>
    );
  }
  const value = answer?.value ?? '';
  const failed = question.kind === 'check' && value === 'FAIL';

  return (
    <View style={styles.question}>
      <View style={styles.labelRow}>
        <Txt variant="label" style={styles.flex}>
          {question.label[locale]}
        </Txt>
        {question.requirement === 'required' ? (
          <Txt variant="small" color={colors.warningText}>
            {tr('form.required')}
          </Txt>
        ) : null}
      </View>
      <Control {...props} />
      <PickFromDirectory {...props} />
      {question.code === catalog.summary.containerNo && value.trim() !== '' && !isValidContainerNumber(value) ? (
        <Notice text={tr('form.containerHint')} />
      ) : null}
      {problem ? (
        <Txt variant="small" color={colors.error} accessibilityLiveRegion="polite">
          {problem}
        </Txt>
      ) : null}
      <NoteField {...props} needed={failed} />
    </View>
  );
}

function Control(props: Props) {
  switch (props.question.kind) {
    case 'check':
      return <Stamps {...props} />;
    case 'choice':
      return <Choices {...props} />;
    case 'unit_type':
      return <UnitTypes {...props} />;
    case 'date':
      return <DateField {...props} />;
    case 'number':
      return <NumberField {...props} />;
    case 'photo':
      return <PhotoControl {...props} />;
    case 'signature':
      return <SignatureControl {...props} />;
    default:
      return <PlainField {...props} />;
  }
}

// ---------------------------------------------------------------- check: three stamps

const STAMPS: { value: CheckValue; off: FrameName; on: FrameName; icon: keyof typeof SPRITES; ink: string }[] = [
  { value: 'PASS', off: 'stampPassOff', on: 'stampPassOn', icon: 'iconCheck', ink: palette.passDark },
  { value: 'FAIL', off: 'stampFailOff', on: 'stampFailOn', icon: 'iconCross', ink: palette.failDark },
  { value: 'NA', off: 'stampNaOff', on: 'stampNaOn', icon: 'iconDash', ink: palette.slateDark },
];

function Stamps({ question, answer, locale, editable, onAnswer }: Props) {
  return (
    <View style={styles.row} accessibilityRole="radiogroup">
      {STAMPS.map((stamp) => {
        const chosen = answer?.value === stamp.value;
        const word = displayValue(catalog, question, stamp.value, locale);
        return (
          <Pressable
            key={stamp.value}
            style={styles.flex}
            disabled={!editable}
            accessibilityRole="radio"
            accessibilityState={{ checked: chosen, disabled: !editable }}
            accessibilityLabel={word}
            onPress={() => {
              // Tapping the chosen stamp again clears it (UI-BRIEF §5).
              onAnswer(chosen ? null : stamp.value);
              if (!chosen) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            }}
          >
            <Frame name={chosen ? stamp.on : stamp.off} style={styles.stamp}>
              <View style={styles.stampInner}>
                <Sprite name={stamp.icon} />
                <Txt variant="label" color={chosen ? palette.paperLight : stamp.ink} style={styles.stampWord}>
                  {word.toUpperCase()}
                </Txt>
              </View>
            </Frame>
          </Pressable>
        );
      })}
    </View>
  );
}

// ---------------------------------------------------------------- choice and unit type

function ChoiceButton({ label, chosen, editable, onPress, children }: {
  label: string; chosen: boolean; editable: boolean; onPress: () => void; children?: React.ReactNode;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!editable}
      accessibilityRole="radio"
      accessibilityState={{ checked: chosen, disabled: !editable }}
      accessibilityLabel={label}
      style={styles.flex}
    >
      <Frame name={chosen ? 'chosen' : 'card'} style={styles.choice}>
        <View style={styles.choiceInner}>
          {children}
          <Txt variant="label" style={styles.center}>
            {label}
          </Txt>
        </View>
      </Frame>
    </Pressable>
  );
}

function Choices({ question, answer, locale, editable, onAnswer }: Props) {
  return (
    <View style={styles.row} accessibilityRole="radiogroup">
      {(question.options ?? []).map((option) => {
        const chosen = answer?.value === option.value;
        return (
          <ChoiceButton
            key={option.value}
            label={option.label[locale]}
            chosen={chosen}
            editable={editable}
            onPress={() => onAnswer(chosen ? null : option.value)}
          />
        );
      })}
    </View>
  );
}

function UnitTypes({ answer, locale, editable, onAnswer }: Props) {
  return (
    <View style={styles.column} accessibilityRole="radiogroup">
      {catalog.unitTypes.map((unitType) => {
        const chosen = answer?.value === unitType.code;
        const reefer = unitType.groups.includes('REEFER');
        return (
          <ChoiceButton
            key={unitType.code}
            label={unitType.label[locale]}
            chosen={chosen}
            editable={editable}
            onPress={() => onAnswer(chosen ? null : unitType.code)}
          >
            <Sprite name={reefer ? 'truckReefer' : 'truckDry'} />
          </ChoiceButton>
        );
      })}
    </View>
  );
}

// ---------------------------------------------------------------- typed answers

function PlainField({ question, answer, problem, locale, editable, onAnswer }: Props) {
  const keyboard = question.kind === 'digits' ? 'number-pad' : question.kind === 'number' ? 'decimal-pad' : 'default';
  return (
    <TextField
      label={question.label[locale]}
      hideLabel
      invalid={problem !== null}
      value={answer?.value ?? ''}
      onChangeText={(text) => onAnswer(text === '' ? null : text)}
      editable={editable}
      keyboardType={keyboard}
      autoCorrect={false}
    />
  );
}

function NumberField(props: Props) {
  const { answer, editable, onAnswer, tr } = props;
  const current = Number(answer?.value ?? '0');
  const step = (delta: number) => {
    const base = Number.isFinite(current) ? current : 0;
    onAnswer(String(Math.max(0, base + delta)));
  };
  return (
    <View style={styles.row}>
      <SmallButton label="−" hint={tr('form.less')} disabled={!editable} onPress={() => step(-1)} />
      <View style={styles.flex}>
        <PlainField {...props} />
      </View>
      <SmallButton label="+" hint={tr('form.more')} disabled={!editable} onPress={() => step(1)} />
    </View>
  );
}

function DateField({ answer, editable, onAnswer, tr }: Props) {
  const [picking, setPicking] = useState(false);
  const value = answer?.value ?? '';
  const [y, m, d] = value.split('-').map(Number);
  const asDate = value ? new Date(y, m - 1, d) : new Date();
  const toText = (date: Date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

  return (
    <View style={styles.row}>
      <Frame name="field" style={styles.flex}>
        <View style={styles.dateValue}>
          <Txt>{value || '—'}</Txt>
        </View>
      </Frame>
      {editable ? <TextButton label={tr('form.chooseDate')} onPress={() => setPicking(true)} /> : null}
      {editable ? <TextButton label={tr('form.today')} onPress={() => onAnswer(toText(new Date()))} /> : null}
      {picking ? (
        <DateTimePicker
          value={asDate}
          mode="date"
          onChange={(event, date) => {
            setPicking(false);
            if (event.type === 'set' && date) onAnswer(toText(date));
          }}
        />
      ) : null}
    </View>
  );
}

// ---------------------------------------------------------------- photo and signature

function PhotoControl({ question, answer, locale, editable, tr, media }: Props) {
  const [viewing, setViewing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const uri = answer?.value ? media.uriOf(answer.value) : null;

  async function pick(from: 'camera' | 'library') {
    setMessage(null);
    const problem = await media.pickPhoto(question.code, from);
    if (problem) setMessage(tr(problem));
  }

  return (
    <View style={styles.column}>
      {uri ? (
        <Pressable onPress={() => setViewing(true)} accessibilityRole="imagebutton" accessibilityLabel={tr('media.view')}>
          <Frame name="card">
            <Image source={imageSource(uri)} style={styles.thumb} resizeMode="cover" />
          </Frame>
        </Pressable>
      ) : null}
      <View style={styles.wrap}>
        {uri ? <TextButton label={tr('media.view')} onPress={() => setViewing(true)} /> : null}
        {editable ? <TextButton label={tr(uri ? 'media.replace' : 'media.takePhoto')} onPress={() => pick('camera')} /> : null}
        {editable ? <TextButton label={tr('media.choosePhoto')} onPress={() => pick('library')} /> : null}
        {editable && uri ? <TextButton label={tr('media.remove')} onPress={() => media.remove(question.code)} /> : null}
      </View>
      {message ? (
        <Txt variant="small" color={colors.error} accessibilityLiveRegion="polite">
          {message}
        </Txt>
      ) : null}
      {viewing && uri ? (
        <Modal animationType="fade" onRequestClose={() => setViewing(false)}>
          <SafeAreaView style={styles.viewer}>
            <Txt variant="heading">{question.label[locale]}</Txt>
            <Image source={imageSource(uri)} style={styles.full} resizeMode="contain" />
            <PixelButton variant="secondary" label={tr('media.close')} onPress={() => setViewing(false)} />
          </SafeAreaView>
        </Modal>
      ) : null}
    </View>
  );
}

function SignatureControl({ question, answer, locale, editable, tr, media }: Props) {
  const [signing, setSigning] = useState(false);
  const uri = answer?.value ? media.uriOf(answer.value) : null;
  const own = question.code === OWN_SIGNATURE;

  return (
    <View style={styles.column}>
      {uri ? (
        <Frame name="card">
          <Image source={imageSource(uri)} style={styles.signature} resizeMode="contain" accessibilityLabel={question.label[locale]} />
        </Frame>
      ) : null}
      {editable ? (
        <View style={styles.wrap}>
          <TextButton label={tr(uri ? 'media.signAgain' : 'media.sign')} onPress={() => setSigning(true)} />
          {own && media.savedSignature ? (
            <TextButton label={tr('media.useSaved')} onPress={() => media.applySavedSignature(question.code)} />
          ) : null}
          {uri ? <TextButton label={tr('media.remove')} onPress={() => media.remove(question.code)} /> : null}
        </View>
      ) : null}
      {signing ? (
        <SignaturePad
          title={question.label[locale]}
          tr={tr}
          canUseSaved={own && media.savedSignature}
          offerKeep={own}
          onCancel={() => setSigning(false)}
          onUseSaved={() => {
            setSigning(false);
            void media.applySavedSignature(question.code);
          }}
          onDone={(png, keep) => {
            setSigning(false);
            void media.sign(question.code, png, keep);
          }}
        />
      ) : null}
    </View>
  );
}

// ---------------------------------------------------------------- directory (F15)

/** Shown once per directory: on the question that holds the record's name or plate. */
function PickFromDirectory({ question, editable, tr, onPickRecord, canEditDirectory }: Props) {
  const [open, setOpen] = useState(false);
  const link = question.filledFrom;
  if (!link || !editable || FIELDS[link.directory][0].key !== link.field) return null;
  return (
    <>
      <TextButton label={tr('directory.pick')} onPress={() => setOpen(true)} />
      {open ? (
        <DirectoryPicker
          kind={link.directory}
          tr={tr}
          canEdit={canEditDirectory}
          onClose={() => setOpen(false)}
          onPick={(record) => {
            setOpen(false);
            onPickRecord(link.directory, record);
          }}
        />
      ) : null}
    </>
  );
}

// ---------------------------------------------------------------- notes

function NoteField({ question, answer, editable, onNote, tr, needed }: Props & { needed: boolean }) {
  const note = answer?.note ?? '';
  const [open, setOpen] = useState(note !== '');
  if (question.kind === 'photo' || question.kind === 'signature') return null;
  if (!needed && !open) {
    return editable ? <TextButton label={tr('form.addNote')} onPress={() => setOpen(true)} /> : null;
  }
  return (
    <TextField
      label={needed ? tr('form.noteForFail') : tr('form.note')}
      value={note}
      onChangeText={onNote}
      editable={editable}
      multiline
    />
  );
}

// ---------------------------------------------------------------- small parts

function SmallButton({ label, hint, disabled, onPress }: { label: string; hint: string; disabled: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={hint}>
      <Frame name="card" style={styles.small}>
        <View style={styles.smallInner}>
          <Txt variant="heading">{label}</Txt>
        </View>
      </Frame>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { textAlign: 'center' },
  heading: { marginTop: space.s },
  question: { gap: space.s },
  labelRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space.s },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.s },
  column: { gap: space.s },
  stamp: { minHeight: TOUCH_TARGET + 8 },
  stampInner: { alignItems: 'center', justifyContent: 'center', gap: space.xs, minHeight: 32 },
  stampWord: { fontFamily: fonts.pixel, textAlign: 'center' },
  choice: { minHeight: TOUCH_TARGET },
  choiceInner: { alignItems: 'center', justifyContent: 'center', gap: space.xs, minHeight: TOUCH_TARGET - 16 },
  dateValue: { minHeight: TOUCH_TARGET - 12, justifyContent: 'center' },
  small: { minWidth: TOUCH_TARGET, minHeight: TOUCH_TARGET },
  smallInner: { minHeight: TOUCH_TARGET - 16, alignItems: 'center', justifyContent: 'center' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', columnGap: space.m },
  thumb: { width: '100%', height: 160 },
  signature: { width: '100%', aspectRatio: SIGNATURE_WIDTH / SIGNATURE_HEIGHT },
  viewer: { flex: 1, backgroundColor: colors.background, padding: space.m, gap: space.m },
  full: { flex: 1, width: '100%' },
});
