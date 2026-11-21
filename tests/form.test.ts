import {
  activeGroups,
  applicableSteps,
  applyDirectoryRecord,
  canComplete,
  finalAnswers,
  findDuplicateTripRef,
  hasChanges,
  initialAnswers,
  isValidContainerNumber,
  nextStep,
  pendingProblems,
  previousStep,
  progress,
  stepProblems,
  summarize,
  visibleQuestions,
} from '../src/inspection/form';
import { answersOf, completeForA, miniCatalog } from './helpers';

const codes = (items: { code: string }[]): string[] => items.map((item) => item.code);

describe('F1 active groups', () => {
  test('no unit type chosen: no groups', () => {
    expect(activeGroups(miniCatalog, {})).toEqual([]);
  });

  test('the chosen unit type switches its groups on', () => {
    expect(activeGroups(miniCatalog, answersOf({ TYPE: 'A' }))).toEqual(['BOX']);
    expect(activeGroups(miniCatalog, answersOf({ TYPE: 'B' }))).toEqual(['BOX', 'COLD']);
  });

  test('an unknown unit type switches nothing on', () => {
    expect(activeGroups(miniCatalog, answersOf({ TYPE: 'ZZ' }))).toEqual([]);
  });
});

describe('F2 visible questions', () => {
  test('questions with no group are always visible', () => {
    expect(codes(visibleQuestions(miniCatalog, {}))).toEqual([
      'DATE', 'REF', 'DRIVER', 'DRIVER_DOC', 'PLATE', 'CONTAINER', 'TYPE', 'WEIGHT', 'VERDICT', 'SIGNATURE', 'NOTES',
    ]);
  });

  test('a grouped question shows only while its group is active', () => {
    const forA = codes(visibleQuestions(miniCatalog, answersOf({ TYPE: 'A' })));
    expect(forA).toContain('BOX_DOORS');
    expect(forA).toContain('HEAD_BOX');
    expect(forA).not.toContain('COLD_RUNS');
  });

  test('a step can be asked for on its own', () => {
    expect(codes(visibleQuestions(miniCatalog, answersOf({ TYPE: 'B' }), 4))).toEqual(['COLD_RUNS', 'COLD_PHOTO']);
  });
});

describe('F3 applicable steps', () => {
  test('a step with nothing to answer does not apply', () => {
    expect(applicableSteps(miniCatalog, {})).toEqual([1, 2, 5]);
    expect(applicableSteps(miniCatalog, answersOf({ TYPE: 'A' }))).toEqual([1, 2, 3, 5]);
    expect(applicableSteps(miniCatalog, answersOf({ TYPE: 'B' }))).toEqual([1, 2, 3, 4, 5]);
    expect(applicableSteps(miniCatalog, answersOf({ TYPE: 'C' }))).toEqual([1, 2, 5]);
  });
});

describe('F4 moving between steps', () => {
  const forA = answersOf({ TYPE: 'A' });

  test('next skips the steps that do not apply', () => {
    expect(nextStep(miniCatalog, forA, 3)).toBe(5);
    expect(nextStep(miniCatalog, answersOf({ TYPE: 'C' }), 2)).toBe(5);
  });

  test('there is no next step after the last one', () => {
    expect(nextStep(miniCatalog, forA, 5)).toBeNull();
  });

  test('previous skips the steps that do not apply', () => {
    expect(previousStep(miniCatalog, forA, 5)).toBe(3);
    expect(previousStep(miniCatalog, forA, 1)).toBeNull();
  });
});

describe('F5 starting answers', () => {
  test('defaults are filled in and TODAY becomes the given date', () => {
    expect(initialAnswers(miniCatalog, '2026-03-04')).toEqual({
      DATE: { value: '2026-03-04' },
      WEIGHT: { value: '0' },
    });
  });
});

describe('F6 a failed check needs a note', () => {
  test('FAIL without a note blocks', () => {
    const answers = { ...completeForA(), BOX_DOORS: { value: 'FAIL' } };
    expect(pendingProblems(miniCatalog, answers).blocking).toEqual([
      { code: 'BOX_DOORS', step: 3, reason: 'note_needed' },
    ]);
  });

  test('FAIL with a note, PASS and NA do not block', () => {
    const answers = {
      ...completeForA(),
      BOX_DOORS: { value: 'FAIL', note: 'Left hinge is loose' },
      BOX_FLOOR: { value: 'PASS' },
    };
    expect(pendingProblems(miniCatalog, answers).blocking).toEqual([]);
  });

  test('a note made of spaces is not a note', () => {
    const answers = { ...completeForA(), BOX_DOORS: { value: 'FAIL', note: '   ' } };
    expect(codes(pendingProblems(miniCatalog, answers).blocking)).toEqual(['BOX_DOORS']);
  });
});

