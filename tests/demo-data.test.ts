/** The demo data follows the rules of Replica docs/DEMO-DATA.md. */
import { existsSync } from 'node:fs';
import path from 'node:path';

import { buildDemoData, demoId, PHOTO_ASSETS } from '../src/demo/demo-data';
import { catalog } from '../src/inspection/catalog';
import {
  canComplete,
  canEditInspection,
  finalAnswers,
  isValidContainerNumber,
  pendingProblems,
  summarize,
} from '../src/inspection/form';
import { findings, homeSummary, reportState, verdictNeedsReview } from '../src/inspection/review';

const TODAY = '2026-03-10';
const NOW = '2026-03-10T15:00:00.000Z';
const data = buildDemoData(TODAY, NOW);
const [n1, , , n4, n5, n6, n7, n8, n9, n10, n11, n12, n13, n14] = data.inspections;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const rowOf = (inspection: (typeof data.inspections)[number]) => ({
  ...inspection,
  summary: summarize(catalog, inspection.answers),
});

describe('repeatable', () => {
  test('the same day gives the same data', () => {
    expect(buildDemoData(TODAY, NOW)).toEqual(data);
  });

  test('the ids do not depend on the day, so a new seed replaces the old one', () => {
    const later = buildDemoData('2026-07-01', '2026-07-01T09:00:00.000Z');
    expect(later.inspections.map((i) => i.id)).toEqual(data.inspections.map((i) => i.id));
    expect(later.drivers.map((d) => d.id)).toEqual(data.drivers.map((d) => d.id));
  });

  test('every id is a distinct version 4 UUID', () => {
    const ids = [
      ...data.carriers, ...data.drivers, ...data.vehicles, ...data.inspections, ...data.attachments,
    ].map((row) => row.id);
    expect(ids.every((id) => UUID.test(id))).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
    expect(demoId('x')).toBe(demoId('x'));
  });
});

describe('people and directory', () => {
  test('three accounts on the reserved example domain', () => {
    expect(data.people.map((p) => p.role)).toEqual(['inspector', 'inspector', 'supervisor']);
    expect(data.people.every((p) => p.email.endsWith('@quartermaster.example'))).toBe(true);
  });

  test('6 carriers, 10 drivers and 10 vehicles in the invented formats', () => {
    expect(data.carriers).toHaveLength(6);
    expect(data.drivers).toHaveLength(10);
    expect(data.vehicles).toHaveLength(10);
    expect(data.drivers.every((d) => /^90\d{6}$/.test(d.idNumber) && /^555\d{7}$/.test(d.phone))).toBe(true);
    expect(data.vehicles.every((v) => /^[A-Z]{3}\d{3}$/.test(v.plate))).toBe(true);
    expect(new Set(data.drivers.map((d) => d.idNumber)).size).toBe(10);
    expect(new Set(data.vehicles.map((v) => v.plate)).size).toBe(10);
  });
});

describe('inspections', () => {
  test('fourteen, spread over the last ten days, and "Today" is never empty', () => {
    expect(data.inspections).toHaveLength(14);
    const dates = data.inspections.map((i) => i.answers.TRIP_DATE.value);
    expect(dates.every((date) => date >= '2026-03-01' && date <= TODAY)).toBe(true);
    const mine = data.inspections.filter((i) => i.owner === 'sam').map(rowOf);
    expect(homeSummary(mine, TODAY).inspectionsToday).toBeGreaterThan(0);
  });

  test('trip references are T- and five digits, all different', () => {
    const refs = data.inspections.map((i) => i.answers.TRIP_REF?.value).filter(Boolean) as string[];
    expect(refs.every((ref) => /^T-\d{5}$/.test(ref))).toBe(true);
    expect(new Set(refs).size).toBe(refs.length);
  });

  test('container numbers pass F17, except one', () => {
    const numbers = data.inspections.map((i) => i.answers.CONTAINER_NO?.value).filter(Boolean) as string[];
    expect(numbers.filter((number) => !isValidContainerNumber(number))).toEqual([n8.answers.CONTAINER_NO.value]);
  });

  test('completed ones can be completed, store their final answers and have consistent dates', () => {
    for (const inspection of data.inspections.filter((i) => i.status === 'completed')) {
      expect(canComplete(catalog, inspection.answers)).toBe(true);
      expect(finalAnswers(catalog, inspection.answers)).toEqual(inspection.answers);
      expect(inspection.createdAt < inspection.completedAt!).toBe(true);
      expect(inspection.completedAt! <= inspection.updatedAt).toBe(true);
      if (inspection.reportGeneratedAt !== null) {
        expect(inspection.completedAt! < inspection.reportGeneratedAt).toBe(true);
      }
    }
  });

  test('nothing happens after now', () => {
    for (const inspection of data.inspections) {
      expect(inspection.createdAt <= inspection.updatedAt).toBe(true);
      expect(inspection.updatedAt <= NOW).toBe(true);
    }
  });

  test('notes on findings are given', () => {
    for (const inspection of data.inspections) {
      expect(findings(catalog, inspection.answers).every((finding) => finding.note.length > 10)).toBe(true);
    }
  });
});

