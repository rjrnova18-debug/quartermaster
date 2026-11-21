/**
 * The rules of the inspection form, as pure functions.
 *
 * Nothing here reads the clock, the screen or a database: every function
 * receives what it needs and returns a new value without changing its inputs.
 * Rule numbers (F1, F2...) refer to docs/FORM-RULES.md.
 */
import {
  AnswerSet,
  Catalog,
  DirectoryName,
  InspectionSummary,
  Question,
  SummaryField,
} from './model';

// ---------------------------------------------------------------- reading answers

/** The trimmed value of an answer, or '' when there is none. */
export function answerValue(answers: AnswerSet, code: string): string {
  return (answers[code]?.value ?? '').trim();
}

/** The trimmed note of an answer, or '' when there is none. */
export function answerNote(answers: AnswerSet, code: string): string {
  return (answers[code]?.note ?? '').trim();
}

export function isAnswered(answers: AnswerSet, code: string): boolean {
  return answerValue(answers, code) !== '';
}

/** Headings are titles: they are shown but never answered. */
export function isAnswerable(question: Question): boolean {
  return question.kind !== 'heading';
}

// ---------------------------------------------------------------- F1-F2 visibility

/** F1. The groups switched on by the chosen unit type. None chosen: no groups. */
export function activeGroups(catalog: Catalog, answers: AnswerSet): string[] {
  const typeQuestion = catalog.questions.find((question) => question.kind === 'unit_type');
  if (!typeQuestion) {
    return [];
  }
  const chosenCode = answerValue(answers, typeQuestion.code);
  const unitType = catalog.unitTypes.find((type) => type.code === chosenCode);
  return unitType ? unitType.groups : [];
}

/** F2. A question with no group is always shown; otherwise its group must be active. */
export function isVisible(question: Question, groups: string[]): boolean {
  return question.group === null || groups.includes(question.group);
}

/** F2. The rows to show, in catalog order. Pass a step to get only that step. */
export function visibleQuestions(catalog: Catalog, answers: AnswerSet, step?: number): Question[] {
  const groups = activeGroups(catalog, answers);
  return catalog.questions.filter(
    (question) => isVisible(question, groups) && (step === undefined || question.step === step),
  );
}

// ---------------------------------------------------------------- F3-F4 steps

/** F3. The steps that have at least one visible question to answer, in order. */
export function applicableSteps(catalog: Catalog, answers: AnswerSet): number[] {
  const visible = visibleQuestions(catalog, answers).filter(isAnswerable);
  return catalog.steps
    .map((step) => step.number)
    .filter((number) => visible.some((question) => question.step === number))
    .sort((a, b) => a - b);
}

/** F4. The applicable step after this one, or null when this is the last. */
export function nextStep(catalog: Catalog, answers: AnswerSet, current: number): number | null {
  const later = applicableSteps(catalog, answers).filter((number) => number > current);
  return later.length > 0 ? later[0] : null;
}

/** F4. The applicable step before this one, or null when this is the first. */
export function previousStep(catalog: Catalog, answers: AnswerSet, current: number): number | null {
  const earlier = applicableSteps(catalog, answers).filter((number) => number < current);
  return earlier.length > 0 ? earlier[earlier.length - 1] : null;
}

// ---------------------------------------------------------------- F5 defaults

/** F5. The answers a new inspection starts with. `today` is a YYYY-MM-DD date. */
export function initialAnswers(catalog: Catalog, today: string): AnswerSet {
  const answers: AnswerSet = {};
  for (const question of catalog.questions) {
    if (question.default !== undefined) {
      answers[question.code] = { value: question.default === 'TODAY' ? today : question.default };
    }
  }
  return answers;
}

// ---------------------------------------------------------------- F6-F9 problems

export type ProblemReason =
  | 'required' // a required question has no answer
  | 'recommended' // a recommended question has no answer
  | 'note_needed' // a check answered FAIL has no note
  | 'digits_only' // a digits question holds something other than 0-9
  | 'not_a_number'; // a number question holds something that is not a number

