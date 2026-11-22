/**
 * One question of the form, drawn according to its kind (UI-BRIEF §5). The catalog is
 * data, so this one component draws every question; adding a question to
 * questions.json needs no new screen code.
 */
import DateTimePicker from '@react-native-community/datetimepicker';
import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { MessageKey } from '@/i18n';
import { catalog } from '@/inspection/catalog';
import { isValidContainerNumber } from '@/inspection/form';
import { Answer, CheckValue, Locale, Question } from '@/inspection/model';
import { displayValue } from '@/inspection/review';
import { FrameName, SPRITES } from '@/ui/assets.generated';
import { Frame } from '@/ui/Frame';
import { Notice, Sprite, TextButton, TextField, Txt } from '@/ui/controls';
import { colors, fonts, palette, space, TOUCH_TARGET } from '@/ui/theme';

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
}

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
    case 'signature':
      return <AttachmentPlaceholder {...props} />;
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

function AttachmentPlaceholder({ answer, tr }: Props) {
  return answer?.value ? (
    <View style={styles.row}>
      <Sprite name="iconCheck" />
      <Txt>{tr('form.attached')}</Txt>
    </View>
  ) : (
    <Txt variant="small" color={colors.textMuted}>
      {tr('form.photosLater')}
    </Txt>
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
});
