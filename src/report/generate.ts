/**
 * Makes the PDF of a completed inspection on the phone, with no connection (REPORT.md):
 * report content (R8) → HTML page → expo-print → the inspection's folder → registered as
 * its report attachment and queued for upload. Then the system share sheet opens it.
 */
import { randomUUID } from 'expo-crypto';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

import { readAsDataUri, storeReport } from '@/data/files';
import { getLocal } from '@/data/local';
import { formatMoment, MessageKey } from '@/i18n';
import { catalog } from '@/inspection/catalog';
import { Locale } from '@/inspection/model';
import { buildReport, displayValue, ReportState } from '@/inspection/review';

import { reportHtml } from './reportHtml';

type Tr = (key: MessageKey, values?: Record<string, string | number>) => string;

/** The button label for each state of rule R7 (none for drafts). */
export const REPORT_ACTION: Partial<Record<ReportState, MessageKey>> = {
  missing: 'report.generate',
  outdated: 'report.update',
  current: 'report.open',
};

export async function generateReport(inspectionId: string, locale: Locale, tr: Tr): Promise<string> {
  const store = await getLocal();
  const inspection = await store.getInspection(inspectionId);
  if (!inspection || inspection.status !== 'completed') {
    throw new Error('only a completed inspection has a report');
  }
  const report = buildReport(catalog, inspection, locale);

  const files = new Map((await store.listAttachments(inspectionId)).map((a) => [a.id, a.localUri]));
  const images: Record<string, string | null> = {};
  for (const item of [...report.photos, ...report.signatures]) {
    const uri = files.get(item.attachmentId);
    images[item.attachmentId] = uri ? await readAsDataUri(uri).catch(() => null) : null;
  }

  const verdictQuestion = catalog.questions.find((q) => q.code === catalog.summary.verdict)!;
  const now = new Date().toISOString();
  const html = reportHtml({
    report,
    tr,
    status: tr(`status.${inspection.status}`),
    inspectionDate: inspection.answers[catalog.summary.inspectionDate]?.value ?? '',
    suggestedVerdict: displayValue(catalog, verdictQuestion, report.suggestedVerdict, locale),
    generatedAt: formatMoment(now, locale),
    images,
  });

  const printed = await Print.printToFileAsync({ html, width: 595, height: 842 }); // A4 in points
  const localUri = storeReport(printed.uri, inspectionId, `inspection-${report.code}.pdf`);
  await store.saveReport(inspectionId, randomUUID(), localUri, now);
  return localUri;
}

/** "Open report": the existing file when it is current, otherwise a new one first. */
export async function openReport(inspectionId: string, state: ReportState, locale: Locale, tr: Tr) {
  let uri: string | null = null;
  if (state === 'current') {
    const store = await getLocal();
    uri = (await store.listAttachments(inspectionId)).find((a) => a.kind === 'report')?.localUri ?? null;
  }
  if (!uri) {
    uri = await generateReport(inspectionId, locale, tr);
  }
  await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: tr('report.open') });
}
