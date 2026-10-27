/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { DbProvider, useDb } from './db/store';
import { DashboardAnalytics } from './components/DashboardAnalytics';
import { CarsDriversTab } from './components/CarsDriversTab';
import { ViolationsTab } from './components/ViolationsTab';
import { DeductionsTab } from './components/DeductionsTab';
import { InvoicesTab } from './components/InvoicesTab';
import { AccountsTab } from './components/AccountsTab';
import { LicenseDashboardTab } from './components/LicenseDashboardTab';
import { ReportsTab } from './components/ReportsTab';
import { UsersSettingsTab } from './components/UsersSettingsTab';
import { SupabaseConsole } from './components/SupabaseConsole';
import { LoginScreen } from './components/LoginScreen';
import { TransportRequestsTab } from './components/TransportRequestsTab';
import { RequestsTrackingTab } from './components/RequestsTrackingTab';
import { TransportCostSettingsTab } from './components/TransportCostSettingsTab';
import { RouteAccountingTab } from './components/RouteAccountingTab';
import { CarDailyCostsTab } from './components/CarDailyCostsTab';
import { MaintenanceTab } from './components/MaintenanceTab';
import { NotificationBell } from './components/NotificationBell';
import { DriverTrackingTab } from './components/DriverTrackingTab';
import { VehicleProfitabilityTab } from './components/VehicleProfitabilityTab';
import { LicenseApprovalsTab } from './components/LicenseApprovalsTab';
import { CarMonthlyCostsTab } from './components/CarMonthlyCostsTab';
import { DriverReportsTab } from './components/DriverReportsTab';
import { FuelLogsTab } from './components/FuelLogsTab';
import { ServicePlansTab } from './components/ServicePlansTab';
import { BackupButton } from './components/BackupButton';
import { CommandPalette } from './components/CommandPalette';
import { isPaletteShortcut, isSaveShortcut, triggerSave } from './utils/shortcuts';
import {
  LayoutDashboard,
  Truck,
  AlertTriangle,
  Receipt,
  FileSpreadsheet,
  CalendarCheck,
  Database,
  RefreshCw,
  Clock,
  HelpCircle,
  Menu,
  X,
  CreditCard,
  FileText,
  Users,
  Settings,
  Activity,
  Send,
  ClipboardList,
  Fuel,
  Route,
  Gauge,
  Wrench,
  Package,
  FileCheck,
  Wallet,
  BarChart3,
  ChevronDown,
  TrendingUp,
  MapPin
} from 'lucide-react';

// تطبيق الموبايل (APK) بيحقن window.Capacitor — على الويب مفيش حاجة بالاسم ده
// في التطبيق: مفيش تسجيل خروج تلقائي بسبب الخمول. على الويب: زي ما كان.
const isNativeApp: boolean = (() => {
  try {
    return !!(window as any).Capacitor?.isNativePlatform?.();
  } catch {
    return false;
  }
})();

