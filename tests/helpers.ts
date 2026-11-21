/**
 * A tiny catalog for the rule tests.
 *
 * The rules are tested against this small form, not against the real catalog,
 * so editing the real questions never breaks a rule test. The real catalog has
 * its own test (catalog.test.ts).
 *
 * Unit types: A switches on BOX, B switches on BOX and COLD, C switches on nothing.
 * Steps: 1 trip, 2 unit, 3 box (BOX only), 4 cold (COLD only), 5 sign-off.
 */
import { AnswerSet, Catalog, LocalizedText, Question } from '../src/inspection/model';

const text = (words: string): LocalizedText => ({ en: words, es: `${words} (es)` });

const question = (
  code: string,
  step: number,
  kind: Question['kind'],
  requirement: Question['requirement'],
  extra: Partial<Question> = {},
): Question => ({ code, step, kind, requirement, group: null, label: text(code), ...extra });

export const miniCatalog: Catalog = {
  version: 1,
  groups: ['BOX', 'COLD'],
  unitTypes: [
    { code: 'A', label: text('Plain box'), groups: ['BOX'] },
    { code: 'B', label: text('Cold box'), groups: ['BOX', 'COLD'] },
    { code: 'C', label: text('No box'), groups: [] },
  ],
  steps: [
    { number: 1, title: text('Trip') },
    { number: 2, title: text('Unit') },
    { number: 3, title: text('Box') },
    { number: 4, title: text('Cold') },
    { number: 5, title: text('Sign-off') },
  ],
  summary: {
    tripRef: 'REF',
    inspectionDate: 'DATE',
    unitType: 'TYPE',
    truckPlate: 'PLATE',
    containerNo: 'CONTAINER',
    driverName: 'DRIVER',
    verdict: 'VERDICT',
  },
  questions: [
    question('DATE', 1, 'date', 'required', { default: 'TODAY' }),
    question('REF', 1, 'text', 'required'),
    question('DRIVER', 1, 'text', 'recommended', { filledFrom: { directory: 'drivers', field: 'name' } }),
    question('DRIVER_DOC', 1, 'digits', 'recommended', { filledFrom: { directory: 'drivers', field: 'idNumber' } }),
    question('PLATE', 1, 'text', 'optional', { filledFrom: { directory: 'vehicles', field: 'plate' } }),
    question('CONTAINER', 1, 'text', 'optional'),

    question('TYPE', 2, 'unit_type', 'required'),
    question('WEIGHT', 2, 'number', 'optional', { default: '0' }),

    question('HEAD_BOX', 3, 'heading', 'optional', { group: 'BOX' }),
    question('BOX_DOORS', 3, 'check', 'recommended', { group: 'BOX' }),
    question('BOX_FLOOR', 3, 'check', 'recommended', { group: 'BOX' }),
    question('BOX_PHOTO', 3, 'photo', 'optional', { group: 'BOX' }),

    question('COLD_RUNS', 4, 'check', 'recommended', { group: 'COLD' }),
    question('COLD_PHOTO', 4, 'photo', 'optional', { group: 'COLD' }),

    question('VERDICT', 5, 'choice', 'required', {
      options: [
        { value: 'FIT', label: text('Fit') },
        { value: 'NOT_FIT', label: text('Not fit') },
      ],
    }),
    question('SIGNATURE', 5, 'signature', 'required'),
    question('NOTES', 5, 'text', 'optional'),
  ],
};

/** Builds an answer set from plain values: answersOf({ REF: 'T-1' }). */
export function answersOf(values: Record<string, string>): AnswerSet {
  const answers: AnswerSet = {};
  for (const code of Object.keys(values)) {
    answers[code] = { value: values[code] };
  }
  return answers;
}

/** Every required question answered, for unit type A. */
export const completeForA = (): AnswerSet =>
  answersOf({ DATE: '2026-03-04', REF: 'T-100', TYPE: 'A', VERDICT: 'FIT', SIGNATURE: 'att-sign' });
