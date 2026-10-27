import {StrictMode, Suspense, lazy} from 'react';
import {createRoot} from 'react-dom/client';
import { ErrorBoundary } from './components/ErrorBoundary';
import './index.css';
import { installNativePrint } from './utils/printHtml';

// تطبيق الموبايل: window.print() يشتغل عن طريق شاشة الطباعة بتاعة أندرويد
installNativePrint();

// Safely patch ResizeObserver to prevent infinite loops causing browser freezes and lag on mobile viewports/iframes (especially with Recharts)
if (typeof window !== 'undefined') {
  const originalResizeObserver = window.ResizeObserver;
  if (originalResizeObserver) {
    class SafeResizeObserver extends originalResizeObserver {
      constructor(callback: ResizeObserverCallback) {
        let activeFrame: number | null = null;
        const throttledCallback: ResizeObserverCallback = (entries, observer) => {
          if (activeFrame !== null) {
            cancelAnimationFrame(activeFrame);
          }
          activeFrame = requestAnimationFrame(() => {
            activeFrame = null;
            try {
              callback(entries, observer);
            } catch (err) {
              console.warn('ResizeObserver callback warning suppressed:', err);
            }
          });
        };
        super(throttledCallback);
      }
    }
    window.ResizeObserver = SafeResizeObserver;
  }
}

// اختيار التطبيق: السائق (VITE_APP_MODE=driver أو المسار /driver أو ?app=driver) / تطبيق الطلبات (requests) / تطبيق التراخيص (licenses) / المكتب.
// كل تطبيق بيتحمّل لوحده (code-splitting) فموبايل السائق مابينزّلش كود المكتب.
const appMode = (import.meta as any).env?.VITE_APP_MODE;
const isDriverApp = appMode === 'driver'
  || (typeof window !== 'undefined' && (window.location.pathname.startsWith('/driver') || new URLSearchParams(window.location.search).get('app') === 'driver'));
const Root = isDriverApp
  ? lazy(() => import('./driver/DriverApp'))
  : appMode === 'licenses'
    ? lazy(() => import('./licenses/LicensesApp'))
    : appMode === 'requests'
      ? lazy(() => import('./MobileApp.tsx'))
      : lazy(() => import('./App.tsx'));

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary fullScreen>
      <Suspense fallback={<div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontWeight: 700 }}>جاري التحميل...</div>}>
        <Root />
      </Suspense>
    </ErrorBoundary>
  </StrictMode>,
);

