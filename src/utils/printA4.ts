/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { printHtmlDocument } from './printHtml';

// قالب طباعة A4 موحّد للتقارير (الربحية، الفواتير، العهد): رأس فيه اسم الشركة وعنوان التقرير والفترة،
// وتذييل فيه تاريخ الطباعة واسم المستخدم. الرأس والتذييل بيتكرروا على كل صفحة (thead/tfoot).

export interface A4ReportOptions {
  title: string;
  subtitle?: string;          // مثال: "من 2026-10-01 إلى 2026-10-14"
  user: string;               // اسم المستخدم اللي طبع
  headers: string[];
  rows: (string | number)[][];
  totalsRow?: (string | number)[];
  summary?: { label: string; value: string }[]; // ملخص أرقام فوق الجدول
  orientation?: 'portrait' | 'landscape';
  company?: string;
  printedAt?: Date;
  // أعمدة أرقام الصافي: القيم السالبة بتتلوّن أحمر والموجبة أخضر
  signedColumns?: number[];
  notes?: string;
}

const esc = (v: unknown) =>
  String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const pad = (n: number) => String(n).padStart(2, '0');

// تاريخ ووقت بصيغة ثابتة (أرقام لاتينية) — YYYY-MM-DD HH:mm
export function formatPrintStamp(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const summaryHtml = (opts: A4ReportOptions) =>
  opts.summary && opts.summary.length
    ? `<div class="summary">${opts.summary.map(s => `<div><span>${esc(s.label)}</span><b>${esc(s.value)}</b></div>`).join('')}</div>`
    : '';

export function buildA4ReportHtml(opts: A4ReportOptions): string {
  const orientation = opts.orientation || 'landscape';
  const company = opts.company || 'مجموعة البنا جروب';
  const stamp = formatPrintStamp(opts.printedAt || new Date());
  const cols = Math.max(opts.headers.length, 1);
  const signed = new Set(opts.signedColumns || []);

  const cell = (v: string | number, i: number) => {
    let cls = '';
    if (signed.has(i) && typeof v === 'number') cls = v < 0 ? ' class="neg"' : v > 0 ? ' class="pos"' : '';
    const text = typeof v === 'number' ? v.toLocaleString('en-US') : v;
    return `<td${cls}>${esc(text)}</td>`;
  };

  const sm = summaryHtml(opts);
  const summaryRow = sm ? `<tr class="summary-row"><td colspan="${cols}">${sm}</td></tr>` : '';
  const body = opts.rows.map(r => `<tr>${r.map(cell).join('')}</tr>`).join('');
  const totals = opts.totalsRow
    ? `<tr class="totals">${opts.totalsRow.map(cell).join('')}</tr>`
    : '';

  return `<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="UTF-8"><title>${esc(opts.title)}</title>
<style>
  @page { size: A4 ${orientation}; margin: 10mm 10mm 12mm 10mm; @bottom-center { content: "صفحة " counter(page) " من " counter(pages); font-size: 9px; color: #64748b; } }
  * { box-sizing: border-box; }
  body { font-family: 'Cairo','Calibri',Arial,sans-serif; direction: rtl; color: #0f172a; font-size: 11px; margin: 0; }
  table.report { width: 100%; border-collapse: collapse; }
  table.report thead { display: table-header-group; }
  table.report tfoot { display: table-footer-group; }
  tr { page-break-inside: avoid; break-inside: avoid; }
  .page-head td { border: 0; padding: 0 0 6px; text-align: right; }
  .page-head .top { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2px solid #0f172a; padding-bottom: 5px; }
  .page-head .company { font-size: 11px; font-weight: 700; color: #475569; }
  .page-head h1 { font-size: 17px; margin: 2px 0 0; }
  .page-head .sub { font-size: 11px; color: #475569; margin-top: 2px; }
  .page-head .meta { font-size: 10px; color: #475569; text-align: left; line-height: 1.6; }
  tr.summary-row td { border: 0; padding: 0; }
  .summary { display: flex; flex-wrap: wrap; gap: 6px; margin: 6px 0; }
  .summary div { border: 1px solid #cbd5e1; border-radius: 4px; padding: 3px 8px; min-width: 110px; }
  .summary span { display: block; font-size: 9px; color: #64748b; }
  .summary b { font-size: 12px; }
  th, td { border: 1px solid #94a3b8; padding: 4px 6px; text-align: center; }
  th { background: #f1f5f9; font-weight: 800; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  tbody tr:nth-child(even) { background: #f8fafc; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  tr.totals td { font-weight: 800; background: #e2e8f0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .neg { color: #dc2626; font-weight: 700; } .pos { color: #047857; font-weight: 700; }
  .page-foot td { border: 0; padding-top: 6px; font-size: 9px; color: #64748b; text-align: right; }
  .page-foot .row { display: flex; justify-content: space-between; border-top: 1px solid #cbd5e1; padding-top: 3px; }
  .notes { margin-top: 8px; font-size: 10px; color: #475569; }
</style></head><body>
<table class="report">
  <thead>
    <tr class="page-head"><td colspan="${cols}"><div class="top">
      <div><div class="company">${esc(company)}</div><h1>${esc(opts.title)}</h1>${opts.subtitle ? `<div class="sub">${esc(opts.subtitle)}</div>` : ''}</div>
      <div class="meta"><div>تاريخ الطباعة: ${esc(stamp)}</div><div>المستخدم: ${esc(opts.user)}</div></div>
    </div></td></tr>
    <tr>${opts.headers.map(h => `<th>${esc(h)}</th>`).join('')}</tr>
  </thead>
  <tbody>${summaryRow}${body}${totals}</tbody>
  <tfoot>
    <tr class="page-foot"><td colspan="${cols}"><div class="row"><span>${esc(company)} — ${esc(opts.title)}</span><span>طُبع بواسطة ${esc(opts.user)} — ${esc(stamp)}</span></div></td></tr>
  </tfoot>
</table>
${opts.notes ? `<div class="notes">${esc(opts.notes)}</div>` : ''}
</body></html>`;
}

// فتح نافذة طباعة بالقالب
export function printA4Report(opts: A4ReportOptions): boolean {
  if (typeof window === 'undefined') return false;
  return printHtmlDocument(buildA4ReportHtml(opts), {
    title: opts.title,
    landscape: opts.orientation === 'landscape',
    features: 'width=1100,height=750',
  });
}
