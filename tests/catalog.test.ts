import { catalog, catalogProblems, loadCatalog, questionByCode } from '../src/inspection/catalog';
import { applicableSteps, canComplete, initialAnswers, isAnswerable, visibleQuestions } from '../src/inspection/form';
import { Catalog } from '../src/inspection/model';
import { answersOf, miniCatalog } from './helpers';

/** A deep copy that a test can break without touching the shared fixture. */
const copyOf = (source: Catalog): Catalog => JSON.parse(JSON.stringify(source));

describe('the shipped catalog', () => {
  test('is well formed', () => {
    expect(catalogProblems(catalog)).toEqual([]);
  });

  test('has seven steps and two unit types', () => {
    expect(catalog.steps.map((step) => step.number)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(catalog.unitTypes.map((type) => type.code)).toEqual(['UT01', 'UT02']);
  });

  test('asks 57 questions for a dry container and 62 for a reefer', () => {
    const count = (unitType: string): number =>
      visibleQuestions(catalog, answersOf({ UNIT_TYPE: unitType })).filter(isAnswerable).length;
    expect(count('UT01')).toBe(57);
    expect(count('UT02')).toBe(62);
  });

  test('the reefer step applies only to a reefer container', () => {
    expect(applicableSteps(catalog, answersOf({ UNIT_TYPE: 'UT01' }))).toEqual([1, 2, 3, 4, 6, 7]);
    expect(applicableSteps(catalog, answersOf({ UNIT_TYPE: 'UT02' }))).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  test('requires only the answers an inspection cannot do without', () => {
    const required = catalog.questions
      .filter((question) => question.requirement === 'required')
      .map((question) => question.code);
    expect(required).toEqual(['TRIP_DATE', 'TRIP_REF', 'UNIT_TYPE', 'VERDICT', 'INSPECTOR_SIGNATURE']);
  });

  test('can be completed with only the required answers', () => {
    const answers = {
      ...initialAnswers(catalog, '2026-03-04'),
      ...answersOf({ TRIP_REF: 'T-100', UNIT_TYPE: 'UT01', VERDICT: 'FIT', INSPECTOR_SIGNATURE: 'att-1' }),
    };
    expect(canComplete(catalog, answers)).toBe(true);
  });

  test('every choice value and every code is upper snake case', () => {
    for (const question of catalog.questions) {
      expect(question.code).toMatch(/^[A-Z][A-Z0-9_]*$/);
    }
  });

  test('a question is found by its code', () => {
    expect(questionByCode(catalog, 'TRIP_REF')?.kind).toBe('text');
    expect(questionByCode(catalog, 'NOPE')).toBeUndefined();
  });
});

describe('catalog checks', () => {
  test('the test catalog is well formed too', () => {
    expect(catalogProblems(miniCatalog)).toEqual([]);
  });

  test('a repeated code is reported', () => {
    const broken = copyOf(miniCatalog);
    broken.questions.push({ ...broken.questions[1] });
    expect(catalogProblems(broken)).toContain('the code REF is used twice');
  });

  test('an unknown group is reported on questions and on unit types', () => {
    const broken = copyOf(miniCatalog);
    broken.questions[1].group = 'WARM';
    broken.unitTypes[0].groups = ['WARM'];
    expect(catalogProblems(broken)).toEqual([
      'unit type A uses the unknown group WARM',
      'REF uses the unknown group WARM',
    ]);
  });

  test('a step that does not exist is reported', () => {
    const broken = copyOf(miniCatalog);
    broken.questions[1].step = 9;
    expect(catalogProblems(broken)).toEqual(['REF belongs to step 9, which does not exist']);
  });

  test('a choice needs at least two options', () => {
    const broken = copyOf(miniCatalog);
    const verdict = broken.questions.find((question) => question.code === 'VERDICT');
    verdict!.options = [];
    expect(catalogProblems(broken)).toEqual(['VERDICT is a choice with fewer than two options']);
  });

  test('exactly one unit_type question is needed', () => {
    const broken = copyOf(miniCatalog);
    broken.questions = broken.questions.filter((question) => question.kind !== 'unit_type');
    expect(catalogProblems(broken)).toEqual([
      'the catalog needs exactly one unit_type question, found 0',
      'summary field unitType points to the unknown question TYPE',
    ]);
  });

  test('a summary field must point to a real question', () => {
    const broken = copyOf(miniCatalog);
    broken.summary.tripRef = 'MISSING';
    expect(catalogProblems(broken)).toEqual(['summary field tripRef points to the unknown question MISSING']);
  });

  test('loading a broken catalog fails with the list of problems', () => {
    const broken = copyOf(miniCatalog);
    broken.summary.tripRef = 'MISSING';
    expect(() => loadCatalog(broken)).toThrow('Invalid catalog: summary field tripRef points to the unknown question MISSING');
  });
});