describe('F7 digits and F8 numbers', () => {
  test('a digits question accepts only 0-9', () => {
    const bad = { ...completeForA(), DRIVER_DOC: { value: '12.345-6' } };
    expect(pendingProblems(miniCatalog, bad).blocking).toEqual([
      { code: 'DRIVER_DOC', step: 1, reason: 'digits_only' },
    ]);
    const good = { ...completeForA(), DRIVER_DOC: { value: '123456' } };
    expect(pendingProblems(miniCatalog, good).blocking).toEqual([]);
  });

  test('a number question accepts whole and decimal numbers', () => {
    const bad = { ...completeForA(), WEIGHT: { value: 'heavy' } };
    expect(pendingProblems(miniCatalog, bad).blocking).toEqual([
      { code: 'WEIGHT', step: 2, reason: 'not_a_number' },
    ]);
    const good = { ...completeForA(), WEIGHT: { value: '3850.5' } };
    expect(pendingProblems(miniCatalog, good).blocking).toEqual([]);
  });
});

describe('F9 pending problems', () => {
  const fresh = { ...initialAnswers(miniCatalog, '2026-03-04'), TYPE: { value: 'A' } };

  test('unanswered required questions block, in catalog order', () => {
    expect(pendingProblems(miniCatalog, fresh).blocking).toEqual([
      { code: 'REF', step: 1, reason: 'required' },
      { code: 'VERDICT', step: 5, reason: 'required' },
      { code: 'SIGNATURE', step: 5, reason: 'required' },
    ]);
  });

  test('unanswered recommended questions only warn', () => {
    expect(codes(pendingProblems(miniCatalog, fresh).warnings)).toEqual([
      'DRIVER', 'DRIVER_DOC', 'BOX_DOORS', 'BOX_FLOOR',
    ]);
  });

  test('optional questions and headings are never pending', () => {
    const all = pendingProblems(miniCatalog, fresh);
    const pending = codes([...all.blocking, ...all.warnings]);
    expect(pending).not.toContain('PLATE');
    expect(pending).not.toContain('HEAD_BOX');
  });

  test('hidden questions are never pending', () => {
    const all = pendingProblems(miniCatalog, fresh);
    expect(codes([...all.blocking, ...all.warnings])).not.toContain('COLD_RUNS');
  });

  test('an answer made of spaces counts as unanswered', () => {
    const answers = { ...fresh, REF: { value: '   ' } };
    expect(codes(pendingProblems(miniCatalog, answers).blocking)).toContain('REF');
  });
});

describe('F10 leaving a step', () => {
  test('a required question of the step holds the inspector there', () => {
    const answers = initialAnswers(miniCatalog, '2026-03-04');
    expect(stepProblems(miniCatalog, answers, 1)).toEqual([{ code: 'REF', step: 1, reason: 'required' }]);
    expect(stepProblems(miniCatalog, answers, 2)).toEqual([{ code: 'TYPE', step: 2, reason: 'required' }]);
  });

  test('recommended questions never hold the inspector', () => {
    const answers = { ...initialAnswers(miniCatalog, '2026-03-04'), REF: { value: 'T-1' } };
    expect(stepProblems(miniCatalog, answers, 1)).toEqual([]);
  });
});

describe('F11 completing', () => {
  test('allowed once nothing blocking is pending, even with warnings', () => {
    expect(canComplete(miniCatalog, completeForA())).toBe(true);
    expect(pendingProblems(miniCatalog, completeForA()).warnings.length).toBeGreaterThan(0);
  });

  test('refused while something blocking is pending', () => {
    const { SIGNATURE, ...unsigned } = completeForA();
    expect(canComplete(miniCatalog, unsigned)).toBe(false);
  });
});

describe('F12 final answers', () => {
  const messy = {
    ...completeForA(),
    REF: { value: '  T-100  ' },
    NOTES: { value: '   ' },
    BOX_DOORS: { value: 'FAIL', note: '  Bent bar  ' },
    COLD_RUNS: { value: 'FAIL', note: 'answered before switching to type A' },
    COLD_PHOTO: { value: 'att-old' },
    GHOST: { value: 'not in the catalog' },
  };
  const final = finalAnswers(miniCatalog, messy);

  test('texts are trimmed and blanks are dropped', () => {
    expect(final.REF).toEqual({ value: 'T-100' });
    expect(final.BOX_DOORS).toEqual({ value: 'FAIL', note: 'Bent bar' });
    expect(final.NOTES).toBeUndefined();
  });

  test('a hidden check is recorded as NA, whatever it held', () => {
    expect(final.COLD_RUNS).toEqual({ value: 'NA' });
  });

  test('other hidden answers and unknown codes are dropped', () => {
    expect(final.COLD_PHOTO).toBeUndefined();
    expect(final.GHOST).toBeUndefined();
  });

  test('visible questions left unanswered stay unanswered', () => {
    expect(final.BOX_FLOOR).toBeUndefined();
  });
});

