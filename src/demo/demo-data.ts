/**
 * The invented demo data, produced by one pure function.
 *
 * Two places use it: the server seed (scripts/seed.ts) and, later, the demo mode on the
 * phone. Everything is made up: names, plates, trip references and notes.
 *
 * The same `today` and `now` always give the same data, and the ids never depend on the
 * date. That is what makes the seed repeatable: a second run replaces the same rows
 * instead of adding fourteen more inspections.
 */
import { catalog } from '../inspection/catalog';
import {
  activeGroups,
  applyDirectoryRecord,
  finalAnswers,
  isAnswerable,
  isValidContainerNumber,
  isVisible,
} from '../inspection/form';
import { AnswerSet, Inspection, InspectionStatus, Role } from '../inspection/model';

// ---------------------------------------------------------------- shapes

export type DemoPersonKey = 'sam' | 'kim' | 'robin';

export interface DemoPerson {
  key: DemoPersonKey;
  email: string;
  fullName: string;
  role: Role;
}

export interface DemoCarrier {
  id: string;
  name: string;
  contactName: string;
}

export interface DemoDriver {
  id: string;
  name: string;
  idNumber: string;
  phone: string;
}

export interface DemoVehicle {
  id: string;
  plate: string;
  description: string;
}

/** An inspection plus who owns it. The real owner id is known only when it is loaded. */
export interface DemoInspection extends Inspection {
  owner: DemoPersonKey;
}

/** A photo or a signature. `asset` is the placeholder image in assets/demo/. */
export interface DemoAttachment {
  id: string;
  inspectionId: string;
  kind: 'photo' | 'signature';
  questionCode: string;
  asset: string;
}

export interface DemoData {
  people: DemoPerson[];
  carriers: DemoCarrier[];
  drivers: DemoDriver[];
  vehicles: DemoVehicle[];
  /** In the order of the table in DEMO-DATA.md §3: index 0 is inspection 1. */
  inspections: DemoInspection[];
  attachments: DemoAttachment[];
}

// ---------------------------------------------------------------- fixed ids

/**
 * A UUID made from a name, always the same for the same name.
 * A hash of the name (FNV-1a) seeds a small pseudo-random generator (mulberry32) that
 * gives the 32 hex digits. Not for security: only so every run gets the same ids.
 */
