import { Inspection, InspectionRow } from '../src/inspection/model';
import {
  buildReport,
  displayCode,
  filterHistory,
  findings,
  homeSummary,
  reportState,
  shareText,
  suggestedVerdict,
  verdictNeedsReview,
} from '../src/inspection/review';
import { answersOf, completeForA, miniCatalog } from './helpers';

const row = (id: string, extra: Partial<InspectionRow> = {}, summary: Partial<InspectionRow['summary']> = {}): InspectionRow => ({
  id,
  status: 'draft',
  createdAt: '2026-03-01T08:00:00Z',
  updatedAt: '2026-03-01T08:00:00Z',
  reportGeneratedAt: null,
  ...extra,
  summary: {
    tripRef: null,
    inspectionDate: null,
    unitType: null,
    truckPlate: null,
    containerNo: null,
    driverName: null,
    verdict: null,
    ...summary,
  },
});

const ids = (rows: InspectionRow[]): string[] => rows.map((item) => item.id);

describe('R1 findings', () => {
  test('are the failed checks, with their notes', () => {
    const answers = {
      ...completeForA(),
      BOX_DOORS: { value: 'FAIL', note: 'Bent bar' },
      BOX_FLOOR: { value: 'PASS' },
    };
    expect(findings(miniCatalog, answers)).toEqual([{ code: 'BOX_DOORS', step: 3, note: 'Bent bar' }]);
  });

  test('ignore a failed check that is no longer visible', () => {
    const answers = { ...completeForA(), COLD_RUNS: { value: 'FAIL', note: 'left over from type B' } };
    expect(findings(miniCatalog, answers)).toEqual([]);
  });
});

describe('R2 suggested verdict and R3 second look', () => {
  const withFinding = { ...completeForA(), BOX_DOORS: { value: 'FAIL', note: 'Bent bar' } };

  test('no findings suggests FIT, any finding suggests NOT_FIT', () => {
    expect(suggestedVerdict(miniCatalog, completeForA())).toBe('FIT');
    expect(suggestedVerdict(miniCatalog, withFinding)).toBe('NOT_FIT');
  });

  test('FIT with findings asks for a second look', () => {
    expect(verdictNeedsReview(miniCatalog, withFinding)).toBe(true);
  });

  test('NOT_FIT, or FIT without findings, does not', () => {
    expect(verdictNeedsReview(miniCatalog, { ...withFinding, VERDICT: { value: 'NOT_FIT' } })).toBe(false);
    expect(verdictNeedsReview(miniCatalog, completeForA())).toBe(false);
  });
});

describe('R4 display code', () => {
  test('is the first eight characters of the id, in upper case', () => {
    expect(displayCode('3f2a9c1e-7b44-4d0a-9c1e-5a6b7c8d9e0f')).toBe('INS-3F2A9C1E');
  });
});

describe('R5 history', () => {
  const rows = [
    row('a', { status: 'completed', updatedAt: '2026-03-02T10:00:00Z' }, { tripRef: 'T-100', truckPlate: 'KLM-204', inspectionDate: '2026-03-02' }),
    row('b', { updatedAt: '2026-03-04T09:00:00Z' }, { tripRef: 'T-200', driverName: 'Ana Diaz', inspectionDate: '2026-03-04' }),
    row('c', { updatedAt: '2026-03-03T09:00:00Z' }, { containerNo: 'CSQU3054383', inspectionDate: '2026-03-03' }),
  ];

  test('lists everything newest first', () => {
    expect(ids(filterHistory(rows, 'all', '', '2026-03-04'))).toEqual(['b', 'c', 'a']);
  });

  test('filters by status and by today', () => {
    expect(ids(filterHistory(rows, 'drafts', '', '2026-03-04'))).toEqual(['b', 'c']);
    expect(ids(filterHistory(rows, 'completed', '', '2026-03-04'))).toEqual(['a']);
    expect(ids(filterHistory(rows, 'today', '', '2026-03-04'))).toEqual(['b']);
  });

  test('searches inside reference, plate, container, driver and code', () => {
    expect(ids(filterHistory(rows, 'all', 't-1', '2026-03-04'))).toEqual(['a']);
    expect(ids(filterHistory(rows, 'all', 'klm204', '2026-03-04'))).toEqual(['a']);
    expect(ids(filterHistory(rows, 'all', '3054', '2026-03-04'))).toEqual(['c']);
    expect(ids(filterHistory(rows, 'all', 'ana', '2026-03-04'))).toEqual(['b']);
    expect(ids(filterHistory(rows, 'all', 'ins-c', '2026-03-04'))).toEqual(['c']);
  });

  test('the filter and the search apply together', () => {
    expect(ids(filterHistory(rows, 'completed', 'ana', '2026-03-04'))).toEqual([]);
  });
});

