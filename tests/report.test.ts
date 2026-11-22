/** The report page (REPORT.md): order of blocks, escaping, missing photos, and base64. */
import { buildDemoData } from '../src/demo/demo-data';
import { t } from '../src/i18n';
import { catalog } from '../src/inspection/catalog';
import { buildReport } from '../src/inspection/review';
import { escapeHtml, reportHtml, toBase64 } from '../src/report/reportHtml';

const data = buildDemoData('2026-03-10', '2026-03-10T15:00:00.000Z');
const notFit = data.inspections[4]; // 5 · not fit, three findings
const clean = data.inspections[0]; // 1 · fit, no findings

function page(inspection: typeof notFit, images: Record<string, string | null> = {}) {
  return reportHtml({
    report: buildReport(catalog, inspection, 'en'),
    tr: (key, values) => t('en', key, values),
    status: 'Completed',
    inspectionDate: inspection.answers.TRIP_DATE.value,
    suggestedVerdict: 'Not fit',
    generatedAt: '10 Mar, 15:00',
    images,
  });
}

test('findings come before the full checklist, and failed rows are marked', () => {
  const html = page(notFit);
  expect(html.indexOf('>Findings<')).toBeGreaterThan(0);
  expect(html.indexOf('>Findings<')).toBeLessThan(html.indexOf('1 · '));
  expect(html).toContain('Left door hinge moves by hand');
  expect(html).toContain('Findings: 3');
  expect(html.match(/<tr class="fail">/g)?.length).toBeGreaterThanOrEqual(6); // 3 findings + 3 checklist rows
});

test('without findings there is no findings block and the verdict says so', () => {
  const html = page(clean);
  expect(html).not.toContain('>Findings<');
  expect(html).toContain('No findings');
});

test('a photo that is not on the phone becomes a framed placeholder; one that is, an image', () => {
  const report = buildReport(catalog, clean, 'en');
  const [first, second] = report.photos;
  const html = page(clean, { [first.attachmentId]: 'data:image/png;base64,AAAA', [second.attachmentId]: null });
  expect(html).toContain('src="data:image/png;base64,AAAA"');
  expect(html).toContain('Photo not available offline');
});

test('text from answers can never become markup', () => {
  expect(escapeHtml('<b>"Tom" & \'Ana\'</b>')).toBe('&lt;b&gt;&quot;Tom&quot; &amp; &#39;Ana&#39;&lt;/b&gt;');
  const tricky = { ...notFit, answers: { ...notFit.answers, ORIGIN: { value: '<script>x</script>' } } };
  expect(page(tricky)).not.toContain('<script>x');
});

test('base64 matches Node for every padding length', () => {
  for (const length of [0, 1, 2, 3, 4, 5, 300]) {
    const bytes = Uint8Array.from({ length }, (_, i) => (i * 37) % 256);
    expect(toBase64(bytes)).toBe(Buffer.from(bytes).toString('base64'));
  }
});
