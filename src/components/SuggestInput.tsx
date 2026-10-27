/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

// توحيد الحروف العربية عشان البحث يلاقي "اماكن" و"أماكن" و"مصروفات" و"مصروفاة" بنفس الطريقة
const normalizeAr = (s: string): string =>
  String(s || '')
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/\s+/g, ' ')
    .trim();

/** ترتيب القيم من الأكثر استخدامًا للأقل (من غير تكرار) */
export function rankByFrequency(values: string[]): string[] {
  const counts = new Map<string, number>();
  for (const v of values) {
    const t = String(v || '').trim();
    if (t) counts.set(t, (counts.get(t) || 0) + 1);
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ar'))
    .map(e => e[0]);
}

interface SuggestInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value' | 'list'> {
  value: string;
  onChange: (value: string) => void;
  suggestions: string[];
  /** أقصى عدد اقتراحات تظهر مرة واحدة (افتراضي 5) */
  maxItems?: number;
}

const ROW_HEIGHT = 44;

/**
 * حقل كتابة بمقترحات صغيرة تحت الحقل مباشرة (بدل قائمة datalist الأصلية اللي بتغطي الشاشة كلها على الموبايل).
 * - بتظهر بعد ما تكتب حرف على الأقل، وبحد أقصى maxItems اقتراحات
 * - خلفية معتمة وخط واضح، وبتتحط فوق الحقل لو الكيبورد هيغطيها
 * - تقدر تتجاهلها وتكمل كتابة أي نص تاني بحرية
 */
export const SuggestInput: React.FC<SuggestInputProps> = ({
  value,
  onChange,
  suggestions,
  maxItems = 5,
  className,
  onFocus,
  onBlur,
  onKeyDown,
  ...rest
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const blurTimer = useRef<number | undefined>(undefined);
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const [box, setBox] = useState<{ left: number; width: number; top: number; bottom: number; viewBottom: number; viewTop: number } | null>(null);

  const matches = useMemo(() => {
    const q = normalizeAr(value);
    if (!q) return [] as string[];
    const starts: string[] = [];
    const contains: string[] = [];
    for (const s of suggestions) {
      const n = normalizeAr(s);
      if (!n || n === q) continue;
      if (n.startsWith(q)) {
        if (starts.length < maxItems) starts.push(s);
      } else if (n.includes(q)) {
        if (contains.length < maxItems) contains.push(s);
      }
      if (starts.length >= maxItems) break;
    }
    return starts.concat(contains).slice(0, maxItems);
  }, [value, suggestions, maxItems]);

  const measure = () => {
    const el = inputRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const vv = window.visualViewport;
    const viewTop = vv ? vv.offsetTop : 0;
    const viewBottom = vv ? vv.offsetTop + vv.height : window.innerHeight;
    setBox({ left: r.left, width: r.width, top: r.top, bottom: r.bottom, viewBottom, viewTop });
  };

  useEffect(() => {
    if (!open) return;
    measure();
    const handler = () => measure();
    window.addEventListener('scroll', handler, true);
    window.addEventListener('resize', handler);
    window.visualViewport?.addEventListener('resize', handler);
    window.visualViewport?.addEventListener('scroll', handler);
    return () => {
      window.removeEventListener('scroll', handler, true);
      window.removeEventListener('resize', handler);
      window.visualViewport?.removeEventListener('resize', handler);
      window.visualViewport?.removeEventListener('scroll', handler);
    };
  }, [open, value]);

  useEffect(() => () => window.clearTimeout(blurTimer.current), []);

  const choose = (s: string) => {
    onChange(s);
    setOpen(false);
    setActiveIdx(-1);
  };

  const showList = open && !!box && matches.length > 0;

  let listStyle: React.CSSProperties | undefined;
  if (showList && box) {
    const needed = matches.length * ROW_HEIGHT + 2;
    const below = box.viewBottom - box.bottom - 8;
    const above = box.top - box.viewTop - 8;
    const placeAbove = below < needed && above > below;
    const maxH = Math.max(ROW_HEIGHT, Math.min(needed, placeAbove ? above : below));
    listStyle = {
      position: 'fixed',
      left: box.left,
      width: box.width,
      top: placeAbove ? box.top - 4 : box.bottom + 4,
      transform: placeAbove ? 'translateY(-100%)' : undefined,
      maxHeight: maxH,
      overflowY: 'auto',
      zIndex: 1000,
      background: '#0f172a',
      border: '1px solid #475569',
      borderRadius: 10,
      boxShadow: '0 12px 28px rgba(0,0,0,0.65)',
      direction: 'rtl',
    };
  }

  return (
    <>
      <input
        {...rest}
        ref={inputRef}
        type="text"
        value={value}
        autoComplete="off"
        className={className}
        onChange={e => {
          onChange(e.target.value);
          setOpen(true);
          setActiveIdx(-1);
        }}
        onFocus={e => {
          window.clearTimeout(blurTimer.current);
          setOpen(true);
          onFocus?.(e);
        }}
        onBlur={e => {
          // تأخير بسيط عشان لمسة المقترح تتسجل قبل ما القائمة تتقفل
          blurTimer.current = window.setTimeout(() => setOpen(false), 200);
          onBlur?.(e);
        }}
        onKeyDown={e => {
          if (showList) {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setActiveIdx(i => (i + 1) % matches.length);
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActiveIdx(i => (i <= 0 ? matches.length - 1 : i - 1));
            } else if (e.key === 'Enter' && activeIdx >= 0) {
              e.preventDefault();
              choose(matches[activeIdx]);
            } else if (e.key === 'Escape') {
              setOpen(false);
            }
          }
          onKeyDown?.(e);
        }}
      />
      {showList && listStyle &&
        createPortal(
          <div
            role="listbox"
            style={listStyle}
            onMouseDown={e => e.preventDefault()}
          >
            {matches.map((s, i) => (
              <button
                key={s}
                type="button"
                role="option"
                aria-selected={i === activeIdx}
                onClick={() => choose(s)}
                style={{
                  display: 'block',
                  width: '100%',
                  minHeight: ROW_HEIGHT,
                  padding: '10px 14px',
                  textAlign: 'right',
                  fontSize: 14,
                  fontWeight: 700,
                  lineHeight: 1.4,
                  color: '#f8fafc',
                  background: i === activeIdx ? '#065f46' : 'transparent',
                  border: 'none',
                  borderBottom: i === matches.length - 1 ? 'none' : '1px solid #334155',
                  cursor: 'pointer',
                  whiteSpace: 'normal',
                  overflowWrap: 'anywhere',
                }}
              >
                {s}
              </button>
            ))}
          </div>,
          document.body
        )}
    </>
  );
};