function DashboardLayout() {
  const db = useDb();

  // Filter tab list based on logged-in user — دلوقتي بيتحسب من خريطة الصلاحيات القابلة للتعديل من
  // شاشة "المستخدمين" — كل مستخدم بشاشاته الخاصة مباشرة، من غير ارتباط بقسم أو رتبة. بنقرا
  // الشاشات حية من جدول systemUsers (مش من الجلسة المخزّنة وقت الدخول) عشان أي تعديل يتفعّل
  // فورًا من غير ما يحتاج المستخدم يعمل تسجيل خروج ودخول.
  const allowedTabs = React.useMemo(() => {
    const user = db.currentUser;
    if (!user) return [];
    const liveUser = db.systemUsers?.find(u => u.id === user.systemUserId);
    if (liveUser) return liveUser.allowed_screens;
    return user.allowedScreens || [];
  }, [db.currentUser, db.systemUsers]);

  const [activeTab, setActiveTab] = useState<'dashboard' | 'transport_requests' | 'fleet' | 'violations' | 'requests_tracking' | 'deductions' | 'custody_licensing' | 'cross_accounts' | 'license_tracking' | 'reports' | 'users_settings' | 'transport_cost_settings' | 'route_accounting' | 'car_daily_costs' | 'maintenance_requests' | 'maintenance_parts' | 'maintenance_review' | 'maintenance_accounting' | 'license_invoice_approvals' | 'car_monthly_costs' | 'driver_reports' | 'fuel_logs' | 'service_plans' | 'vehicle_profitability' | 'driver_tracking'>('dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  // المجموعة المفتوحة حاليًا في القايمة الجانبية (واحدة بس مفتوحة في كل مرة)
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [showConsole, setShowConsole] = useState(false);
  const [showPalette, setShowPalette] = useState(false);
  const [saveHint, setSaveHint] = useState<string | null>(null);

  // تنقّل بين الشاشات من أي شاشة تانية (مثلًا نسخ فاتورة من شاشة الاعتماد بيفتح شاشة عهد الصرف)
  useEffect(() => {
    const onNavigate = (e: Event) => {
      const tab = (e as CustomEvent<{ tab?: string }>).detail?.tab;
      if (tab) {
        setActiveTab(tab as any);
        setIsSidebarOpen(false);
      }
    };
    window.addEventListener('elbanna:navigate', onNavigate);
    return () => window.removeEventListener('elbanna:navigate', onNavigate);
  }, []);

  // القايمة الجانبية على الموبايل = Drawer: Esc يقفلها، والصفحة اللي وراها ماتتحركش وهي مفتوحة
  useEffect(() => {
    if (!isSidebarOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsSidebarOpen(false);
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [isSidebarOpen]);
  const [currentTime, setCurrentTime] = useState(new Date());

  // Enforce redirection to allowed tabs as role switches or updates
  useEffect(() => {
    if (allowedTabs.length > 0 && !allowedTabs.includes(activeTab)) {
      setActiveTab(allowedTabs[0] as any);
    }
  }, [allowedTabs, activeTab]);

  // اختصارات: Ctrl+S = حفظ الشاشة الحالية (بدل نافذة حفظ الصفحة في المتصفح)، Ctrl+K = بحث سريع عن أي شاشة
  useEffect(() => {
    let hintTimer: ReturnType<typeof setTimeout>;
    const onKey = (e: KeyboardEvent) => {
      if (isSaveShortcut(e)) {
        e.preventDefault();
        if (!triggerSave()) {
          setSaveHint('مفيش حاجة تتحفظ في الشاشة دي — الحفظ بـ Ctrl+S شغال في شاشات جداول الإدخال.');
          clearTimeout(hintTimer);
          hintTimer = setTimeout(() => setSaveHint(null), 3500);
        }
      } else if (isPaletteShortcut(e)) {
        e.preventDefault();
        setShowPalette(p => !p);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); clearTimeout(hintTimer); };
  }, []);

  // Real-time Clock loop
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // تسجيل خروج تلقائي بعد 30 ثانية من عدم النشاط (بدون حركة ماوس/لمس/كتابة/سكرول/ضغط)
  useEffect(() => {
    if (isNativeApp) return; // التطبيق: بدون خروج تلقائي
    const IDLE_LIMIT_MS = 30 * 1000;
    let idleTimer: ReturnType<typeof setTimeout>;

    const resetIdleTimer = () => {
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        db.logout();
      }, IDLE_LIMIT_MS);
    };

    const activityEvents: Array<keyof WindowEventMap> = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'wheel', 'click'];
    activityEvents.forEach(evt => window.addEventListener(evt, resetIdleTimer, { passive: true }));
    resetIdleTimer();

    return () => {
      clearTimeout(idleTimer);
      activityEvents.forEach(evt => window.removeEventListener(evt, resetIdleTimer));
    };
  }, [db.currentUser]);

  // هيكل التنقل: شاشتين مستقلتين (الرئيسية والتقارير) + أربع مجموعات رئيسية تحوي باقي الشاشات
  // أعيد تنظيمها على الأقسام الخمسة المعتمدة في مستند المراجعة (الإعدادات / العمليات / المالية /
  // الصيانة / التقارير العامة) — نقل تنظيمي بس، كل الشاشات نفسها زي ما هي من غير حذف أو دمج
  const navStructure = [
    { type: 'standalone' as const, id: 'dashboard' as const, label: 'لوحة التحكم والتحليلات الحية', icon: LayoutDashboard },
    {
      type: 'group' as const, label: 'الإعدادات', icon: Settings,
      items: [
        { id: 'users_settings' as const, label: 'حماية وإعدادات حسابات النظام', icon: Users },
        { id: 'fleet' as const, label: 'إعدادات السيارات والسائقين (Excel)', icon: Truck },
        { id: 'transport_cost_settings' as const, label: 'إعدادات تكلفة خطوط السير', icon: Fuel },
      ]
    },
    {
      type: 'group' as const, label: 'العمليات / حركة الأسطول', icon: Activity,
      items: [
        { id: 'transport_requests' as const, label: 'طلبات النقل', icon: Send },
        { id: 'requests_tracking' as const, label: 'متابعة الطلبات', icon: ClipboardList },
        { id: 'driver_tracking' as const, label: 'متابعة السائقين', icon: MapPin },
        { id: 'license_tracking' as const, label: 'متابعة وتحديث التراخيص المتقدمة', icon: CalendarCheck },
        { id: 'violations' as const, label: 'تسجيل المخالفات وتفادي التكرار', icon: AlertTriangle },
      ]
    },
    {
      type: 'group' as const, label: 'المالية', icon: CreditCard,
      items: [
        { id: 'route_accounting' as const, label: 'حساب خطوط السير', icon: Route },
        { id: 'car_daily_costs' as const, label: 'مصاريف وأرباح السيارات اليومية', icon: Gauge },
        { id: 'car_monthly_costs' as const, label: 'المرتبات والسولار والزيت الشهرية', icon: Wallet },
        { id: 'driver_reports' as const, label: 'تقارير السائقين وتكلفة الكيلو', icon: BarChart3 },
        { id: 'fuel_logs' as const, label: 'سجل التموين', icon: Fuel },
        { id: 'service_plans' as const, label: 'الصيانة الوقائية', icon: ClipboardList },
        { id: 'vehicle_profitability' as const, label: 'ربحية السيارات', icon: TrendingUp },
        { id: 'custody_licensing' as const, label: 'فواتير تراخيص', icon: Receipt },
        { id: 'license_invoice_approvals' as const, label: 'اعتماد فواتير التراخيص', icon: FileCheck },
        { id: 'deductions' as const, label: 'الخصومات الفردية والجماعية', icon: CreditCard },
        { id: 'cross_accounts' as const, label: 'أرشيف وحسابات السائقين (شهرية)', icon: FileSpreadsheet },
      ]
    },
    {
      type: 'group' as const, label: 'الصيانة', icon: Wrench,
      items: [
        { id: 'maintenance_requests' as const, label: 'طلب الصيانة', icon: ClipboardList },
        { id: 'maintenance_parts' as const, label: 'قطع الغيار', icon: Package },
        { id: 'maintenance_review' as const, label: 'مدير الصيانة', icon: CalendarCheck },
        { id: 'maintenance_accounting' as const, label: 'فواتير الصيانة', icon: Receipt },
      ]
    },
    {
      type: 'group' as const, label: 'التقارير العامة', icon: FileText,
      items: [
        { id: 'reports' as const, label: 'شاشة التقارير والمطبوعات الموحدة', icon: FileText },
      ]
    },
  ];

  // قايمة الشاشات المسموحة للمستخدم (للبحث السريع Ctrl+K)
  const paletteItems = navStructure.flatMap(entry =>
    entry.type === 'standalone'
      ? (allowedTabs.includes(entry.id) ? [{ id: entry.id as string, label: entry.label, group: 'الرئيسية' }] : [])
      : entry.items.filter(i => allowedTabs.includes(i.id)).map(i => ({ id: i.id as string, label: i.label, group: entry.label }))
  );

  // تسجيل خروج تلقائي بعد فترة خمول (٣٠ دقيقة) — بيشتغل كمان لو الموبايل كان في الخلفية
  useEffect(() => {
    if (isNativeApp) return; // التطبيق: بدون خروج تلقائي
    const LIMIT_MS = 30 * 60 * 1000;
    const KEY = 'elbanna_last_activity';
    const now = () => Date.now();
    const stored = parseInt(localStorage.getItem(KEY) || '0', 10);
    if (stored && now() - stored > LIMIT_MS) {
      db.logout();
      return;
    }
    let lastWrite = 0;
    const bump = () => {
      const t = now();
      if (t - lastWrite > 10000) {
        lastWrite = t;
        localStorage.setItem(KEY, String(t));
      }
    };
    bump();
    const check = () => {
      const last = parseInt(localStorage.getItem(KEY) || '0', 10);
      if (last && now() - last > LIMIT_MS) db.logout();
    };
    const events = ['pointerdown', 'keydown', 'touchstart', 'scroll'];
    events.forEach(e => window.addEventListener(e, bump, { passive: true }));
    const timer = setInterval(check, 30000);
    const onVisible = () => { if (document.visibilityState === 'visible') check(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      events.forEach(e => window.removeEventListener(e, bump));
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // عدّادات الطلبات المنتظرة على القايمة الجانبية
  const maintCount = (statuses: string[]) => db.maintenanceRequests.filter(r => statuses.includes(r.status)).length;
  const badgeCounts: Record<string, number> = {
    license_invoice_approvals: db.invoices.filter(i => !i.is_deleted && i.approval_status === 'pending').length,
    maintenance_requests: maintCount(['repaired']),
    maintenance_parts: maintCount(['parts_requested']),
    maintenance_review: maintCount(['new', 'parts_purchased', 'invoice_review', 'receipt_rejected']),
    maintenance_accounting: maintCount(['pending_invoice', 'invoice_approved']),
  };

  // لما الشاشة النشطة تتغيّر (مثلًا بعد الدخول أو التحويل التلقائي) نفتح المجموعة اللي تحتها الشاشة دي
  useEffect(() => {
    const owner = navStructure.find(e => e.type === 'group' && e.items.some(i => i.id === activeTab));
    if (owner && owner.type === 'group') setOpenGroup(owner.label);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans relative pb-16">
      
      {/* Corporate Header Ribbon */}
      <header className="bg-slate-900/80 backdrop-blur-sm border-b border-slate-800 sticky top-0 z-40 no-print" id="elbanna_main_header">
        <div className="max-w-7xl mx-auto px-3 md:px-6 min-h-16 py-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <div className="flex items-center gap-3 min-w-0">
            {/* Mobile Sidebar toggle */}
            <button
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              type="button"
              className="lg:hidden p-1.5 hover:bg-slate-800 rounded-lg text-slate-300 transition-colors"
            >
              <Menu className="w-6 h-6" />
            </button>

            {/* Branding Logo */}
            <div className="flex items-center gap-2 min-w-0">
              <span className="w-8 h-8 shrink-0 rounded-xl bg-emerald-500 flex items-center justify-center font-black text-slate-950 text-base shadow">
                بـ
              </span>
              <div className="min-w-0">
                <h1 className="font-extrabold text-slate-100 text-sm md:text-base leading-none">مجموعة البنا جروب</h1>
                <p className="hidden sm:block text-[10px] text-emerald-400 font-semibold mt-0.5">البوابة الرقمية لإدارة الأسطول والعهد المالية</p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2 md:gap-4 min-w-0">
            <NotificationBell onNavigate={(screen) => { setActiveTab(screen as any); setIsSidebarOpen(false); }} />
            {/* مؤشر حالة المزامنة مع السحابة */}
            <div
              className={`flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1.5 rounded-lg border ${db.cloudError ? 'bg-rose-950 text-rose-300 border-rose-500/30' : db.isCloudConnected ? 'bg-emerald-950 text-emerald-300 border-emerald-500/30' : 'bg-slate-950 text-slate-400 border-slate-800'}`}
              title={db.cloudError || ''}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${db.cloudError ? 'bg-rose-400' : db.isCloudConnected ? 'bg-emerald-400' : 'bg-slate-500'}`}></span>
              <span className="hidden sm:inline">{db.cloudError ? 'فشل المزامنة' : db.isCloudConnected ? 'متزامن مع السحابة' : 'غير متصل بالسحابة'}</span>
            </div>

            {/* User status & Logout */}
            <div className="flex items-center gap-2 md:gap-3 bg-slate-950 px-2.5 md:px-3 py-1.5 rounded-lg border border-slate-800 text-xs max-w-full">
              <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse"></span>
              <span className="text-slate-300 font-extrabold whitespace-nowrap truncate max-w-[120px] md:max-w-none">
                {`👤 ${db.currentUser?.name || db.currentUser?.username}`}
              </span>
              <button
                onClick={() => db.logout()}
                type="button"
                className="text-[10px] text-rose-400 hover:text-rose-300 font-black border-r border-slate-800 pr-2 mr-1 transition-all hover:underline"
              >
                تسجيل الخروج
              </button>
            </div>

            {/* Live Clock indicator representing localized time */}
            <div className="hidden md:flex items-center gap-1.5 text-xs text-slate-300 font-medium font-mono bg-slate-950 px-3 py-1.5 rounded-lg border border-slate-800">
              <Clock className="w-3.5 h-3.5 text-slate-500" />
              <span>{currentTime.toLocaleTimeString('ar-EG')}</span>
            </div>

            <button
              onClick={() => setShowPalette(true)}
              type="button"
              className="hidden md:flex items-center gap-1.5 text-[10px] text-slate-400 hover:text-slate-200 bg-slate-950 px-2.5 py-1.5 rounded-lg border border-slate-800"
              title="بحث سريع عن أي شاشة"
            >
              بحث سريع <span className="font-mono text-slate-500">Ctrl+K</span>
            </button>

            <BackupButton />

            {db.currentUser?.role === 'admin' && (<>
            {/* Quick Developer Supabase trigger */}
            <button
              onClick={() => setShowConsole(!showConsole)}
              type="button"
              className={`text-xs font-bold px-3 py-1.5 rounded-lg border transition-all flex items-center gap-1.5 ${showConsole ? 'bg-emerald-500 border-emerald-450 text-slate-950 shadow shadow-emerald-500/20 font-extrabold' : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'}`}
            >
              <Database className="w-4 h-4" />
              <span className="hidden sm:inline">{showConsole ? 'إغلاق الكونسول' : 'محرر ومراقب Supabase'}</span>
            </button>

            {/* Database resetting safety hatch */}
            <button
              onClick={() => {
                if(confirm("هل ترغب بإعادة تعيين قاعدة بيانات شركة البنا جروب للبيانات الأولية من الكراسة وحذف المدخلات التجريبية؟")) {
                  db.resetToInitial();
                  alert("تمت استعادة التهيئة الأولية للجداول بنجاح!");
                  window.location.reload();
                }
              }}
              type="button"
              className="p-1.5 border border-slate-800 text-slate-500 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors"
              title="استعادة الحالة المصنعية"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            </>)}
          </div>
        </div>
      </header>

      {/* Main layout frame */}
      <div className="flex-1 flex max-w-7xl w-full mx-auto px-4 md:px-6 py-6 gap-6 relative">
        
        {/* خلفية معتمة ورا القايمة على الموبايل — الضغط عليها يقفل القايمة */}
        {isSidebarOpen && (
          <div
            className="fixed inset-0 z-[55] bg-black/60 lg:hidden no-print"
            onClick={() => setIsSidebarOpen(false)}
            aria-hidden="true"
            id="elbanna_sidebar_backdrop"
          />
        )}

        {/* Navigation Sidebar: Drawer بيطلع من اليمين على الموبايل، وعمود ثابت على الشاشات الكبيرة */}
        <aside
          className={`no-print bg-slate-900 border-slate-800 shadow-xl p-4 flex flex-col justify-between gap-3 transition-all duration-300 ease-out fixed top-0 bottom-0 right-0 z-[60] w-[85vw] max-w-xs border-l lg:border lg:rounded-2xl lg:sticky lg:top-24 lg:bottom-auto lg:right-auto lg:z-auto lg:w-72 lg:max-w-none lg:h-[80vh] lg:shrink-0 lg:translate-x-0 lg:visible ${isSidebarOpen ? 'translate-x-0 visible' : 'translate-x-full invisible'}`}
          id="elbanna_sidebar"
        >
          <div className="space-y-4 overflow-y-auto min-h-0 flex-1">
            <div className="flex justify-end items-center lg:hidden border-b border-slate-800 pb-2">
              <button onClick={() => setIsSidebarOpen(false)} type="button" className="p-1 hover:bg-slate-800 rounded text-slate-400">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-1.5">
              {navStructure.map((entry) => {
                if (entry.type === 'standalone') {
                  if (!allowedTabs.includes(entry.id)) return null;
                  const Icon = entry.icon;
                  return (
                    <button
                      key={entry.id}
                      onClick={() => {
                        setActiveTab(entry.id);
                        setIsSidebarOpen(false);
                      }}
                      type="button"
                      className={`w-full text-right px-4 py-3 rounded-xl font-bold text-xs md:text-sm transition-all flex items-center gap-3 border ${activeTab === entry.id ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'text-slate-405 hover:bg-slate-800 hover:text-slate-200 border-transparent'}`}
                    >
                      <Icon className={`w-4 h-4 ${activeTab === entry.id ? 'text-emerald-400' : 'text-slate-500'}`} />
                      <span>{entry.label}</span>
                    </button>
                  );
                }

                // الشاشات الفرعية اللي المستخدم معاه صلاحيتها بس — المجموعة الرئيسية بتظهر الأول دايمًا،
                // وتحتها (لما تتفتح) الشاشات الفرعية المسموحة له
                const visibleItems = entry.items.filter(item => allowedTabs.includes(item.id));
                if (visibleItems.length === 0) return null;
                const GroupIcon = entry.icon;
                const isOpen = openGroup === entry.label;
                const hasActiveChild = visibleItems.some(item => item.id === activeTab);
                return (
                  <div key={entry.label}>
                    <button
                      type="button"
                      onClick={() => setOpenGroup(isOpen ? null : entry.label)}
                      aria-expanded={isOpen}
                      className={`w-full text-right px-4 py-3 rounded-xl font-bold text-xs md:text-sm transition-all flex items-center gap-3 border ${hasActiveChild && !isOpen ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : isOpen ? 'bg-slate-800 text-slate-100 border-slate-700' : 'text-slate-405 hover:bg-slate-800 hover:text-slate-200 border-transparent'}`}
                    >
                      <GroupIcon className={`w-4 h-4 ${hasActiveChild ? 'text-emerald-400' : 'text-slate-500'}`} />
                      <span className="flex-1">{entry.label}</span>
                      {visibleItems.reduce((sum, i) => sum + (badgeCounts[i.id] || 0), 0) > 0 && (
                        <span className="bg-rose-500 text-white text-[10px] font-black px-1.5 py-0.5 rounded-full min-w-[1.25rem] text-center">
                          {visibleItems.reduce((sum, i) => sum + (badgeCounts[i.id] || 0), 0)}
                        </span>
                      )}
                      <ChevronDown className={`w-4 h-4 text-slate-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                    </button>
                    {isOpen && (
                      <div className="mt-1.5 mr-4 pr-2 border-r border-slate-700 space-y-1.5">
                        {visibleItems.map(item => {
                          const Icon = item.icon;
                          return (
                            <button
                              key={item.id}
                              onClick={() => {
                                setActiveTab(item.id);
                                setIsSidebarOpen(false);
                              }}
                              type="button"
                              className={`w-full text-right px-3 py-2.5 rounded-xl font-bold text-xs transition-all flex items-center gap-2.5 border ${activeTab === item.id ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'text-slate-405 hover:bg-slate-800 hover:text-slate-200 border-transparent'}`}
                            >
                              <Icon className={`w-4 h-4 ${activeTab === item.id ? 'text-emerald-400' : 'text-slate-500'}`} />
                              <span className="flex-1">{item.label}</span>
                              {(badgeCounts[item.id] || 0) > 0 && (
                                <span className="bg-rose-500 text-white text-[10px] font-black px-1.5 py-0.5 rounded-full min-w-[1.25rem] text-center">{badgeCounts[item.id]}</span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Quick status cards */}
          <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 mt-4 space-y-2 text-xs">
            <div className="flex justify-between font-semibold text-slate-400 text-[10px]">
              <span>معدل الحماية</span>
              <span className="text-emerald-400">100% (RLS Active)</span>
            </div>
            <div className="w-full bg-slate-800 h-1 rounded-full overflow-hidden">
              <div className="bg-emerald-500 h-full w-full"></div>
            </div>
            <p className="text-[10px] text-slate-500 leading-relaxed text-right">
              تم تشفير وحظر البيانات السحابية بموجب بروتوكولات البنا جروب الصارمة.
            </p>
          </div>
        </aside>

        {/* Content Portal */}
        <main className="flex-1 min-w-0" id="main_content_frame">
          <div className="pb-8">
            {db.cloudError && (
              <div className="mb-6 no-print" id="cloud_warning_banner">
                <div className="bg-amber-500/10 border border-amber-500/30 text-amber-300 rounded-2xl p-4 flex flex-col md:flex-row items-center md:items-start justify-between gap-4 shadow-lg shadow-amber-500/5 animate-fade-in">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <h4 className="font-extrabold text-xs md:text-sm text-amber-400">تنبيه الحالة السحابية: جداول قاعدة البيانات غير مهيأة</h4>
                      <p className="text-[11px] md:text-xs text-slate-300 leading-relaxed text-right">
                        {db.cloudError.includes("public.drivers") || db.cloudError.includes("schema cache") ? (
                          <>
                            <span className="font-extrabold text-amber-450">أنت متصل بالاتصال السحابي لـ Supabase بنجاح! </span> 
                            ولكن جداول قاعدة البيانات (مثل جدول السائقين <span className="font-mono text-[10px] bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800">public.drivers</span>) غير مكشوفة أو غير منشأة بمشروعك السحابي بعد.
                            <br className="mb-1" />
                            لهذا السبب تظهر هذه الرسالة ولا تظهر مدخلاتك الحقيقية عند الدخول من جهاز آخر. يرجى الضغط على الزر المقابل باليسار لفتح لوحة التحكم ثم نسخ كود الاستعلام <span className="font-bold text-amber-400">SQL Schema</span> الموحد ولصقه في نافذة <span className="font-bold text-amber-350">SQL Editor</span> في حساب Supabase الخاص بك والضغط على <span className="font-extrabold text-emerald-400">Run</span> لإنشاء كافة جداول النظام وحفظ حركات العمل محاسبيًا ومزامنتها بنجاح عبر الهواتف والكمبيوتر فوريًا!
                          </>
                        ) : db.cloudError}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap md:flex-nowrap gap-2 shrink-0">
                    <button
                      onClick={async () => {
                        const res = await db.downloadCloudDataToLocal(true);
                        alert(res.message);
                      }}
                      type="button"
                      className="bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs px-3.5 py-2.5 rounded-xl transition-all cursor-pointer flex items-center gap-1.5 shadow shadow-emerald-600/20"
                    >
                      <RefreshCw className="w-4 h-4 animate-pulse" />
                      مزامنة السحاب وجلب البيانات السابقة
                    </button>
                    <button
                      onClick={() => setShowConsole(true)}
                      type="button"
                      className="bg-slate-900 hover:bg-slate-850 text-slate-200 border border-slate-800 font-extrabold text-xs px-3.5 py-2.5 rounded-xl transition-all cursor-pointer flex items-center gap-1.5 shadow"
                    >
                      <Database className="w-4 h-4 text-emerald-500" />
                      إعدادات السحاب والـ SQL
                    </button>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'dashboard' && <DashboardAnalytics />}
            {activeTab === 'transport_requests' && <TransportRequestsTab />}
            {activeTab === 'fleet' && <CarsDriversTab />}
            {activeTab === 'violations' && <ViolationsTab />}
            {activeTab === 'requests_tracking' && <RequestsTrackingTab />}
            {activeTab === 'driver_tracking' && <DriverTrackingTab />}
            {activeTab === 'deductions' && <DeductionsTab />}
            {activeTab === 'custody_licensing' && <InvoicesTab />}
            {activeTab === 'cross_accounts' && <AccountsTab />}
            {activeTab === 'license_tracking' && <LicenseDashboardTab />}
            {activeTab === 'reports' && <ReportsTab />}
            {activeTab === 'users_settings' && <UsersSettingsTab />}
            {activeTab === 'transport_cost_settings' && <TransportCostSettingsTab />}
            {activeTab === 'route_accounting' && <RouteAccountingTab />}
            {activeTab === 'car_daily_costs' && <CarDailyCostsTab />}
            {activeTab === 'license_invoice_approvals' && <LicenseApprovalsTab />}
            {activeTab === 'car_monthly_costs' && <CarMonthlyCostsTab />}
            {activeTab === 'driver_reports' && <DriverReportsTab />}
            {activeTab === 'fuel_logs' && <FuelLogsTab />}
            {activeTab === 'service_plans' && <ServicePlansTab />}
            {activeTab === 'maintenance_requests' && <MaintenanceTab mode="requests" />}
            {activeTab === 'maintenance_parts' && <MaintenanceTab mode="parts" />}
            {activeTab === 'maintenance_review' && <MaintenanceTab mode="manager" />}
            {activeTab === 'maintenance_accounting' && <MaintenanceTab mode="accounting" />}
            {activeTab === 'vehicle_profitability' && <VehicleProfitabilityTab />}
          </div>
        </main>

      </div>

      <CommandPalette
        items={paletteItems}
        open={showPalette}
        onClose={() => setShowPalette(false)}
        onSelect={(id) => { setActiveTab(id as any); setIsSidebarOpen(false); }}
      />
      {saveHint && (
        <div className="fixed bottom-14 left-1/2 -translate-x-1/2 z-[90] bg-slate-800 border border-slate-600 text-slate-200 text-xs font-bold px-4 py-2.5 rounded-xl shadow-xl no-print">{saveHint}</div>
      )}

      {/* FOOTER BAR */}
      <footer className="fixed bottom-0 left-0 right-0 h-10 border-t border-slate-800 bg-slate-900 no-print flex items-center justify-between px-6 z-40 text-[10px] text-slate-500 select-none">
        <span>© 2026 مجموعة البنا جروب للتشييد واللوجستيك. جميع الحقوق محفوظة.</span>
        <span className="flex items-center gap-1.5 font-mono text-[9px] text-emerald-650 font-bold">
          <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-ping"></span>
          PostgreSQL السحابي متصل ومؤمن
        </span>
      </footer>

      {/* Toggleable Supabase Developer Console panel */}
      {db.currentUser?.role === 'admin' && showConsole && (
        <div className="fixed bottom-10 left-0 right-0 z-50 p-4 bg-slate-950 border-t border-slate-800 shadow-2xl max-h-[50vh] overflow-y-auto no-print">
          <div className="max-w-7xl mx-auto">
            <div className="flex justify-between items-center mb-2 pb-2 border-b border-slate-800 text-xs">
              <span className="text-slate-400 font-bold flex items-center gap-1.5">
                <Database className="w-4 h-4 text-emerald-400" />
                محرر قواعد البيانات واستعلامات SQL التجريبي لشركة البنا جروب
              </span>
              <button
                onClick={() => setShowConsole(false)}
                type="button"
                className="text-slate-400 hover:text-white font-bold"
              >
                إغلاق [X]
              </button>
            </div>
            <SupabaseConsole />
          </div>
        </div>
      )}

    </div>
  );
}

function AppContent() {
  const db = useDb();
  if (!db.currentUser) {
    return <LoginScreen />;
  }
  return <DashboardLayout />;
}

export default function App() {
  return (
    <DbProvider>
      <AppContent />
    </DbProvider>
  );
}
