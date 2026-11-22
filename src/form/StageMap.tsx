/**
 * The steps as stages on a path (UI-BRIEF §2, D3): done (tick), current (orange and
 * larger), to do (its number) and "does not apply" (dotted: skipped, not locked).
 * Tapping a stage jumps there; the form decides whether the jump is allowed (F4, F10).
 */
import { Image, Pressable, StyleSheet, View } from 'react-native';

import { MessageKey } from '@/i18n';
import { catalog } from '@/inspection/catalog';
import { applicableSteps, progress } from '@/inspection/form';
import { AnswerSet, Locale } from '@/inspection/model';
import { SPRITES } from '@/ui/assets.generated';
import { Txt } from '@/ui/controls';
import { colors, palette, PIXEL } from '@/ui/theme';

type StageState = 'done' | 'current' | 'todo' | 'skip';

const NODE = {
  done: SPRITES.nodeDone,
  current: SPRITES.nodeCurrent,
  todo: SPRITES.nodeTodo,
  skip: SPRITES.nodeSkip,
} as const;

interface Props {
  answers: AnswerSet;
  current: number;
  locale: Locale;
  tr: (key: MessageKey, values?: Record<string, string | number>) => string;
  onPress: (step: number) => void;
}

export function StageMap({ answers, current, locale, tr, onPress }: Props) {
  const applicable = applicableSteps(catalog, answers);
  const answered = progress(catalog, answers).steps;

  const stateOf = (step: number): StageState => {
    if (step === current) return 'current';
    if (!applicable.includes(step)) return 'skip';
    const p = answered.find((s) => s.step === step);
    return p && p.total > 0 && p.answered === p.total ? 'done' : 'todo';
  };

  return (
    <View style={styles.map}>
      <View style={styles.path} />
      {catalog.steps.map(({ number, title }) => {
        const state = stateOf(number);
        const sprite = NODE[state];
        return (
          <Pressable
            key={number}
            style={styles.stage}
            disabled={state === 'skip' || state === 'current'}
            onPress={() => onPress(number)}
            accessibilityRole="button"
            accessibilityState={{ selected: state === 'current', disabled: state === 'skip' }}
            accessibilityLabel={tr('stage.label', { number, title: title[locale], state: tr(`stage.${state}`) })}
          >
            <Image source={sprite.source} style={{ width: sprite.width * PIXEL, height: sprite.height * PIXEL }} />
            {state === 'todo' || state === 'current' ? (
              <Txt variant="label" color={colors.text} style={styles.number}>
                {number}
              </Txt>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  map: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  path: { position: 'absolute', left: 16, right: 16, height: PIXEL * 2, backgroundColor: palette.metal },
  stage: { minWidth: 44, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  number: { position: 'absolute', fontWeight: 'normal' },
});
