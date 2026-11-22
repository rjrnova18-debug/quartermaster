/**
 * The report page (REPORT.md) as HTML, from the content buildReport() prepared (R8).
 * A pure function: the phone turns its result into a PDF with expo-print.
 *
 * Printable in black and white: every result is a word, a failed check is also bold and
 * marked in the margin. Plain readable type; only the wordmark is "pixel".
 */
import { MessageKey } from '@/i18n';
import { ReportAttachment, ReportDocument } from '@/inspection/review';

type Tr = (key: MessageKey, values?: Record<string, string | number>) => string;

export interface ReportPageInput {
  report: ReportDocument;
  tr: Tr;
  /** The status in words ("Completed"). */
  status: string;
  inspectionDate: string;
  /** The suggested verdict in words ("Not fit"). */
  suggestedVerdict: string;
  generatedAt: string;
  /** attachment id → data URI of the image, or null when the file is not on the phone. */
  images: Record<string, string | null>;
}

/** Text placed in the page can never become markup. */
export function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

const STYLE = `
  @page { size: A4; margin: 15mm; }
  * { box-sizing: border-box; }
  body { font-family: Roboto, "Helvetica Neue", Arial, sans-serif; font-size: 10.5pt; color: #1F1A2B; margin: 0; }
  header { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2px solid #1F1A2B; padding-bottom: 6px; }
  .wordmark { font-family: "Courier New", monospace; font-weight: bold; letter-spacing: 2px; font-size: 9pt; }
  h1 { font-size: 15pt; margin: 2px 0; letter-spacing: 1px; }
  h2 { font-size: 11pt; margin: 14px 0 4px; letter-spacing: 1px; text-transform: uppercase; }
  .code { font-size: 13pt; font-weight: bold; }
  .muted { color: #4A4257; }
  .facts { display: grid; grid-template-columns: 1fr 1fr; gap: 2px 18px; margin-top: 10px; }
  .facts div { display: flex; justify-content: space-between; gap: 8px; border-bottom: 1px dotted #C9C1CF; }
  .verdict { display: flex; align-items: center; gap: 18px; margin-top: 12px; page-break-inside: avoid; }
  .stamp { border: 3px solid #1F1A2B; padding: 8px 18px; font-size: 17pt; font-weight: bold; letter-spacing: 2px; }
  table { width: 100%; border-collapse: collapse; }
  tr { page-break-inside: avoid; }
  td, th { border-bottom: 1px solid #C9C1CF; padding: 3px 4px; vertical-align: top; text-align: left; }
  th { font-size: 9pt; color: #4A4257; }
  td.mark { width: 14px; font-weight: bold; }
  tr.fail td { font-weight: bold; }
  tr.heading td { font-weight: bold; background: #F6EEDB; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  figure { margin: 0; page-break-inside: avoid; }
  figure img { width: 100%; max-height: 75mm; object-fit: contain; border: 1px solid #C9C1CF; }
  .missing { border: 2px dashed #8B8398; height: 40mm; display: flex; align-items: center; justify-content: center; }
  figcaption { font-size: 9pt; margin-top: 2px; }
  .signatures { page-break-inside: avoid; }
  footer { margin-top: 16px; border-top: 1px solid #1F1A2B; padding-top: 4px; font-size: 8.5pt; color: #4A4257; }
`;

function figure(item: ReportAttachment, images: Record<string, string | null>, missing: string): string {
  const src = images[item.attachmentId];
  const picture = src ? `<img src="${src}" alt="${escapeHtml(item.label)}">` : `<div class="missing">${escapeHtml(missing)}</div>`;
  return `<figure>${picture}<figcaption>${escapeHtml(item.label)}</figcaption></figure>`;
}

export function reportHtml({ report, tr, status, inspectionDate, suggestedVerdict, generatedAt, images }: ReportPageInput): string {
  const e = escapeHtml;
  const facts = report.facts.map((f) => `<div><span class="muted">${e(f.label)}</span><span>${e(f.value)}</span></div>`).join('');

  const findings =
    report.findings.length === 0
      ? ''
      : `<h2>${e(tr('report.findings'))}</h2><table>${report.findings
          .map((f) => `<tr class="fail"><td class="mark">!</td><td>${e(f.stepTitle)}</td><td>${e(f.label)}</td><td>${e(f.note)}</td></tr>`)
          .join('')}</table>`;

  const sections = report.sections
    .map((section) => {
      const rows = section.lines
        .map((line) =>
          line.isHeading
            ? `<tr class="heading"><td></td><td colspan="3">${e(line.label)}</td></tr>`
            : `<tr class="${line.result === 'FAIL' ? 'fail' : ''}"><td class="mark">${line.result === 'FAIL' ? '!' : ''}</td>` +
              `<td>${e(line.label)}</td><td>${e(line.value)}</td><td>${e(line.note ?? '')}</td></tr>`,
        )
        .join('');
      return (
        `<h2>${section.step} · ${e(section.title)}</h2><table><tr><th></th><th>${e(tr('report.question'))}</th>` +
        `<th>${e(tr('report.answer'))}</th><th>${e(tr('report.note'))}</th></tr>${rows}</table>`
      );
    })
    .join('');

  const photos =
    report.photos.length === 0
      ? ''
      : `<h2>${e(tr('report.photos'))}</h2><div class="grid">${report.photos.map((p) => figure(p, images, tr('report.noPhoto'))).join('')}</div>`;
  const signatures =
    report.signatures.length === 0
      ? ''
      : `<div class="signatures"><h2>${e(tr('report.signatures'))}</h2><div class="grid">${report.signatures
          .map((s) => figure(s, images, tr('report.noPhoto')))
          .join('')}</div></div>`;

  return `<!doctype html><html><head><meta charset="utf-8"><style>${STYLE}</style></head><body>
<header>
  <div><div class="wordmark">QUARTERMASTER</div><h1>${e(tr('report.title').toUpperCase())}</h1>
  <div class="muted">${e(status)} · ${e(inspectionDate)} · ${e(tr('report.inspector', { name: report.inspectorName }))}</div></div>
  <div class="code">${e(report.code)}</div>
</header>
<section class="facts">${facts}</section>
<section class="verdict">
  <div class="stamp">${e(report.verdict.toUpperCase())}</div>
  <div>
    <div>${e(report.findings.length === 0 ? tr('report.noFindings') : tr('report.findingsCount', { count: report.findings.length }))}</div>
    <div class="muted">${e(tr('report.suggested', { verdict: suggestedVerdict }))}</div>
    ${report.verdictNeedsReview ? `<div><strong>! ${e(tr('report.review'))}</strong></div>` : ''}
  </div>
</section>
${findings}
${sections}
${photos}
${signatures}
<footer>${e(tr('report.footer', { time: generatedAt, version: report.catalogVersion }))}</footer>
</body></html>`;
}

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Bytes as base64, to embed an image in the page (data:image/jpeg;base64,…). */
export function toBase64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const [a, b = 0, c = 0] = [bytes[i], bytes[i + 1], bytes[i + 2]];
    const n = (a << 16) | (b << 8) | c;
    out += ALPHABET[(n >> 18) & 63] + ALPHABET[(n >> 12) & 63];
    out += i + 1 < bytes.length ? ALPHABET[(n >> 6) & 63] : '=';
    out += i + 2 < bytes.length ? ALPHABET[n & 63] : '=';
  }
  return out;
}
