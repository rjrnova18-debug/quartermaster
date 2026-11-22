/**
 * Everything the inspection form screen needs, as one hook: the answers, the current
 * step, saving, and the rules for moving and completing. The screen only draws.
 *
 * Saving: 500 ms after the last change, and at once when the step changes, the form is
 * left or the app goes to the background. A draft is always saved as it is. A completed
 * inspection being corrected is saved only while it still meets the completion rules.
 */
import { randomUUID } from 'expo-crypto';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { deleteFile, downloadAttachment, hasSavedSignature, keepAsSavedSignature, readSavedSignature, storePhoto, storeSignature } from '@/data/files';
import { isServerConfigured, signedUrl } from '@/data/remote';
import { getLocal, LocalAttachment, LocalInspection } from '@/data/local';
import { MessageKey } from '@/i18n';
import { catalog } from '@/inspection/catalog';
import {
  applyDirectoryRecord,
  applicableSteps,
  canComplete,
  canEditInspection,
  CORRECTION_WINDOW_HOURS,
  nextStep,
  pendingProblems,
  previousStep,
  Problem,
  stepProblems,
} from '@/inspection/form';
import { AnswerSet, DirectoryName, InspectionStatus } from '@/inspection/model';
import { DirectoryRecord } from '@/directory/rules';
import { verdictNeedsReview } from '@/inspection/review';
import { useSession } from '@/session';

const AUTOSAVE_MS = 500;

/** What the panel over the form is showing, if anything. */
export type Panel = null | 'blocking' | 'warnings' | 'verdict' | 'cleared';

/**
 * Photos and signatures made on another phone are downloaded the first time they are
 * needed. Returns the attachments as they are afterwards.
 */
async function fetchMissing(inspectionId: string, list: LocalAttachment[]): Promise<LocalAttachment[]> {
  const missing = list.filter((a) => !a.localUri && a.storagePath);
  if (!isServerConfigured() || missing.length === 0) return list;
  const store = await getLocal();
  for (const a of missing) {
    try {
      const url = await signedUrl(a.storagePath as string);
      if (url) await store.setAttachmentFile(a.id, await downloadAttachment(url, a.storagePath as string, inspectionId, a.id));
    } catch {
      // offline or gone: the question shows no picture; the report says "not available offline"
    }
  }
  return store.listAttachments(inspectionId);
}

