/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { printHtmlDocument } from './printHtml';

const esc = (v: any) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// طباعة جدول بتنسيق A4 عربي (بتفتح نافذة طباعة)
export function printTable(title: string, subtitle: string, headers: string[], rows: (string | number)[][], footerRow?: (string | number)[]) {
  const body = rows.map(r => `<tr>${r.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('');
  const foot = footerRow ? `<tfoot><tr>${footerRow.map(c => `<td>${esc(c)}</td>`).join('')}</tr></tfoot>` : '';
  const html = `<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="UTF-8"><title>${esc(title)}</title>
    <style>
      @page { size: A4 landscape; margin: 12mm; }
      body { font-family: 'Calibri','Cairo',Arial,sans-serif; direction: rtl; color:#111; font-size:12px; }
      h1 { font-size:18px; margin:0 0 4px; } p { margin:0 0 12px; color:#555; }
      table { width:100%; border-collapse:collapse; }
      th, td { border:1px solid #bbb; padding:5px 7px; text-align:right; }
      th { background:#f1f5f9; } tfoot td { font-weight:bold; background:#f8fafc; }
    </style></head><body>
    <h1>${esc(title)}</h1><p>${esc(subtitle)}</p>
    <table><thead><tr>${headers.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${body}</tbody>${foot}</table>
    </body></html>`;
  printHtmlDocument(html, { title, landscape: true, features: 'width=1100,height=700' });
}