export interface Problem {
  code: string;
  step: number;
  reason: ProblemReason;
}

export interface Pending {
  /** Must be solved before the inspection can be completed. */
  blocking: Problem[];
  /** Shown as a reminder; the inspector may complete anyway. */
  warnings: Problem[];
}

const ONLY_DIGITS = /^[0-9]+$/;
const PLAIN_NUMBER = /^[0-9]+(\.[0-9]+)?$/;

/** F6-F8. What is wrong with one answered question, or null when it is fine. */
function answerProblem(question: Question, answers: AnswerSet): ProblemReason | null {
  const value = answerValue(answers, question.code);
  if (question.kind === 'check' && value === 'FAIL' && answerNote(answers, question.code) === '') {
    return 'note_needed';
  }
  if (question.kind === 'digits' && !ONLY_DIGITS.test(value)) {
    return 'digits_only';
  }
  if (question.kind === 'number' && !PLAIN_NUMBER.test(value)) {
    return 'not_a_number';
  }
  return null;
}

/** F9. Everything still pending, in catalog order. Hidden questions never count. */
export function pendingProblems(catalog: Catalog, answers: AnswerSet): Pending {
  const pending: Pending = { blocking: [], warnings: [] };

  for (const question of visibleQuestions(catalog, answers).filter(isAnswerable)) {
    const place = { code: question.code, step: question.step };

    if (!isAnswered(answers, question.code)) {
      if (question.requirement === 'required') {
        pending.blocking.push({ ...place, reason: 'required' });
      } else if (question.requirement === 'recommended') {
        pending.warnings.push({ ...place, reason: 'recommended' });
      }
      continue;
    }

    const reason = answerProblem(question, answers);
    if (reason !== null) {
      pending.blocking.push({ ...place, reason });
    }
  }

  return pending;
}

/** F10. What stops the inspector from moving forward out of a step. */
export function stepProblems(catalog: Catalog, answers: AnswerSet, step: number): Problem[] {
  return pendingProblems(catalog, answers).blocking.filter((problem) => problem.step === step);
}

/** F11. An inspection can be completed when nothing blocking is pending. */
export function canComplete(catalog: Catalog, answers: AnswerSet): boolean {
  return pendingProblems(catalog, answers).blocking.length === 0;
}

// ---------------------------------------------------------------- F12 completing

/**
 * F12. The answers to store when an inspection is completed:
 * - blank answers are dropped and texts are trimmed;
 * - answers to hidden questions are dropped (they belong to another unit type);
 * - every hidden check is recorded as NA, so "did not apply" is told apart
 *   from "was not answered".
 */
export function finalAnswers(catalog: Catalog, answers: AnswerSet): AnswerSet {
  const groups = activeGroups(catalog, answers);
  const result: AnswerSet = {};

  for (const question of catalog.questions.filter(isAnswerable)) {
    if (!isVisible(question, groups)) {
      if (question.kind === 'check') {
        result[question.code] = { value: 'NA' };
      }
      continue;
    }
    if (isAnswered(answers, question.code)) {
      result[question.code] = cleanAnswer(answers, question.code);
    }
  }

  return result;
}

function cleanAnswer(answers: AnswerSet, code: string) {
  const note = answerNote(answers, code);
  return note === '' ? { value: answerValue(answers, code) } : { value: answerValue(answers, code), note };
}

// ---------------------------------------------------------------- F13 changes

/** F13. True when two answer sets differ. Blank answers and extra spaces do not count. */
export function hasChanges(before: AnswerSet, after: AnswerSet): boolean {
  return fingerprint(before) !== fingerprint(after);
}

function fingerprint(answers: AnswerSet): string {
  const filled = Object.keys(answers)
    .filter((code) => isAnswered(answers, code))
    .sort()
    .map((code) => [code, answerValue(answers, code), answerNote(answers, code)]);
  return JSON.stringify(filled);
}

// ---------------------------------------------------------------- F14 progress

export interface StepProgress {
  step: number;
  answered: number;
  total: number;
}

export interface Progress {
  steps: StepProgress[];
  answered: number;
  total: number;
  /** 0 to 100, rounded down. */
  percent: number;
}

