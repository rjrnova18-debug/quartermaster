import { router, useLocalSearchParams } from 'expo-router';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useInspectionForm } from '@/form/useInspectionForm';
import { QuestionView } from '@/form/QuestionView';
import { StageMap } from '@/form/StageMap';
import { formatMoment, MessageKey } from '@/i18n';
import { catalog } from '@/inspection/catalog';
import { Problem, progress, visibleQuestions } from '@/inspection/form';
import { Locale } from '@/inspection/model';
import { displayCode } from '@/inspection/review';
import { useSession, useT } from '@/session';
import { Frame } from '@/ui/Frame';
import { Notice, PixelButton, Sprite, TextButton, Txt } from '@/ui/controls';
import { colors, space } from '@/ui/theme';

/** The inspection form (UI-BRIEF §5): one step at a time, saved as it is filled. */
export default function InspectionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const form = useInspectionForm(id);
  const { locale } = useSession();
  const tr = useT();

  if (form.loading) {
    return <SafeAreaView style={styles.screen} />;
  }
  if (!form.record) {
    return (
      <SafeAreaView style={[styles.screen, styles.padded]}>
        <Notice text={tr('form.notFound')} />
        <PixelButton variant="secondary" label={tr('form.backHome')} onPress={() => router.back()} />
      </SafeAreaView>
    );
  }

  const stepInfo = catalog.steps.find((s) => s.number === form.step);
  const stepProgress = progress(catalog, form.answers).steps.find((s) => s.step === form.step);
  const questions = visibleQuestions(catalog, form.answers, form.step);
  const problemText = (code: string) => {
    const problem = form.problemOf(code);
    return problem ? tr(`problem.${problem.reason}` as MessageKey) : null;
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {/* always visible: map, step title, progress */}
        <View style={styles.header}>
          <StageMap answers={form.answers} current={form.step} locale={locale} tr={tr} onPress={form.goTo} />
          <Txt variant="heading" accessibilityRole="header">
            {stepInfo?.title[locale]}
          </Txt>
          <Txt variant="small" color={colors.textMuted}>
            {stepProgress ? tr('form.progress', { answered: stepProgress.answered, total: stepProgress.total }) : ''}
            {form.editable ? `  ·  ${tr('form.savedOnPhone')}` : ''}
          </Txt>
        </View>

        <ScrollView contentContainerStyle={styles.questions} keyboardShouldPersistTaps="handled">
          <Banner form={form} tr={tr} locale={locale} />
          {questions.map((question) => (
            <QuestionView
              key={question.code}
              question={question}
              answer={form.answers[question.code]}
              problem={problemText(question.code)}
              locale={locale}
              editable={form.editable}
              tr={tr}
              onAnswer={(value) => form.setAnswer(question.code, value)}
              onNote={(note) => form.setNote(question.code, note)}
              media={form.media}
              onPickRecord={form.fillFromDirectory}
              canEditDirectory={form.canEditDirectory}
            />
          ))}
        </ScrollView>

        {/* always visible: the actions, within reach of the thumb */}
        <View style={styles.footer}>
          {form.refused ? (
            <Txt variant="small" color={colors.error} accessibilityLiveRegion="assertive">
              {tr('form.nextRefused')}
            </Txt>
          ) : null}
          <View style={styles.actions}>
            <PixelButton variant="secondary" label={tr('form.back')} onPress={form.goBack} style={styles.flex} />
            {form.isLastStep ? (
              form.editable && form.status === 'draft' ? (
                <PixelButton label={tr('form.complete')} onPress={form.requestComplete} style={styles.wide} />
              ) : null
            ) : (
              <PixelButton label={tr('form.next')} onPress={form.goNext} style={styles.wide} />
            )}
          </View>
          <TextButton label={tr('form.saveExit')} onPress={() => router.back()} />
        </View>
      </KeyboardAvoidingView>

      {form.panel ? <Overlay form={form} tr={tr} /> : null}
    </SafeAreaView>
  );
}

type Form = ReturnType<typeof useInspectionForm>;
type Tr = ReturnType<typeof useT>;

