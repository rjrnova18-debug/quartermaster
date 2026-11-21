/**
 * Loads the question catalog and checks that it is well formed.
 *
 * The catalog is data (catalog/questions.json). Changing a wording, adding a
 * question or adding a unit type is an edit to that file, never to the rules.
 * The checks are listed in docs/QUESTION-CATALOG.md.
 */
import rawCatalog from '../../catalog/questions.json';
import { Catalog, Question, SummaryField } from './model';

const KINDS = ['heading', 'check', 'choice', 'unit_type', 'text', 'digits', 'number', 'date', 'photo', 'signature'];
const REQUIREMENTS = ['required', 'recommended', 'optional'];
const SUMMARY_FIELDS: SummaryField[] = [
  'tripRef',
  'inspectionDate',
  'unitType',
  'truckPlate',
  'containerNo',
  'driverName',
  'verdict',
];

/** Returns every problem found in a catalog. An empty list means it is valid. */
export function catalogProblems(catalog: Catalog): string[] {
  const problems: string[] = [];
  const stepNumbers = catalog.steps.map((step) => step.number);
  const codes = new Set<string>();

  for (const type of catalog.unitTypes) {
    for (const group of type.groups) {
      if (!catalog.groups.includes(group)) {
        problems.push(`unit type ${type.code} uses the unknown group ${group}`);
      }
    }
  }

  for (const question of catalog.questions) {
    if (codes.has(question.code)) {
      problems.push(`the code ${question.code} is used twice`);
    }
    codes.add(question.code);

    if (!KINDS.includes(question.kind)) {
      problems.push(`${question.code} has the unknown kind ${question.kind}`);
    }
    if (!REQUIREMENTS.includes(question.requirement)) {
      problems.push(`${question.code} has the unknown requirement ${question.requirement}`);
    }
    if (!stepNumbers.includes(question.step)) {
      problems.push(`${question.code} belongs to step ${question.step}, which does not exist`);
    }
    if (question.group !== null && !catalog.groups.includes(question.group)) {
      problems.push(`${question.code} uses the unknown group ${question.group}`);
    }
    if (question.kind === 'choice' && (question.options ?? []).length < 2) {
      problems.push(`${question.code} is a choice with fewer than two options`);
    }
    if (!question.label.en.trim() || !question.label.es.trim()) {
      problems.push(`${question.code} is missing a label`);
    }
  }

  const unitTypeQuestions = catalog.questions.filter((question) => question.kind === 'unit_type');
  if (unitTypeQuestions.length !== 1) {
    problems.push(`the catalog needs exactly one unit_type question, found ${unitTypeQuestions.length}`);
  } else if (unitTypeQuestions[0].group !== null) {
    problems.push('the unit_type question cannot belong to a group');
  }

  for (const field of SUMMARY_FIELDS) {
    const code = catalog.summary[field];
    if (!codes.has(code)) {
      problems.push(`summary field ${field} points to the unknown question ${code}`);
    }
  }

  return problems;
}

/** Turns parsed JSON into a Catalog, or throws listing what is wrong with it. */
export function loadCatalog(data: unknown): Catalog {
  const catalog = data as Catalog;
  const problems = catalogProblems(catalog);
  if (problems.length > 0) {
    throw new Error(`Invalid catalog: ${problems.join('; ')}`);
  }
  return catalog;
}

/** Finds a question by its code. */
export function questionByCode(catalog: Catalog, code: string): Question | undefined {
  return catalog.questions.find((question) => question.code === code);
}

/** The catalog shipped with the app. */
export const catalog: Catalog = loadCatalog(rawCatalog);