export function useInspectionForm(id: string) {
  const { state } = useSession();
  const profile = state.status === 'signedIn' ? state.profile : null;

  const [record, setRecord] = useState<LocalInspection | null | undefined>(undefined); // undefined while loading
  const [answers, setAnswers] = useState<AnswerSet>({});
  const [step, setStep] = useState(1);
  const [status, setStatus] = useState<InspectionStatus>('draft');
  const [revealedSteps, setRevealedSteps] = useState<number[]>([]); // steps whose problems are shown
  const [panel, setPanel] = useState<Panel>(null);
  const [refused, setRefused] = useState(false);
  const [attachments, setAttachments] = useState<LocalAttachment[]>([]);

  // ---------------------------------------------------------------- load

  useEffect(() => {
    let active = true;
    getLocal()
      .then(async (store) => {
        const found = await store.getInspection(id);
        if (found && active) {
          const list = await store.listAttachments(id);
          setAttachments(list);
          fetchMissing(id, list).then((next) => active && setAttachments(next));
        }
        return found;
      })
      .then((found) => {
        if (!active) return;
        setRecord(found);
        if (found) {
          setAnswers(found.answers);
          setStatus(found.status);
          const steps = applicableSteps(catalog, found.answers);
          setStep(steps.includes(found.currentStep) ? found.currentStep : steps[0] ?? 1);
        }
      });
    return () => {
      active = false;
    };
  }, [id]);

  const editable =
    record != null &&
    profile != null &&
    canEditInspection({ status, createdBy: record.createdBy, completedAt: record.completedAt }, profile, new Date().toISOString());
  const correctionBlocked = editable && status === 'completed' && !canComplete(catalog, answers);

  // ---------------------------------------------------------------- saving

  // The latest values, for saves that run after the screen has moved on (leaving, background).
  const latest = useRef({ answers, step, status, editable });
  useEffect(() => {
    latest.current = { answers, step, status, editable };
  });

  async function save(override?: Partial<{ step: number; status: InspectionStatus }>) {
    const values = { ...latest.current, ...override };
    if (!values.editable) return;
    if (values.status === 'completed' && !canComplete(catalog, values.answers)) return; // F11 again for corrections
    const store = await getLocal();
    await store.saveInspection(id, { answers: values.answers, currentStep: values.step, status: values.status }, new Date().toISOString());
  }

  useEffect(() => {
    if (record == null) return;
    const timer = setTimeout(() => void save(), AUTOSAVE_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- save reads `latest`; only changes should restart the timer
  }, [answers, record]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      if (next !== 'active') void save();
    });
    return () => {
      subscription.remove();
      void save(); // leaving the form: nothing is lost
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once; save reads `latest`
  }, []);

  // ---------------------------------------------------------------- answering

  function setAnswer(code: string, value: string | null) {
    setRefused(false);
    setAnswers((current) => {
      const next = { ...current };
      if (value === null) {
        delete next[code];
      } else {
        next[code] = { ...current[code], value };
      }
      return next;
    });
  }

  /** F15: copies a directory record into every question linked to its directory. */
  function fillFromDirectory(directory: DirectoryName, record: DirectoryRecord) {
    setRefused(false);
    setAnswers((current) => applyDirectoryRecord(catalog, current, directory, record));
  }

  function setNote(code: string, note: string) {
    setAnswers((current) => ({ ...current, [code]: { value: current[code]?.value ?? '', note } }));
  }

  // ---------------------------------------------------------------- photos and signatures


  /**
   * Stores a new attachment for a question and points the answer at it. The previous
   * one is removed afterwards (replacing creates a new attachment, DATA-MODEL.md).
   */
  async function attach(code: string, attachment: Pick<LocalAttachment, 'id' | 'kind' | 'localUri'>) {
    const store = await getLocal();
    const now = new Date().toISOString();
    await store.addAttachment({ ...attachment, inspectionId: id, questionCode: code }, now);
    const previous = latest.current.answers[code]?.value;
    setAnswer(code, attachment.id);
    if (previous) deleteFile(await store.removeAttachment(previous, now));
    setAttachments(await store.listAttachments(id));
  }

  /** Camera or gallery. Returns a message key when something stopped it. */
  async function pickPhoto(code: string, from: 'camera' | 'library'): Promise<MessageKey | null> {
    if (from === 'camera' && !(await ImagePicker.requestCameraPermissionsAsync()).granted) {
      return 'media.cameraDenied';
    }
    const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 1 };
    const result = from === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
    if (result.canceled) return null;
    try {
      const attachmentId = randomUUID();
      const localUri = await storePhoto(result.assets[0], id, attachmentId);
      await attach(code, { id: attachmentId, kind: 'photo', localUri });
      return null;
    } catch {
      return 'media.failed';
    }
  }

  async function sign(code: string, png: Uint8Array, keepAsMine: boolean) {
    const attachmentId = randomUUID();
    const localUri = storeSignature(png, id, attachmentId);
    if (keepAsMine) keepAsSavedSignature(png);
    await attach(code, { id: attachmentId, kind: 'signature', localUri });
  }

  async function applySavedSignature(code: string) {
    await sign(code, await readSavedSignature(), false);
  }

  async function removeMedia(code: string) {
    const previous = latest.current.answers[code]?.value;
    if (!previous) return;
    setAnswer(code, null);
    const store = await getLocal();
    deleteFile(await store.removeAttachment(previous, new Date().toISOString()));
    setAttachments(await store.listAttachments(id));
  }

  const media = {
    uriOf: (attachmentId: string) => attachments.find((a) => a.id === attachmentId)?.localUri ?? null,
    savedSignature: hasSavedSignature(),
    pickPhoto,
    sign,
    applySavedSignature,
    remove: removeMedia,
  };

  // ---------------------------------------------------------------- moving (F3, F4, F10)

  function moveTo(target: number) {
    setStep(target);
    setRefused(false);
    void save({ step: target });
  }

  /** F10: refuses to move forward while the current step has a blocking problem. */
  function blockedHere(): boolean {
    if (stepProblems(catalog, answers, step).length === 0) return false;
    setRevealedSteps((steps) => (steps.includes(step) ? steps : [...steps, step]));
    setRefused(true);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    return true;
  }

  function goNext() {
    const target = nextStep(catalog, answers, step);
    if (target !== null && !blockedHere()) moveTo(target);
  }

  function goBack() {
    const target = previousStep(catalog, answers, step);
    if (target !== null) moveTo(target);
  }

  /** The stage map: backwards always, forwards under F10. */
  function goTo(target: number) {
    if (target === step || !applicableSteps(catalog, answers).includes(target)) return;
    if (target < step || !blockedHere()) moveTo(target);
  }

  // ---------------------------------------------------------------- completing (F9, F11, R3)

  function requestComplete() {
    const pending = pendingProblems(catalog, answers);
    if (pending.blocking.length > 0) {
      setRevealedSteps(applicableSteps(catalog, answers));
      setPanel('blocking');
    } else if (pending.warnings.length > 0) {
      setPanel('warnings');
    } else {
      confirmVerdictOrComplete();
    }
  }

  function confirmVerdictOrComplete() {
    if (verdictNeedsReview(catalog, answers)) {
      setPanel('verdict');
    } else {
      void complete();
    }
  }

  async function complete() {
    await save({ status: 'completed' });
    setStatus('completed');
    const store = await getLocal();
    setRecord(await store.getInspection(id));
    setPanel('cleared');
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }

  /** From the pending list: open the step of a problem and show its marks. */
  function jumpTo(problem: Problem) {
    setPanel(null);
    setRevealedSteps((steps) => (steps.includes(problem.step) ? steps : [...steps, problem.step]));
    if (problem.step !== step) moveTo(problem.step);
  }

  // ---------------------------------------------------------------- what the screen reads

  const pending = pendingProblems(catalog, answers);

  /** The problem shown on a question: format problems at once (F7, F8), the rest after a refusal. */
  function problemOf(code: string): Problem | undefined {
    const problem = pending.blocking.find((p) => p.code === code);
    if (!problem) return undefined;
    const asTyped = problem.reason === 'digits_only' || problem.reason === 'not_a_number';
    return asTyped || revealedSteps.includes(problem.step) ? problem : undefined;
  }

  const correctableUntil =
    status === 'completed' && record?.completedAt && profile?.role === 'inspector'
      ? new Date(Date.parse(record.completedAt) + CORRECTION_WINDOW_HOURS * 3600 * 1000).toISOString()
      : null;

  return {
    loading: record === undefined,
    record,
    answers,
    step,
    status,
    editable,
    correctionBlocked,
    correctableUntil,
    isLastStep: nextStep(catalog, answers, step) === null,
    refused,
    panel,
    pending,
    problemOf,
    media,
    fillFromDirectory,
    canEditDirectory: profile?.role === 'supervisor',
    setAnswer,
    setNote,
    goNext,
    goBack,
    goTo,
    requestComplete,
    confirmVerdictOrComplete,
    complete,
    closePanel: () => setPanel(null),
    jumpTo,
    save,
  };
}