/** Completed, correction window, read-only or blocked correction. */
function Banner({ form, tr, locale }: { form: Form; tr: Tr; locale: Locale }) {
  if (form.status !== 'completed') return null;
  let detail: string | null = null;
  if (!form.editable) detail = tr('form.readOnly');
  else if (form.correctionBlocked) detail = tr('form.correctionBlocked');
  else if (form.correctableUntil) detail = tr('form.correctUntil', { time: formatMoment(form.correctableUntil, locale) });
  return (
    <Frame name="card" padding={space.xs}>
      <Txt variant="label">{tr('form.completedBanner')}</Txt>
      {detail ? <Txt variant="small">{detail}</Txt> : null}
    </Frame>
  );
}

/** The pending list, the verdict confirmation and the "quest cleared" moment. */
function Overlay({ form, tr }: { form: Form; tr: Tr }) {
  const { locale } = useSession();
  const labelOf = (problem: Problem) => catalog.questions.find((q) => q.code === problem.code)?.label[locale] ?? problem.code;

  const list = (problems: Problem[]) =>
    problems.map((problem) => (
      <Pressable
        key={`${problem.code}-${problem.reason}`}
        onPress={() => form.jumpTo(problem)}
        accessibilityRole="button"
        style={styles.pendingItem}
      >
        <Txt variant="small" style={styles.underline}>
          {`${problem.step} · ${labelOf(problem)}`}
        </Txt>
        <Txt variant="small" color={colors.textMuted}>
          {tr(`problem.${problem.reason}` as MessageKey)}
        </Txt>
      </Pressable>
    ));

  return (
    <View style={styles.overlay}>
      <Frame name="panel" padding={space.s} style={styles.sheet}>
        <ScrollView contentContainerStyle={styles.sheetContent}>
          {form.panel === 'blocking' ? (
            <>
              <Txt variant="heading">{tr('form.pendingTitle')}</Txt>
              <Txt>{tr('form.pendingBlocking')}</Txt>
              {list(form.pending.blocking)}
              <PixelButton variant="secondary" label={tr('form.goBack')} onPress={form.closePanel} />
            </>
          ) : null}
          {form.panel === 'warnings' ? (
            <>
              <Txt variant="heading">{tr('form.pendingTitle')}</Txt>
              <Txt>{tr('form.pendingWarnings')}</Txt>
              {list(form.pending.warnings)}
              <PixelButton label={tr('form.completeAnyway')} onPress={form.confirmVerdictOrComplete} />
              <PixelButton variant="secondary" label={tr('form.goBack')} onPress={form.closePanel} />
            </>
          ) : null}
          {form.panel === 'verdict' ? (
            <>
              <Txt>{tr('form.verdictReview')}</Txt>
              <PixelButton label={tr('form.verdictConfirm')} onPress={() => void form.complete()} />
              <PixelButton variant="secondary" label={tr('form.verdictRevise')} onPress={form.closePanel} />
            </>
          ) : null}
          {form.panel === 'cleared' && form.record ? (
            <>
              <Sprite name="yardScene" />
              <Txt variant="title" style={styles.center}>
                {tr('form.cleared')}
              </Txt>
              <Txt style={styles.center}>{tr('form.clearedBody', { code: displayCode(form.record.id) })}</Txt>
              <PixelButton label={tr('form.backHome')} onPress={() => router.back()} />
            </>
          ) : null}
        </ScrollView>
      </Frame>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  wide: { flex: 2 },
  center: { textAlign: 'center' },
  underline: { textDecorationLine: 'underline' },
  screen: { flex: 1, backgroundColor: colors.background },
  padded: { padding: space.m, gap: space.m },
  header: { paddingHorizontal: space.m, paddingTop: space.s, gap: space.xs },
  questions: { padding: space.m, gap: space.l, paddingBottom: space.xl },
  footer: { paddingHorizontal: space.m, paddingBottom: space.s, gap: space.xs, alignItems: 'stretch' },
  actions: { flexDirection: 'row', gap: space.s },
  overlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: colors.scrim,
    justifyContent: 'flex-end',
    padding: space.m,
  },
  sheet: { maxHeight: '85%' },
  sheetContent: { gap: space.m },
  pendingItem: { minHeight: 48, justifyContent: 'center' },
});
