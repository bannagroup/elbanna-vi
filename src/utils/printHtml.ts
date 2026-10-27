/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// طباعة موحّدة:
// - تطبيق الموبايل (Capacitor/Android): WebView مابيدعمش window.print() ولا window.open،
//   فبنستخدم جسر أصلي (AndroidPrint) بيفتح شاشة الطباعة بتاعة أندرويد (طابعة أو "حفظ كـ PDF").
// - المتصفح: زي ما كان (نافذة جديدة + window.print).

type PaperName = 'A4' | 'A4L' | 'A5';

interface AndroidPrintBridge {
  print: (html: string, title: string, paper: string) => void;
  printPage: (title: string, paper: string) => void;
}

const getBridge = (): AndroidPrintBridge | null => {
  if (typeof window === 'undefined') return null;
  const b = (window as any).AndroidPrint;
  return b && typeof b.print === 'function' && typeof b.printPage === 'function' ? (b as AndroidPrintBridge) : null;
};

const isNativeApp = (): boolean => {
  try {
    return !!(window as any).Capacitor?.isNativePlatform?.();
  } catch {
    return false;
  }
};

const NEED_UPDATE_MSG = 'الطباعة محتاجة النسخة الأحدث من التطبيق. حدّث التطبيق (ثبّت آخر APK) وجرّب تاني.';
const POPUP_MSG = 'تعذر فتح نافذة الطباعة. اسمح بالنوافذ المنبثقة (Pop-ups) لهذا الموقع وجرّب تاني.';

/** طباعة مستند HTML كامل. بترجّع true لو الطباعة بدأت. */
export function printHtmlDocument(
  html: string,
  opts: { title?: string; landscape?: boolean; features?: string } = {}
): boolean {
  if (typeof window === 'undefined') return false;
  const title = opts.title || 'طباعة';

  const bridge = getBridge();
  if (bridge) {
    try {
      bridge.print(html, title, opts.landscape ? 'A4L' : 'A4');
      return true;
    } catch (e) {
      console.warn('native print failed', e);
      alert('تعذر بدء الطباعة على الجهاز.');
      return false;
    }
  }

  if (isNativeApp()) {
    alert(NEED_UPDATE_MSG);
    return false;
  }

  const win = window.open('', '_blank', opts.features);
  if (!win) {
    alert(POPUP_MSG);
    return false;
  }
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => {
    try {
      win.print();
    } catch (e) {
      console.warn('print failed', e);
    }
  }, 350);
  return true;
}

/**
 * في تطبيق الموبايل: يخلّي window.print() يطبع الصفحة الحالية عن طريق شاشة الطباعة بتاعة أندرويد
 * (بنفس تنسيق @media print الموجود، زي معاينة A5 للفواتير والتقارير).
 * بيتنادى مرة واحدة عند بدء التطبيق. على المتصفح مابيعملش حاجة.
 */
export function installNativePrint(): void {
  if (typeof window === 'undefined') return;
  const bridge = getBridge();
  if (!bridge) return;
  window.print = () => {
    const paper: PaperName = document.body.classList.contains('a5-print-active') ? 'A5' : 'A4';
    try {
      bridge.printPage(document.title || 'طباعة', paper);
    } catch (e) {
      console.warn('native printPage failed', e);
      alert('تعذر بدء الطباعة على الجهاز.');
    }
  };
}