describe('F13 detecting changes', () => {
  test('order, blanks and extra spaces are not changes', () => {
    const before = { REF: { value: 'T-1' }, DRIVER: { value: 'Ana Diaz' } };
    const after = { DRIVER: { value: ' Ana Diaz ' }, REF: { value: 'T-1' }, NOTES: { value: '' } };
    expect(hasChanges(before, after)).toBe(false);
  });

  test('a different value or a different note is a change', () => {
    const before = { BOX_DOORS: { value: 'FAIL', note: 'Bent bar' } };
    expect(hasChanges(before, { BOX_DOORS: { value: 'PASS' } })).toBe(true);
    expect(hasChanges(before, { BOX_DOORS: { value: 'FAIL', note: 'Broken bar' } })).toBe(true);
  });
});

describe('F14 progress', () => {
  test('counts answered questions per applicable step and overall', () => {
    const answers = answersOf({ DATE: '2026-03-04', REF: 'T-1', TYPE: 'A', BOX_DOORS: 'PASS' });
    expect(progress(miniCatalog, answers)).toEqual({
      steps: [
        { step: 1, answered: 2, total: 6 },
        { step: 2, answered: 1, total: 2 },
        { step: 3, answered: 1, total: 3 },
        { step: 5, answered: 0, total: 3 },
      ],
      answered: 4,
      total: 14,
      percent: 28,
    });
  });
});

describe('F15 filling from the directory', () => {
  test('a record fills every question linked to its directory', () => {
    const filled = applyDirectoryRecord(miniCatalog, {}, 'drivers', { name: 'Ana Diaz', idNumber: '1002003' });
    expect(filled).toEqual({ DRIVER: { value: 'Ana Diaz' }, DRIVER_DOC: { value: '1002003' } });
  });

  test('a blank field keeps what was already answered', () => {
    const before = answersOf({ DRIVER_DOC: '555' });
    const filled = applyDirectoryRecord(miniCatalog, before, 'drivers', { name: 'Ana Diaz', idNumber: null });
    expect(filled.DRIVER_DOC).toEqual({ value: '555' });
  });

  test('other directories and the original answers are left alone', () => {
    const before = answersOf({ DRIVER: 'Ana Diaz' });
    const filled = applyDirectoryRecord(miniCatalog, before, 'vehicles', { plate: 'KLM-204' });
    expect(filled).toEqual({ DRIVER: { value: 'Ana Diaz' }, PLATE: { value: 'KLM-204' } });
    expect(before).toEqual({ DRIVER: { value: 'Ana Diaz' } });
  });
});

describe('F16 duplicate trip reference', () => {
  const others = [
    { id: 'one', tripRef: 'T-100' },
    { id: 'two', tripRef: null },
  ];

  test('found ignoring case and extra spaces', () => {
    expect(findDuplicateTripRef(others, '  t-100 ', 'new')).toEqual({ id: 'one', tripRef: 'T-100' });
  });

  test('an inspection never clashes with itself', () => {
    expect(findDuplicateTripRef(others, 'T-100', 'one')).toBeNull();
  });

  test('a blank reference clashes with nothing', () => {
    expect(findDuplicateTripRef(others, '   ', 'new')).toBeNull();
  });
});

describe('F17 container number', () => {
  test('accepts a number with a correct check digit', () => {
    expect(isValidContainerNumber('CSQU3054383')).toBe(true);
    expect(isValidContainerNumber('csqu 305438-3')).toBe(true);
  });

  test('rejects a wrong check digit or a wrong shape', () => {
    expect(isValidContainerNumber('CSQU3054384')).toBe(false);
    expect(isValidContainerNumber('CSQ3054383')).toBe(false);
    expect(isValidContainerNumber('')).toBe(false);
  });
});

describe('F18 summary', () => {
  test('copies the mapped answers and uses null for blanks', () => {
    const answers = answersOf({ REF: ' T-100 ', DATE: '2026-03-04', TYPE: 'A', VERDICT: 'FIT' });
    expect(summarize(miniCatalog, answers)).toEqual({
      tripRef: 'T-100',
      inspectionDate: '2026-03-04',
      unitType: 'A',
      truckPlate: null,
      containerNo: null,
      driverName: null,
      verdict: 'FIT',
    });
  });
});
