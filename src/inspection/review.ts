/**
 * What is read out of inspections once they exist: findings, the suggested
 * verdict, the history list, the home counters and the content of the report.
 *
 * Pure functions, like form.ts. Rule numbers (R1, R2...) refer to
 * docs/REVIEW-RULES.md.
 */
import { answerNote, answerValue, applicableSteps, visibleQuestions } from './form';
import {
  AnswerSet,
  Catalog,
  CheckValue,
  Inspection,
  InspectionRow,
  Locale,
  Question,
  SummaryField,
} from './model';

// ---------------------------------------------------------------- R1-R3 findings and verdict

/** A check answered FAIL. */
export interface Finding {
  code: string;
  step: number;
  note: string;
}

/** R1. The failed checks among the visible questions, in catalog order. */
export function findings(catalog: Catalog, answers: AnswerSet): Finding[] {
  return visibleQuestions(catalog, answers)
    .filter((question) => question.kind === 'check' && answerValue(answers, question.code) === 'FAIL')
    .map((question) => ({
      code: question.code,
      step: question.step,
      note: answerNote(answers, question.code),
    }));
}

export type Verdict = 'FIT' | 'NOT_FIT';

/** R2. The verdict the answers point to: any finding means NOT_FIT. */
export function suggestedVerdict(catalog: Catalog, answers: AnswerSet): Verdict {
  return findings(catalog, answers).length === 0 ? 'FIT' : 'NOT_FIT';
}

/**
 * R3. True when the inspector declared the unit FIT although there are
 * findings. The inspector decides; the app only asks for a second look.
 */
export function verdictNeedsReview(catalog: Catalog, answers: AnswerSet): boolean {
  const chosen = answerValue(answers, catalog.summary.verdict);
  return chosen === 'FIT' && suggestedVerdict(catalog, answers) === 'NOT_FIT';
}

// ---------------------------------------------------------------- R4 display code

/** R4. A short code people can read aloud, taken from the inspection id. */
export function displayCode(id: string): string {
  const letters = id.replace(/[^0-9a-zA-Z]/g, '').slice(0, 8).toUpperCase();
  return `INS-${letters}`;
}

// ---------------------------------------------------------------- R5-R6 lists

export type HistoryFilter = 'all' | 'drafts' | 'completed' | 'today';

/** Search ignores case, spaces and hyphens: "abc 123" finds "ABC-123". */
function searchable(text: string | null): string {
  return (text ?? '').replace(/[\s-]/g, '').toLowerCase();
}

function newestFirst(a: InspectionRow, b: InspectionRow): number {
  return Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
}

/**
 * R5. The history list: one filter plus an optional search text, newest first.
 * The search looks inside the trip reference, the truck plate, the container
 * number, the driver's name and the display code. `today` is YYYY-MM-DD.
 */
export function filterHistory(
  rows: InspectionRow[],
  filter: HistoryFilter,
  search: string,
  today: string,
): InspectionRow[] {
  const wanted = searchable(search);

  const matchesFilter = (row: InspectionRow): boolean => {
    if (filter === 'drafts') return row.status === 'draft';
    if (filter === 'completed') return row.status === 'completed';
    if (filter === 'today') return row.summary.inspectionDate === today;
    return true;
  };

  const matchesSearch = (row: InspectionRow): boolean => {
    if (wanted === '') return true;
    const fields = [
      row.summary.tripRef,
      row.summary.truckPlate,
      row.summary.containerNo,
      row.summary.driverName,
      displayCode(row.id),
    ];
    return fields.some((field) => searchable(field).includes(wanted));
  };

  return rows.filter((row) => matchesFilter(row) && matchesSearch(row)).sort(newestFirst);
}

export const RESUME_LIMIT = 5;

export interface HomeSummary {
  inspectionsToday: number;
  draftsPending: number;
  /** The drafts offered to continue: the most recently touched ones. */
  resume: InspectionRow[];
}

/** R6. The numbers and the "continue" list of the home screen. */
export function homeSummary(rows: InspectionRow[], today: string): HomeSummary {
  const drafts = rows.filter((row) => row.status === 'draft').sort(newestFirst);
  return {
    inspectionsToday: rows.filter((row) => row.summary.inspectionDate === today).length,
    draftsPending: drafts.length,
    resume: drafts.slice(0, RESUME_LIMIT),
  };
}

// ---------------------------------------------------------------- R7 report state

export type ReportState =
  | 'not_available' // a draft has no report
  | 'missing' // completed, never generated
  | 'outdated' // the inspection changed after the report was generated
  | 'current';

/** R7. Whether the stored report still shows what the inspection says. */
export function reportState(
  row: Pick<InspectionRow, 'status' | 'updatedAt' | 'reportGeneratedAt'>,
): ReportState {
  if (row.status !== 'completed') return 'not_available';
  if (row.reportGeneratedAt === null) return 'missing';
  return Date.parse(row.reportGeneratedAt) < Date.parse(row.updatedAt) ? 'outdated' : 'current';
}