describe('each row of the table shows its case', () => {
  test('1-3 every question answered; 4 the reefer photo', () => {
    expect(pendingProblems(catalog, n1.answers).warnings).toEqual([]);
    expect(n4.answers.UNIT_TYPE.value).toBe('UT02');
    expect(n4.answers.RFR_PHOTO_DISPLAY).toBeDefined();
  });

  test('5 not fit, with three findings in three different steps', () => {
    const found = findings(catalog, n5.answers);
    expect(n5.answers.VERDICT.value).toBe('NOT_FIT');
    expect(found).toHaveLength(3);
    expect(new Set(found.map((f) => f.step)).size).toBe(3);
  });

  test('6 declared fit with a finding (R3)', () => {
    expect(verdictNeedsReview(catalog, n6.answers)).toBe(true);
    expect(n6.owner).toBe('kim');
  });

  test('7 corrected after its report, inside the 24-hour window (R7, F19)', () => {
    expect(reportState(n7)).toBe('outdated');
    const corrector = { id: 'sam', role: 'inspector' as const };
    const asSeen = { status: n7.status, createdBy: 'sam', completedAt: n7.completedAt };
    expect(canEditInspection(asSeen, corrector, n7.updatedAt)).toBe(true);
  });

  test('8 completed with warnings left', () => {
    expect(n8.status).toBe('completed');
    expect(pendingProblems(catalog, n8.answers).warnings.length).toBeGreaterThan(3);
  });

  test('9-13 drafts at steps 1, 2, 4, 5 and 7', () => {
    expect([n9, n10, n11, n12, n13].map((i) => [i.status, i.currentStep])).toEqual([
      ['draft', 1], ['draft', 2], ['draft', 4], ['draft', 5], ['draft', 7],
    ]);
    expect(Object.keys(n9.answers)).toEqual(['TRIP_DATE']);
    expect(Object.keys(n10.answers).sort()).toEqual(['TRIP_DATE', 'UNIT_TYPE']);
    expect(n12.answers.UNIT_TYPE.value).toBe('UT02');
    expect(n13.answers.VERDICT).toBeUndefined();
    expect(n13.answers.INSPECTOR_SIGNATURE).toBeUndefined();
    expect(canComplete(catalog, n13.answers)).toBe(false);
    expect(n11.answers.TRIP_REF).toBeDefined();
  });

  test('14 a reefer draft created today by the second inspector', () => {
    expect([n14.owner, n14.status, n14.answers.TRIP_DATE.value, n14.answers.UNIT_TYPE.value]).toEqual([
      'kim', 'draft', TODAY, 'UT02',
    ]);
  });
});

describe('attachments', () => {
  test('every photo and signature answer has its attachment', () => {
    for (const inspection of data.inspections) {
      for (const [code, answer] of Object.entries(inspection.answers)) {
        const kind = catalog.questions.find((q) => q.code === code)!.kind;
        if (kind === 'photo' || kind === 'signature') {
          const attachment = data.attachments.find((a) => a.id === answer.value);
          expect(attachment).toMatchObject({ inspectionId: inspection.id, questionCode: code, kind });
        }
      }
    }
  });

  test('every photo question has a placeholder, and every placeholder file exists', () => {
    const photoCodes = catalog.questions.filter((q) => q.kind === 'photo').map((q) => q.code);
    expect(Object.keys(PHOTO_ASSETS).sort()).toEqual(photoCodes.sort());
    for (const asset of new Set(data.attachments.map((a) => a.asset))) {
      expect(existsSync(path.join(__dirname, '..', 'assets', 'demo', asset))).toBe(true);
    }
  });
});