export function demoId(name: string): string {
  let seed = 0x811c9dc5;
  for (let i = 0; i < name.length; i++) {
    seed = Math.imul(seed ^ name.charCodeAt(i), 0x01000193) >>> 0;
  }
  let hex = '';
  while (hex.length < 32) {
    seed = (seed + 0x6d2b79f5) >>> 0;
    let t = Math.imul(seed ^ (seed >>> 15), seed | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    hex += ((t ^ (t >>> 14)) >>> 0).toString(16).padStart(8, '0');
  }
  // Mark it as a version 4 UUID, like the ones the phone creates.
  const variant = ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

// ---------------------------------------------------------------- people and directory

export const DEMO_PEOPLE: DemoPerson[] = [
  { key: 'sam', email: 'inspector@quartermaster.example', fullName: 'Sam Field', role: 'inspector' },
  { key: 'kim', email: 'inspector2@quartermaster.example', fullName: 'Kim Osei', role: 'inspector' },
  { key: 'robin', email: 'supervisor@quartermaster.example', fullName: 'Robin Hale', role: 'supervisor' },
];

const CARRIERS: [string, string][] = [
  ['Bluefin Freight', 'Nora Lind'],
  ['Tallpine Logistics', 'Ravi Menon'],
  ['Redbrick Transport', 'Jo Carver'],
  ['Harbor Lane Carriers', 'Elif Arslan'],
  ['Quillon Cargo', 'Dan Okafor'],
  ['Marlow and Finch Haulage', 'Ines Varga'],
];

const DRIVER_NAMES = [
  'Ana Diaz', 'Tom Becker', 'Lena Kovac', 'Idris Bello', 'Mei Tanaka',
  'Omar Haddad', 'Sofia Rossi', 'Pavel Novak', 'Grace Mensah', 'Luis Prieto',
];

const VEHICLES: [string, string][] = [
  ['KLM204', 'White tractor, day cab'],
  ['RTB518', 'Blue tractor, sleeper cab'],
  ['GHN331', 'Red tractor, day cab'],
  ['PXW760', 'Grey tractor, sleeper cab'],
  ['DCV142', 'White tractor, high roof'],
  ['MZA905', 'Green tractor, day cab'],
  ['TQE287', 'Silver tractor, sleeper cab'],
  ['BFL613', 'Orange tractor, day cab'],
  ['HSY478', 'Black tractor, sleeper cab'],
  ['NWJ059', 'Yellow tractor, day cab'],
];

function buildDirectory() {
  const carriers = CARRIERS.map(([name, contactName], i) => ({ id: demoId(`carrier-${i + 1}`), name, contactName }));
  const drivers = DRIVER_NAMES.map((name, i) => ({
    id: demoId(`driver-${i + 1}`),
    name,
    idNumber: `90${String(314159 + i * 7919).padStart(6, '0')}`, // eight digits starting with 90
    phone: `555${String(2100400 + i * 3517).padStart(7, '0')}`, // ten digits starting with 555
  }));
  const vehicles = VEHICLES.map(([plate, description], i) => ({ id: demoId(`vehicle-${i + 1}`), plate, description }));
  return { carriers, drivers, vehicles };
}

// ---------------------------------------------------------------- placeholder images

/** One placeholder image per photo question (made by tools/demo_images.py). */
export const PHOTO_ASSETS: Record<string, string> = {
  PHOTO_ARRIVAL: 'photo-arrival.png',
  PHOTO_EMPTY: 'photo-empty.png',
  PHOTO_LOADED: 'photo-loaded.png',
  PHOTO_CLOSED: 'photo-closed.png',
  PHOTO_SEAL: 'photo-seal.png',
  RFR_PHOTO_DISPLAY: 'photo-reefer-display.png',
};

export const DRIVER_SIGNATURE_ASSETS = ['signature-driver-1.png', 'signature-driver-2.png', 'signature-driver-3.png'];

// ---------------------------------------------------------------- dates

const MINUTE = 60 * 1000;
const DAY_MINUTES = 24 * 60;

/** `date` (YYYY-MM-DD) moved by a number of days. */
function addDays(date: string, days: number): string {
  const moved = new Date(`${date}T00:00:00Z`);
  moved.setUTCDate(moved.getUTCDate() + days);
  return moved.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------- answers

const DRY = 'UT01';
const REEFER = 'UT02';
const CONTAINER_OWNER = 'QMDU'; // invented owner code
const PLACES = ['North Yard', 'Gate 2', 'Dock 4', 'Warehouse B', 'Rail Terminal', 'Empty Depot'];
const SIZES: [string, string][] = [['20FT', '2200'], ['40FT', '3750'], ['40HC', '3900']];

/** A container number with a correct ISO 6346 check digit (rule F17). */
function containerNumber(serial: number): string {
  const base = `${CONTAINER_OWNER}${String(serial).padStart(6, '0')}`;
  for (let digit = 0; digit <= 9; digit++) {
    if (isValidContainerNumber(`${base}${digit}`)) {
      return `${base}${digit}`;
    }
  }
  throw new Error(`no check digit for ${base}`);
}

/** The same number with a wrong check digit: the app shows the F17 hint. */
function wrongContainerNumber(serial: number): string {
  const valid = containerNumber(serial);
  const wrongDigit = (Number(valid[10]) + 1) % 10;
  return `${valid.slice(0, 10)}${wrongDigit}`;
}

/**
 * The text answers of one inspection: trip, people, unit and seals.
 * Checks, photos and signatures are filled by `fullAnswers`.
 */
function facts(n: number, date: string, unitType: string, directory: ReturnType<typeof buildDirectory>): AnswerSet {
  const [size, tare] = SIZES[n % SIZES.length];
  let answers: AnswerSet = {
    TRIP_DATE: { value: date },
    TRIP_REF: { value: `T-${41027 + n * 131}` },
    OPERATION: { value: n % 2 === 1 ? 'LOADING' : 'UNLOADING' },
    ORIGIN: { value: PLACES[n % PLACES.length] },
    DESTINATION: { value: PLACES[(n + 3) % PLACES.length] },
    CHASSIS_PLATE: { value: `TRL${300 + n * 17}` },
    UNIT_TYPE: { value: unitType },
    CONTAINER_NO: { value: containerNumber(208100 + n * 37) },
    CONTAINER_SIZE: { value: size },
    TARE_KG: { value: tare },
    SEALS_ARRIVAL: { value: `QS${700100 + n * 41}` },
    SEALS_DEPARTURE: { value: `QS${800200 + n * 43}` },
    VERDICT: { value: 'FIT' },
  };
  // Rule F15: choosing a directory record fills the linked questions.
  const carrier = directory.carriers[n % directory.carriers.length];
  const driver = directory.drivers[n % directory.drivers.length];
  const vehicle = directory.vehicles[n % directory.vehicles.length];
  answers = applyDirectoryRecord(catalog, answers, 'carriers', { name: carrier.name });
  answers = applyDirectoryRecord(catalog, answers, 'drivers', {
    name: driver.name,
    idNumber: driver.idNumber,
    phone: driver.phone,
  });
  answers = applyDirectoryRecord(catalog, answers, 'vehicles', { plate: vehicle.plate });
  return answers;
}

/**
 * Every visible question answered: the facts, every check PASS, and an attachment id
 * for every photo and signature.
 */
function fullAnswers(key: string, base: AnswerSet): AnswerSet {
  const answers: AnswerSet = { ...base };
  const groups = activeGroups(catalog, base);
  for (const question of catalog.questions.filter(isAnswerable)) {
    if (!isVisible(question, groups) || answers[question.code]) {
      continue;
    }
    if (question.kind === 'check') {
      answers[question.code] = { value: 'PASS' };
    } else if (question.kind === 'photo' || question.kind === 'signature') {
      answers[question.code] = { value: demoId(`${key}/${question.code}`) };
    }
  }
  return answers;
}

/** Only the answers to questions in the given steps. */
function onlySteps(answers: AnswerSet, steps: number[]): AnswerSet {
  const kept: AnswerSet = {};
  for (const question of catalog.questions) {
    if (steps.includes(question.step) && answers[question.code]) {
      kept[question.code] = answers[question.code];
    }
  }
  return kept;
}

function without(answers: AnswerSet, codes: string[]): AnswerSet {
  const kept = { ...answers };
  for (const code of codes) {
    delete kept[code];
  }
  return kept;
}

/** The first `count` visible checks of a step, in catalog order. */
function firstChecks(answers: AnswerSet, step: number, count: number): string[] {
  const groups = activeGroups(catalog, answers);
  return catalog.questions
    .filter((q) => q.step === step && q.kind === 'check' && isVisible(q, groups))
    .slice(0, count)
    .map((q) => q.code);
}

// ---------------------------------------------------------------- the fourteen inspections

interface Plan {
  owner: DemoPersonKey;
  daysAgo: number;
  status: InspectionStatus;
  currentStep: number;
  answers: AnswerSet;
  /** Minutes before `now` (on that day) when it was created, completed, reported, last changed. */
  createdMin: number;
  completedMin: number | null;
  reportMin: number | null;
  updatedMin: number;
}

/**
 * The demo data for a phone or a seed that runs at `now` (ISO 8601) on the local
 * calendar day `today` (YYYY-MM-DD). The inspections spread over the last ten days.
 */
export function buildDemoData(today: string, now: string): DemoData {
  const directory = buildDirectory();
  const key = (n: number) => `inspection-${n}`;
  const dateOf = (daysAgo: number) => addDays(today, -daysAgo);
  const full = (n: number, daysAgo: number, unitType: string) =>
    fullAnswers(key(n), facts(n, dateOf(daysAgo), unitType, directory));

  const completed = (owner: DemoPersonKey, daysAgo: number, answers: AnswerSet, report: boolean): Plan => ({
    owner, daysAgo, status: 'completed', currentStep: 7, answers,
    createdMin: 95, completedMin: 60, reportMin: report ? 50 : null, updatedMin: 60,
  });
  const draft = (owner: DemoPersonKey, daysAgo: number, currentStep: number, answers: AnswerSet): Plan => ({
    owner, daysAgo, status: 'draft', currentStep, answers,
    createdMin: 40, completedMin: null, reportMin: null, updatedMin: 15,
  });

  // 5 · not fit: three findings with notes, in three different steps.
  const notFit: AnswerSet = {
    ...full(5, 5, DRY),
    TRC_TIRES: { value: 'FAIL', note: 'Rear left tire worn down to the wear bars' },
    CNT_DOOR_HARDWARE: { value: 'FAIL', note: 'Left door hinge moves by hand' },
    INT_DRY: { value: 'FAIL', note: 'Wet patch on the floor near the doors' },
    VERDICT: { value: 'NOT_FIT' },
    VERDICT_NOTES: { value: 'Unit refused. The carrier will send another container.' },
  };
  // 6 · declared fit with one finding (rule R3 marks it).
  const fitWithFinding: AnswerSet = {
    ...full(6, 4, DRY),
    CNT_FLOOR_REPAIRS: { value: 'FAIL', note: 'Floor board patched near the doors; firm under foot' },
    VERDICT_NOTES: { value: 'Patch checked by hand and accepted.' },
  };
  // 8 · completed anyway with recommended questions unanswered, and a malformed container number.
  const withWarnings: AnswerSet = {
    ...without(full(8, 2, REEFER), [
      'DOCS_ORDER', 'RFR_AIRFLOW', 'PHOTO_EMPTY', 'PHOTO_CLOSED', 'SEALS_DEPARTURE', 'DRIVER_SIGNATURE',
    ]),
    CONTAINER_NO: { value: wrongContainerNumber(208100 + 8 * 37) },
  };
  // 11 and 12 · drafts stopped halfway through a step.
  const halfStep4 = onlySteps(full(11, 0, DRY), [1, 2, 3]);
  const stopped4 = { ...halfStep4, ...pass(firstChecks(halfStep4, 4, 6)) };
  const upToStep4 = onlySteps(full(12, 1, REEFER), [1, 2, 3, 4]);
  const stopped5 = { ...upToStep4, ...pass(firstChecks(upToStep4, 5, 2)) };

  const plans: Plan[] = [
    completed('sam', 9, full(1, 9, DRY), true),
    completed('sam', 8, full(2, 8, DRY), true),
    completed('kim', 7, full(3, 7, DRY), false),
    completed('sam', 6, full(4, 6, REEFER), true),
    completed('sam', 5, notFit, true),
    completed('kim', 4, fitWithFinding, false),
    // 7 · report generated, then corrected 3 hours later (inside the 24-hour window): outdated.
    { ...completed('sam', 3, full(7, 3, DRY), true), createdMin: 300, completedMin: 270, reportMin: 265, updatedMin: 90 },
    completed('sam', 2, withWarnings, false),
    draft('sam', 0, 1, { TRIP_DATE: { value: dateOf(0) } }),
    draft('sam', 1, 2, { TRIP_DATE: { value: dateOf(1) }, UNIT_TYPE: { value: DRY } }),
    draft('sam', 0, 4, stopped4),
    draft('sam', 1, 5, stopped5),
    draft('sam', 0, 7, without(full(13, 0, DRY), ['VERDICT', 'INSPECTOR_SIGNATURE', 'DRIVER_SIGNATURE'])),
    draft('kim', 0, 3, onlySteps(full(14, 0, REEFER), [1, 2])),
  ];

  const at = (daysAgo: number, minutes: number) =>
    new Date(Date.parse(now) - (daysAgo * DAY_MINUTES + minutes) * MINUTE).toISOString();
  const nameOf = (owner: DemoPersonKey) => DEMO_PEOPLE.find((p) => p.key === owner)!.fullName;

  const inspections: DemoInspection[] = plans.map((plan, index) => ({
    id: demoId(key(index + 1)),
    owner: plan.owner,
    status: plan.status,
    currentStep: plan.currentStep,
    catalogVersion: catalog.version,
    inspectorName: nameOf(plan.owner),
    createdAt: at(plan.daysAgo, plan.createdMin),
    updatedAt: at(plan.daysAgo, plan.updatedMin),
    completedAt: plan.completedMin === null ? null : at(plan.daysAgo, plan.completedMin),
    reportGeneratedAt: plan.reportMin === null ? null : at(plan.daysAgo, plan.reportMin),
    // Rule F12: a completed inspection stores its final answers.
    answers: plan.status === 'completed' ? finalAnswers(catalog, plan.answers) : plan.answers,
  }));

  return {
    people: DEMO_PEOPLE,
    ...directory,
    inspections,
    attachments: inspections.flatMap((inspection, index) => attachmentsOf(inspection, index + 1)),
  };
}

function pass(codes: string[]): AnswerSet {
  return Object.fromEntries(codes.map((code) => [code, { value: 'PASS' }]));
}

/** One attachment per answered photo or signature question; the answer holds its id. */
function attachmentsOf(inspection: DemoInspection, n: number): DemoAttachment[] {
  const result: DemoAttachment[] = [];
  for (const question of catalog.questions) {
    const answer = inspection.answers[question.code];
    if (!answer || (question.kind !== 'photo' && question.kind !== 'signature')) {
      continue;
    }
    const asset =
      question.kind === 'photo'
        ? PHOTO_ASSETS[question.code]
        : question.code === 'INSPECTOR_SIGNATURE'
          ? `signature-${inspection.owner}.png`
          : DRIVER_SIGNATURE_ASSETS[n % DRIVER_SIGNATURE_ASSETS.length];
    result.push({ id: answer.value, inspectionId: inspection.id, kind: question.kind, questionCode: question.code, asset });
  }
  return result;
}
