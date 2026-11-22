/**
 * The shared directory of drivers, carriers and vehicles (UI-BRIEF §7, DATA-MODEL §1).
 * Pure rules: which fields each record has, how they are cleaned, what is refused,
 * and how the list is searched. Shared by every module of the app, so it lives outside
 * src/inspection/.
 */
import { DirectoryName } from '@/inspection/model';

export type DirectoryKind = DirectoryName;

/** Every record is a flat set of text fields plus its id. */
export type DirectoryRecord = { id: string } & Record<string, string>;

export interface FieldSpec {
  key: string;
  required: boolean;
  digits: boolean;
  /** Stored in upper case without spaces or hyphens (plates). */
  plate: boolean;
}

const field = (key: string, extra: Partial<FieldSpec> = {}): FieldSpec => ({
  key,
  required: false,
  digits: false,
  plate: false,
  ...extra,
});

/** The fields of each kind, in form order. The first one names the record. */
export const FIELDS: Record<DirectoryKind, FieldSpec[]> = {
  drivers: [field('name', { required: true }), field('idNumber', { required: true, digits: true }), field('phone', { digits: true })],
  carriers: [field('name', { required: true }), field('contactName')],
  vehicles: [field('plate', { required: true, plate: true }), field('description')],
};

/** The field two records may not share (DATA-MODEL §1 "Unique"). */
const UNIQUE: Record<DirectoryKind, string> = { drivers: 'idNumber', carriers: 'name', vehicles: 'plate' };

export function normalizePlate(text: string): string {
  return text.replace(/[\s-]/g, '').toUpperCase();
}

/** Trims every field; plates in upper case without spaces or hyphens. */
export function cleanRecord(kind: DirectoryKind, record: DirectoryRecord): DirectoryRecord {
  const clean: DirectoryRecord = { id: record.id };
  for (const spec of FIELDS[kind]) {
    const value = (record[spec.key] ?? '').trim().replace(/\s+/g, ' ');
    clean[spec.key] = spec.plate ? normalizePlate(value) : value;
  }
  return clean;
}

export type RecordProblem =
  | { field: string; reason: 'required' | 'digits_only' }
  | { field: string; reason: 'duplicate'; existing: DirectoryRecord };

/**
 * What stops a record from being saved: a required field left blank, letters in a
 * digits field, or another record with the same ID number, carrier name (ignoring
 * case) or plate. `others` are the records already in the directory.
 */
export function recordProblems(kind: DirectoryKind, record: DirectoryRecord, others: DirectoryRecord[]): RecordProblem[] {
  const clean = cleanRecord(kind, record);
  const problems: RecordProblem[] = [];
  for (const spec of FIELDS[kind]) {
    const value = clean[spec.key];
    if (spec.required && value === '') problems.push({ field: spec.key, reason: 'required' });
    else if (spec.digits && value !== '' && !/^[0-9]+$/.test(value)) problems.push({ field: spec.key, reason: 'digits_only' });
  }
  const key = UNIQUE[kind];
  const sameKey = (a: string, b: string) => (kind === 'carriers' ? a.toLowerCase() === b.toLowerCase() : a === b);
  const existing = others.find((o) => o.id !== clean.id && clean[key] !== '' && sameKey(cleanRecord(kind, o)[key], clean[key]));
  if (existing) problems.push({ field: key, reason: 'duplicate', existing });
  return problems;
}

/** The text that names a record in lists and messages. */
export function recordTitle(kind: DirectoryKind, record: DirectoryRecord): string {
  return record[FIELDS[kind][0].key] ?? '';
}

/** The second line of a list row: the other fields that have a value. */
export function recordDetail(kind: DirectoryKind, record: DirectoryRecord): string {
  return FIELDS[kind]
    .slice(1)
    .map((spec) => record[spec.key])
    .filter((value) => value)
    .join(' · ');
}

const searchable = (text: string) => text.replace(/[\s-]/g, '').toLowerCase();

/** Alphabetical; the search looks in every field and ignores case, spaces and hyphens. */
export function searchRecords(kind: DirectoryKind, records: DirectoryRecord[], text: string): DirectoryRecord[] {
  const wanted = searchable(text);
  return records
    .filter((record) => wanted === '' || FIELDS[kind].some((spec) => searchable(record[spec.key] ?? '').includes(wanted)))
    .sort((a, b) => recordTitle(kind, a).localeCompare(recordTitle(kind, b)));
}
