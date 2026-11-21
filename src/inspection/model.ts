/**
 * The domain language as types. No logic lives here.
 *
 * Every term is defined in GLOSSARY.md; the catalog shape is described in
 * docs/QUESTION-CATALOG.md and the stored records in docs/DATA-MODEL.md.
 */

// ---------------------------------------------------------------- catalog

export type Locale = 'en' | 'es';

/** A text in every supported language. */
export type LocalizedText = Record<Locale, string>;

/** What a catalog row is and how it is answered. */
export type QuestionKind =
  | 'heading' // a title inside a step; never answered
  | 'check' // answered PASS, FAIL or NA
  | 'choice' // one of the question's own options
  | 'unit_type' // one of the catalog's unit types
  | 'text'
  | 'digits' // text made only of 0-9
  | 'number' // zero or a positive number
  | 'date' // YYYY-MM-DD
  | 'photo' // an attachment
  | 'signature'; // an attachment

/** How much an unanswered question matters when the inspection is completed. */
export type Requirement = 'required' | 'recommended' | 'optional';

export type DirectoryName = 'drivers' | 'carriers' | 'vehicles';

export interface ChoiceOption {
  value: string;
  label: LocalizedText;
}

/** Says which directory record field can fill a question. */
export interface DirectoryLink {
  directory: DirectoryName;
  field: string;
}

export interface Question {
  code: string;
  step: number;
  kind: QuestionKind;
  label: LocalizedText;
  requirement: Requirement;
  /** null: always shown. Otherwise shown only while this group is active. */
  group: string | null;
  options?: ChoiceOption[];
  /** Starting value. "TODAY" stands for the current date. */
  default?: string;
  filledFrom?: DirectoryLink;
}

export interface UnitType {
  code: string;
  label: LocalizedText;
  /** The groups of questions this type switches on. */
  groups: string[];
}

export interface Step {
  number: number;
  title: LocalizedText;
}

/** The fields copied from the answers to the inspection record. */
export type SummaryField =
  | 'tripRef'
  | 'inspectionDate'
  | 'unitType'
  | 'truckPlate'
  | 'containerNo'
  | 'driverName'
  | 'verdict';

export interface Catalog {
  version: number;
  groups: string[];
  unitTypes: UnitType[];
  steps: Step[];
  /** Which question feeds each summary field. */
  summary: Record<SummaryField, string>;
  /** In display order. */
  questions: Question[];
}

// ---------------------------------------------------------------- answers

export type CheckValue = 'PASS' | 'FAIL' | 'NA';

export interface Answer {
  /** Always text: a check value, an option value, a date, an attachment id... */
  value: string;
  /** Free text. Mandatory when a check is answered FAIL. */
  note?: string;
}

/** The answers of one inspection, keyed by question code. */
export type AnswerSet = Record<string, Answer>;

// ---------------------------------------------------------------- inspection

export type InspectionStatus = 'draft' | 'completed';

export type InspectionSummary = Record<SummaryField, string | null>;

export interface Inspection {
  /** UUID created on the device, so a record exists before it reaches the server. */
  id: string;
  status: InspectionStatus;
  currentStep: number;
  catalogVersion: number;
  /** Display name of the inspector who created it. */
  inspectorName: string;
  /** ISO 8601 timestamps in UTC. */
  createdAt: string;
  /** Moves only when the content (answers, status or step) changes. */
  updatedAt: string;
  completedAt: string | null;
  reportGeneratedAt: string | null;
  answers: AnswerSet;
}

/** The light record that list screens work with: no answers, only the summary. */
export interface InspectionRow {
  id: string;
  status: InspectionStatus;
  createdAt: string;
  updatedAt: string;
  reportGeneratedAt: string | null;
  summary: InspectionSummary;
}