// ---------------------------------------------------------------- R8-R9 report content

export const BLANK = '—';

const CHECK_WORDS: Record<Locale, Record<CheckValue, string>> = {
  en: { PASS: 'Pass', FAIL: 'Fail', NA: 'N/A' },
  es: { PASS: 'Cumple', FAIL: 'No cumple', NA: 'N/A' },
};

/** The text a person reads for a stored value. */
export function displayValue(catalog: Catalog, question: Question, value: string, locale: Locale): string {
  if (value === '') return BLANK;
  if (question.kind === 'check') {
    return CHECK_WORDS[locale][value as CheckValue] ?? value;
  }
  if (question.kind === 'choice') {
    const option = (question.options ?? []).find((candidate) => candidate.value === value);
    return option ? option.label[locale] : value;
  }
  if (question.kind === 'unit_type') {
    const unitType = catalog.unitTypes.find((candidate) => candidate.code === value);
    return unitType ? unitType.label[locale] : value;
  }
  return value;
}

export interface ReportFact {
  label: string;
  value: string;
}

export interface ReportLine {
  code: string;
  isHeading: boolean;
  label: string;
  value: string;
  note: string | null;
  /** Set only for checks, so the layout can stamp them. */
  result: CheckValue | null;
}

export interface ReportSection {
  step: number;
  title: string;
  lines: ReportLine[];
}

export interface ReportFinding {
  stepTitle: string;
  label: string;
  note: string;
}

export interface ReportAttachment {
  code: string;
  label: string;
  attachmentId: string;
}

export interface ReportDocument {
  code: string;
  status: Inspection['status'];
  inspectorName: string;
  catalogVersion: number;
  /** The summary of the inspection: trip, date, unit, plates, driver. */
  facts: ReportFact[];
  verdict: string;
  suggestedVerdict: Verdict;
  verdictNeedsReview: boolean;
  findings: ReportFinding[];
  sections: ReportSection[];
  photos: ReportAttachment[];
  signatures: ReportAttachment[];
}

/**
 * R8. Everything the report shows, already turned into display text.
 * The layout (docs/REPORT.md) only places these values on the page.
 */
export function buildReport(catalog: Catalog, inspection: Inspection, locale: Locale): ReportDocument {
  const answers = inspection.answers;
  const visible = visibleQuestions(catalog, answers);
  const byCode = new Map(catalog.questions.map((question) => [question.code, question]));
  const stepTitle = (step: number): string =>
    catalog.steps.find((candidate) => candidate.number === step)?.title[locale] ?? '';
  const shown = (question: Question): string =>
    displayValue(catalog, question, answerValue(answers, question.code), locale);
  const isAttachment = (question: Question): boolean =>
    question.kind === 'photo' || question.kind === 'signature';

  const factFields = (Object.keys(catalog.summary) as SummaryField[]).filter((field) => field !== 'verdict');
  const facts = factFields.map((field) => {
    const question = byCode.get(catalog.summary[field]) as Question;
    return { label: question.label[locale], value: shown(question) };
  });

  const sections = applicableSteps(catalog, answers).map((step) => ({
    step,
    title: stepTitle(step),
    lines: visible
      .filter((question) => question.step === step && !isAttachment(question))
      .map((question) => {
        const value = answerValue(answers, question.code);
        const note = answerNote(answers, question.code);
        return {
          code: question.code,
          isHeading: question.kind === 'heading',
          label: question.label[locale],
          value: question.kind === 'heading' ? '' : shown(question),
          note: note === '' ? null : note,
          result: question.kind === 'check' && value !== '' ? (value as CheckValue) : null,
        };
      }),
  }));

  const attachments = (kind: 'photo' | 'signature'): ReportAttachment[] =>
    visible
      .filter((question) => question.kind === kind && answerValue(answers, question.code) !== '')
      .map((question) => ({
        code: question.code,
        label: question.label[locale],
        attachmentId: answerValue(answers, question.code),
      }));

  return {
    code: displayCode(inspection.id),
    status: inspection.status,
    inspectorName: inspection.inspectorName,
    catalogVersion: inspection.catalogVersion,
    facts,
    verdict: shown(byCode.get(catalog.summary.verdict) as Question),
    suggestedVerdict: suggestedVerdict(catalog, answers),
    verdictNeedsReview: verdictNeedsReview(catalog, answers),
    findings: findings(catalog, answers).map((finding) => ({
      stepTitle: stepTitle(finding.step),
      label: (byCode.get(finding.code) as Question).label[locale],
      note: finding.note,
    })),
    sections,
    photos: attachments('photo'),
    signatures: attachments('signature'),
  };
}

/** R9. A plain-text summary to paste into a message: one "label: value" per line. */
export function shareText(report: ReportDocument): string {
  const lines = [report.code];
  for (const fact of report.facts) {
    if (fact.value !== BLANK) {
      lines.push(`${fact.label}: ${fact.value}`);
    }
  }
  if (report.verdict !== BLANK) {
    lines.push(report.verdict);
  }
  return lines.join('\n');
}