/** F14. How much of the visible form is answered, per applicable step and overall. */
export function progress(catalog: Catalog, answers: AnswerSet): Progress {
  const visible = visibleQuestions(catalog, answers).filter(isAnswerable);

  const steps = applicableSteps(catalog, answers).map((step) => {
    const inStep = visible.filter((question) => question.step === step);
    return {
      step,
      answered: inStep.filter((question) => isAnswered(answers, question.code)).length,
      total: inStep.length,
    };
  });

  const answered = steps.reduce((sum, step) => sum + step.answered, 0);
  const total = steps.reduce((sum, step) => sum + step.total, 0);
  return { steps, answered, total, percent: total === 0 ? 0 : Math.floor((answered * 100) / total) };
}

// ---------------------------------------------------------------- F15 directory

/** A directory record as plain fields: { name: '...', idNumber: '...' }. */
export type DirectoryRecord = Record<string, string | null | undefined>;

/**
 * F15. Copies a directory record into the questions linked to that directory.
 * A field the record leaves blank does not erase what was already answered.
 */
export function applyDirectoryRecord(
  catalog: Catalog,
  answers: AnswerSet,
  directory: DirectoryName,
  record: DirectoryRecord,
): AnswerSet {
  const result: AnswerSet = { ...answers };
  for (const question of catalog.questions) {
    const link = question.filledFrom;
    if (!link || link.directory !== directory) {
      continue;
    }
    const value = (record[link.field] ?? '').trim();
    if (value !== '') {
      result[question.code] = { value };
    }
  }
  return result;
}

// ---------------------------------------------------------------- F16 trip reference

/** How trip references are compared: no outer spaces, single inner spaces, upper case. */
export function normalizeTripRef(tripRef: string): string {
  return tripRef.trim().replace(/\s+/g, ' ').toUpperCase();
}

export interface TripRefHolder {
  id: string;
  tripRef: string | null;
}

/**
 * F16. Finds another inspection that already uses this trip reference.
 * `ownId` is the inspection being edited, which never clashes with itself.
 */
export function findDuplicateTripRef<T extends TripRefHolder>(
  others: T[],
  tripRef: string,
  ownId: string,
): T | null {
  const wanted = normalizeTripRef(tripRef);
  if (wanted === '') {
    return null;
  }
  const match = others.find(
    (other) => other.id !== ownId && normalizeTripRef(other.tripRef ?? '') === wanted,
  );
  return match ?? null;
}

// ---------------------------------------------------------------- F17 container number

/** Letter values of the ISO 6346 check digit: A=10, then upwards skipping multiples of 11. */
function letterValue(letter: string): number {
  let value = 10;
  for (let code = 'A'.charCodeAt(0); code < letter.charCodeAt(0); code++) {
    value++;
    if (value % 11 === 0) {
      value++;
    }
  }
  return value;
}

/**
 * F17. True when a container number has four letters, seven digits and a
 * correct ISO 6346 check digit. Spaces and hyphens are ignored.
 */
export function isValidContainerNumber(text: string): boolean {
  const number = text.replace(/[\s-]/g, '').toUpperCase();
  if (!/^[A-Z]{4}[0-9]{7}$/.test(number)) {
    return false;
  }
  let sum = 0;
  for (let position = 0; position < 10; position++) {
    const character = number[position];
    const value = position < 4 ? letterValue(character) : Number(character);
    sum += value * 2 ** position;
  }
  const checkDigit = (sum % 11) % 10;
  return checkDigit === Number(number[10]);
}

// ---------------------------------------------------------------- F18 summary

/** F18. The few answers copied to the inspection record so lists need no answers. */
export function summarize(catalog: Catalog, answers: AnswerSet): InspectionSummary {
  const fields = Object.keys(catalog.summary) as SummaryField[];
  const summary = {} as InspectionSummary;
  for (const field of fields) {
    const value = answerValue(answers, catalog.summary[field]);
    summary[field] = value === '' ? null : value;
  }
  return summary;
}