describe('R6 home', () => {
  test('counts today and drafts, and offers the latest drafts to continue', () => {
    const rows = [
      row('done', { status: 'completed' }, { inspectionDate: '2026-03-04' }),
      ...[1, 2, 3, 4, 5, 6, 7].map((day) =>
        row(`draft-${day}`, { updatedAt: `2026-03-0${day}T08:00:00Z` }, { inspectionDate: `2026-03-0${day}` }),
      ),
    ];
    const home = homeSummary(rows, '2026-03-04');
    expect(home.inspectionsToday).toBe(2);
    expect(home.draftsPending).toBe(7);
    expect(ids(home.resume)).toEqual(['draft-7', 'draft-6', 'draft-5', 'draft-4', 'draft-3']);
  });
});

describe('R7 report state', () => {
  const completed = { status: 'completed' as const, updatedAt: '2026-03-04T10:00:00Z' };

  test('a draft has no report', () => {
    expect(reportState({ status: 'draft', updatedAt: '2026-03-04T10:00:00Z', reportGeneratedAt: null })).toBe('not_available');
  });

  test('missing, current and outdated', () => {
    expect(reportState({ ...completed, reportGeneratedAt: null })).toBe('missing');
    expect(reportState({ ...completed, reportGeneratedAt: '2026-03-04T10:05:00Z' })).toBe('current');
    expect(reportState({ ...completed, reportGeneratedAt: '2026-03-04T09:55:00Z' })).toBe('outdated');
  });
});

describe('R8 report content and R9 share text', () => {
  const inspection: Inspection = {
    id: '3f2a9c1e-7b44-4d0a-9c1e-5a6b7c8d9e0f',
    status: 'completed',
    currentStep: 5,
    catalogVersion: 1,
    inspectorName: 'Sam Field',
    createdAt: '2026-03-04T08:00:00Z',
    updatedAt: '2026-03-04T09:00:00Z',
    completedAt: '2026-03-04T09:00:00Z',
    reportGeneratedAt: null,
    answers: {
      ...answersOf({ DATE: '2026-03-04', REF: 'T-100', TYPE: 'A', VERDICT: 'FIT', SIGNATURE: 'att-sign' }),
      BOX_DOORS: { value: 'FAIL', note: 'Bent bar' },
      BOX_FLOOR: { value: 'PASS' },
      BOX_PHOTO: { value: 'att-photo' },
      COLD_RUNS: { value: 'NA' },
    },
  };
  const report = buildReport(miniCatalog, inspection, 'en');

  test('opens with the code, the inspector and the summary facts', () => {
    expect(report.code).toBe('INS-3F2A9C1E');
    expect(report.inspectorName).toBe('Sam Field');
    expect(report.facts).toEqual([
      { label: 'REF', value: 'T-100' },
      { label: 'DATE', value: '2026-03-04' },
      { label: 'TYPE', value: 'Plain box' },
      { label: 'PLATE', value: '—' },
      { label: 'CONTAINER', value: '—' },
      { label: 'DRIVER', value: '—' },
    ]);
  });

  test('shows the verdict next to the one the answers suggest', () => {
    expect(report.verdict).toBe('Fit');
    expect(report.suggestedVerdict).toBe('NOT_FIT');
    expect(report.verdictNeedsReview).toBe(true);
  });

  test('lists the findings with the step they belong to', () => {
    expect(report.findings).toEqual([{ stepTitle: 'Box', label: 'BOX_DOORS', note: 'Bent bar' }]);
  });

  test('has one section per applicable step, without photos or signatures', () => {
    expect(report.sections.map((section) => section.title)).toEqual(['Trip', 'Unit', 'Box', 'Sign-off']);
    const box = report.sections[2];
    expect(box.lines).toEqual([
      { code: 'HEAD_BOX', isHeading: true, label: 'HEAD_BOX', value: '', note: null, result: null },
      { code: 'BOX_DOORS', isHeading: false, label: 'BOX_DOORS', value: 'Fail', note: 'Bent bar', result: 'FAIL' },
      { code: 'BOX_FLOOR', isHeading: false, label: 'BOX_FLOOR', value: 'Pass', note: null, result: 'PASS' },
    ]);
  });

  test('keeps photos and signatures apart, only the ones that exist', () => {
    expect(report.photos).toEqual([{ code: 'BOX_PHOTO', label: 'BOX_PHOTO', attachmentId: 'att-photo' }]);
    expect(report.signatures).toEqual([{ code: 'SIGNATURE', label: 'SIGNATURE', attachmentId: 'att-sign' }]);
  });

  test('is written in the requested language', () => {
    const spanish = buildReport(miniCatalog, inspection, 'es');
    expect(spanish.verdict).toBe('Fit (es)');
    expect(spanish.sections[2].lines[1].value).toBe('No cumple');
  });

  test('share text has one line per known fact, then the verdict', () => {
    expect(shareText(report)).toBe(['INS-3F2A9C1E', 'REF: T-100', 'DATE: 2026-03-04', 'TYPE: Plain box', 'Fit'].join('\n'));
  });
});
