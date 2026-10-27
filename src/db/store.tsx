/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { 
  Driver, 
  Official, 
  Car, 
  Violation, 
  Invoice, 
  InvoiceItem, 
  InvoiceAuditLog, 
  DriverAccountMovement, 
  CustodyAccount, 
  CustodyMovement,
  User,
  TransportRequest,
  AppNotification,
  CostItemType,
  RoutePriceEntry,
  TransportRequestCost,
  CarDailyCost,
  CarMonthlyCost,
  FuelLog,
  ServicePlan,
  SystemUser,
  MaintenanceRequest,
  MaintenancePartItem,
  MaintenanceInvoice,
  MaintenanceInvoiceItem
} from '../types';
import { getSupabaseClient } from './supabaseClient';
import { usernameToEmail } from './authEmail';
import { callAdminUsers } from './adminApi';
import {
  INITIAL_OFFICIALS,
  INITIAL_DRIVERS,
  INITIAL_CARS,
  INITIAL_VIOLATIONS,
  INITIAL_INVOICES,
  INITIAL_INVOICE_ITEMS,
  INITIAL_AUDIT_LOGS,
  INITIAL_ACCOUNT_MOVEMENTS
} from './mockData';

import { normalizeDateToYmd } from './dates';
import { generateId } from './ids';
import { maintenanceCostForCarDay } from './logic/maintenanceCost';
import { normalizeMaintenanceRequest } from './logic/maintenanceFlow';
import {
  NotificationDraft, maintenanceNotification, transportNotification, notificationUserKey, isVisibleTo, resolveTargetScreen, isUnread,
  normalizeNotification, mergeNotifications, pruneNotifications, notificationsToUpload,
} from './logic/notifications';
import { normalizeTransportRequest, startTripPatch, advanceTrip, closeTripByOfficePatch, TripAction, TripPayload } from './logic/tripFlow';
import { loadSavedArray, loadSavedObject, cleanupMockData } from './storage';
import type { DbContextType } from './storeTypes';
import { DEFAULT_ROLE_PERMISSIONS, mergeNewDefaultScreens } from './permissions';
import {
  isInvoiceApproved as isInvoiceApprovedPure, licenseCostForCarDay, planInvoiceApproval, planInvoiceRefund,
  validateCustodyTransfer, applyTransferToOfficial, isMonthLockedIn, canEditMonthFor,
} from './logic/invoicePlans';

// إعادة تصدير عشان باقي الملفات (CarsDriversTab...) تفضل تستورد من store زي ما هي
export { normalizeDateToYmd };

const DbContext = createContext<DbContextType | undefined>(undefined);

// صف جدول profiles ← شكل SystemUser اللي التطبيق شغّال بيه (من غير أي كلمة سر)
const profileToSystemUser = (p: any): SystemUser => ({
  id: p.id,
  username: p.username,
  display_name: p.display_name,
  role_tag: p.role_tag,
  allowed_screens: Array.isArray(p.allowed_screens) ? p.allowed_screens : [],
  linked_official_id: p.linked_official_id || undefined,
  active: p.active !== false,
  has_login: !!p.auth_user_id,
});

export const DbProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [drivers, setDrivers] = useState<Driver[]>(() => 
    loadSavedArray('elbanna_drivers', INITIAL_DRIVERS)
  );

  const [officials, setOfficials] = useState<Official[]>(() => 
    loadSavedArray('elbanna_officials', INITIAL_OFFICIALS)
  );

  const [cars, setCars] = useState<Car[]>(() => loadSavedArray('elbanna_cars', []));

  const [violations, setViolations] = useState<Violation[]>(() => {
    const raw = loadSavedArray('elbanna_violations', INITIAL_VIOLATIONS);
    return raw.map(v => ({ ...v, violation_date: normalizeDateToYmd(v.violation_date) }));
  });

  const [invoices, setInvoices] = useState<Invoice[]>(() => loadSavedArray('elbanna_invoices', []));

  const [invoiceItems, setInvoiceItems] = useState<InvoiceItem[]>(() => loadSavedArray('elbanna_invoice_items', []));

  const [auditLogs, setAuditLogs] = useState<InvoiceAuditLog[]>(() => 
    loadSavedArray('elbanna_audit_logs', INITIAL_AUDIT_LOGS)
  );

  const [movements, setMovements] = useState<DriverAccountMovement[]>(() => {
    const raw = loadSavedArray('elbanna_movements', INITIAL_ACCOUNT_MOVEMENTS);
    return raw.map(m => ({ ...m, date: normalizeDateToYmd(m.date) }));
  });

  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    try {
      const saved = localStorage.getItem('elbanna_current_user');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  // تسجيل دخول موحّد بدون اختيار قسم/رتبة مقدمًا — يكتب المستخدم اسمه وكلمة المرور بس،
  // والنظام بيجرب يتعرف على نوع الحساب تلقائيًا (مشرف صرف بالاسم، أو أدمن/مدير/مشرف حركة/طلبات نقل باليوزرنيم)
  // تحقق حي من صلاحية "شاشة" معينة للمستخدم الحالي — بنفس منطق allowedTabs في App.tsx تمامًا،
  // لكن قابل لإعادة الاستخدام داخل أي شاشة محتاجة تتحقق من صلاحية فرعية (زي اعتماد خصم الصيانة)
  // من غير ما تضطر تكرر نفس منطق البحث عن systemUser الحي في كل مكان
  const hasScreenPermission = (screenId: string): boolean => {
    const user = currentUser;
    if (!user) return false;
    const liveUser = systemUsers.find(u => u.id === user.systemUserId);
    const screens = liveUser ? liveUser.allowed_screens : (user.allowedScreens || []);
    return screens.includes(screenId);
  };

  const currentUserRef = useRef(currentUser);
  currentUserRef.current = currentUser;

  // ===== الدخول عبر Supabase Auth =====
  // اسم المستخدم ← بريد داخلي ثابت (usernameToEmail) ← signInWithPassword. كلمة السر عمرها ما بتتخزن في
  // جدول ولا في الجهاز؛ الجلسة (JWT) هي اللي بتفتح الجداول عبر سياسات RLS، وتجديدها تلقائي.
  const refreshSystemUsers = async (): Promise<SystemUser[] | null> => {
    const client = getSupabaseClient();
    if (!client) return null;
    const { data, error } = await client.from('profiles').select('*').order('created_at', { ascending: true });
    if (error || !data) return null;
    const list = data.map(profileToSystemUser);
    systemUsersRef.current = list;
    setSystemUsers(list);
    return list;
  };

  const loginAuto = async (identifier: string, password: string): Promise<{ success: boolean; error?: string }> => {
    const trimmed = identifier.trim();
    if (!trimmed) return { success: false, error: 'يرجى إدخال اسم المستخدم' };
    if (!password) return { success: false, error: 'يرجى إدخال كلمة المرور' };
    const client = getSupabaseClient();
    if (!client) return { success: false, error: 'إعدادات الاتصال بقاعدة البيانات غير متوفرة.' };

    const { data, error } = await client.auth.signInWithPassword({ email: usernameToEmail(trimmed), password });
    if (error || !data?.session || !data.user) {
      const m = String(error?.message || '');
      if (/fetch|network/i.test(m)) return { success: false, error: 'مفيش اتصال بالإنترنت. جرّب تاني.' };
      if ((error as any)?.status === 429 || /rate|too many/i.test(m)) return { success: false, error: 'محاولات كتير — استنى شوية وجرّب تاني.' };
      return { success: false, error: 'اسم المستخدم أو كلمة المرور غير صحيحة' };
    }

    const { data: prof, error: profErr } = await client.from('profiles').select('*').eq('auth_user_id', data.user.id).maybeSingle();
    if (profErr || !prof || !prof.active) {
      await client.auth.signOut({ scope: 'local' });
      return { success: false, error: prof && !prof.active ? 'الحساب ده موقوف — كلّم الأدمن.' : 'الحساب مش مفعّل في النظام — كلّم الأدمن.' };
    }
    const matched = profileToSystemUser(prof);
    // بداية نشاط جديد (لتسجيل الخروج التلقائي بعد الخمول)
    localStorage.setItem('elbanna_last_activity', String(Date.now()));
    const uObj: User = {
      username: matched.username,
      role: matched.linked_official_id ? 'supervisor' : (matched.role_tag === 'custom' ? 'custom' : matched.role_tag),
      officialId: matched.linked_official_id,
      systemUserId: matched.id,
      name: matched.display_name,
      allowedScreens: matched.allowed_screens,
    };
    setCurrentUser(uObj);
    localStorage.setItem('elbanna_current_user', JSON.stringify(uObj));
    refreshSystemUsers();
    return { success: true };
  };

  const logout = () => {
    setCurrentUser(null);
    localStorage.removeItem('elbanna_current_user');
    // scope محلي: يسجّل خروج الجهاز ده بس (مش كل أجهزة المستخدم)
    try { getSupabaseClient()?.auth.signOut({ scope: 'local' }); } catch { /* تجاهل */ }
  };

  // لو الجلسة الفعلية انتهت أو اتلغت (توكن منتهي، حساب اتوقف…) نسجّل خروج المستخدم فورًا بدل ما يفضل شايف شاشات فاضية
  useEffect(() => {
    const client = getSupabaseClient();
    if (!client) return;
    let cancelled = false;
    if (currentUser) {
      client.auth.getSession().then(({ data }) => { if (!cancelled && !data.session) logout(); });
    }
    const { data: sub } = client.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') { setCurrentUser(null); localStorage.removeItem('elbanna_current_user'); }
    });
    return () => { cancelled = true; sub.subscription.unsubscribe(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // تنضيف أي أسرار قديمة كانت متخزنة على الجهاز من النظام القديم (كلمات سر + قايمة المستخدمين)
  useEffect(() => {
    ['elbanna_system_users', 'elbanna_admin_password', 'elbanna_manager_password', 'elbanna_movement_supervisor_password', 'elbanna_requests_agent_password']
      .forEach(k => { try { localStorage.removeItem(k); } catch { /* تجاهل */ } });
  }, []);

  const [custodyAccounts, setCustodyAccounts] = useState<CustodyAccount[]>(() => {
    try {
      const saved = localStorage.getItem('elbanna_custody_accounts');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) {
      console.warn('Error parsing custody accounts:', e);
    }
    return [];
  });

  const [custodyMovements, setCustodyMovements] = useState<CustodyMovement[]>(() => 
    loadSavedArray('elbanna_custody_movements', [])
  );

  const [companies, setCompanies] = useState<string[]>(() => 
    loadSavedArray('elbanna_companies', [])
  );
  // شركات محذوفة عمداً بواسطة المستخدم — بنستبعدها من قائمة المقترحات حتى لو لسه
  // موجودة كـ owner_company بسيارات قديمة، عشان "الحذف" يبقى فعلي وميرجعش تاني
  const [hiddenCompanies, setHiddenCompanies] = useState<string[]>(() =>
    loadSavedArray('elbanna_hidden_companies', [])
  );

  const addCompany = (companyName: string) => {
    const trimmed = companyName.trim();
    if (!trimmed) return;
    // لو المستخدم بيضيف شركة كانت متعمولها حذف قبل كده، معنى ده إنه قرر يرجّعها فعلياً
    if (hiddenCompanies.includes(trimmed)) {
      const nextHidden = hiddenCompanies.filter(c => c !== trimmed);
      setHiddenCompanies(nextHidden);
      localStorage.setItem('elbanna_hidden_companies', JSON.stringify(nextHidden));
      const supabase = getSupabaseClient();
      if (supabase && isCloudConnected) {
        supabase.from('system_settings').upsert({ key: 'hidden_companies', value: JSON.stringify(nextHidden) })
          .then(({ error }) => { if (error) console.warn("Supabase save hidden_companies error:", error); });
      }
    }
    if (companies.includes(trimmed)) return;
    const next = [...companies, trimmed];
    setCompanies(next);
    localStorage.setItem('elbanna_companies', JSON.stringify(next));
    const supabase = getSupabaseClient();
    if (supabase && isCloudConnected) {
      supabase.from('system_settings').upsert({ key: 'companies', value: JSON.stringify(next) })
        .then(({ error }) => {
          if (error) console.warn("Supabase save companies error:", error);
        });
    }
  };

  const deleteCompany = (companyName: string) => {
    const next = companies.filter(c => c !== companyName);
    setCompanies(next);
    localStorage.setItem('elbanna_companies', JSON.stringify(next));

    // نسجلها كمخفية عشان مانستنتجهاش تاني من بيانات owner_company بالسيارات القديمة
    const nextHidden = hiddenCompanies.includes(companyName) ? hiddenCompanies : [...hiddenCompanies, companyName];
    setHiddenCompanies(nextHidden);
    localStorage.setItem('elbanna_hidden_companies', JSON.stringify(nextHidden));

    const supabase = getSupabaseClient();
    if (supabase && isCloudConnected) {
      supabase.from('system_settings').upsert({ key: 'companies', value: JSON.stringify(next) })
        .then(({ error }) => {
          if (error) console.warn("Supabase save companies error:", error);
        });
      supabase.from('system_settings').upsert({ key: 'hidden_companies', value: JSON.stringify(nextHidden) })
        .then(({ error }) => {
          if (error) console.warn("Supabase save hidden_companies error:", error);
        });
    }
  };

  const [transportRequests, setTransportRequests] = useState<TransportRequest[]>(() =>
    loadSavedArray<TransportRequest>('elbanna_transport_requests', []).map(r => normalizeTransportRequest(r))
  );

  // ====== الإشعارات ======
  // كل حدث على طلب نقل/صيانة بيعمل إشعار، بيظهر لكل مستخدم عنده صلاحية على الشاشة المعنية، وبالضغط عليه
  // بيفتح تفاصيل الطلب في الشاشة دي (pendingNav). حالة القراءة لكل مستخدم لوحده (read_by).
  const [notifications, setNotifications] = useState<AppNotification[]>(() =>
    pruneNotifications(loadSavedArray<any>('elbanna_notifications', []).map(normalizeNotification), Date.now())
  );
  const [pendingNav, setPendingNav] = useState<{ screen: string; entityType: 'transport' | 'maintenance'; entityId: string; nonce: number } | null>(null);
  useEffect(() => {
    try { localStorage.setItem('elbanna_notifications', JSON.stringify(notifications)); } catch { /* التخزين ممتلئ — مش مشكلة */ }
  }, [notifications]);

  const notificationScreens = (): string[] => {
    const user = currentUser;
    if (!user) return [];
    const live = systemUsers.find(u => u.id === user.systemUserId);
    return live ? live.allowed_screens : (user.allowedScreens || []);
  };
  // ملحوظة: notificationKey / myNotifications / unreadNotificationCount بيتحسبوا تحت، بعد تعريف
  // systemUsers — لأن notificationScreens() بتقرا systemUsers وبتتنفّذ وقت الرسم، ولو اتنفّذت قبل
  // تعريفه بيحصل "Cannot access before initialization" بعد تسجيل الدخول مباشرة.

  const notifyEvent = (draft: NotificationDraft | null) => {
    if (!draft) return;
    const n: AppNotification = {
      ...draft,
      id: generateId('nt'),
      created_at: new Date().toISOString(),
      created_by: currentUser?.name || currentUser?.username,
      // اللي عمل الحدث نفسه مايتحسبش عنده غير مقروء
      read_by: notificationKey ? [notificationKey] : [],
    };
    setNotifications(prev => pruneNotifications([n, ...prev], Date.now()));
    const supabase = getSupabaseClient();
    if (supabase) {
      supabase.from('notifications').upsert([n]).then(({ error }: any) => {
        if (error) console.warn('Supabase notification upsert error:', error.message);
      });
    }
  };

  const markNotificationsRead = (ids: string[]) => {
    const key = notificationKey;
    if (!key || ids.length === 0) return;
    const changed = notifications
      .filter(n => ids.includes(n.id) && !n.read_by.includes(key))
      .map(n => ({ ...n, read_by: [...n.read_by, key] }));
    if (changed.length === 0) return;
    const byId = new Map(changed.map(n => [n.id, n]));
    setNotifications(prev => prev.map(n => {
      const c = byId.get(n.id);
      return c ? { ...n, read_by: Array.from(new Set([...n.read_by, key])) } : n;
    }));
    const supabase = getSupabaseClient();
    if (supabase) {
      supabase.from('notifications').upsert(changed).then(({ error }: any) => {
        if (error) console.warn('Supabase notification read upsert error:', error.message);
      });
    }
  };
  const markAllNotificationsRead = () => markNotificationsRead(myNotifications.filter(n => isUnread(n, notificationKey)).map(n => n.id));

  // فتح إشعار: تعليمه كمقروء وتحديد الشاشة اللي هتتفتح (أول شاشة معنية متاحة للمستخدم)
  const openNotification = (n: AppNotification): string | null => {
    const screen = resolveTargetScreen(n, notificationScreens());
    markNotificationsRead([n.id]);
    if (!screen) return null;
    setPendingNav({ screen, entityType: n.entity_type, entityId: n.entity_id, nonce: Date.now() });
    return screen;
  };
  const consumeNav = (nonce: number) => setPendingNav(prev => (prev && prev.nonce === nonce ? null : prev));

  // مزامنة الإشعارات مع السحابة كل 15 ثانية وعند رجوع الشاشة للواجهة (لو الجدول لسه ماتنشأش بيفضل محلي بس)
  const notificationsRef = useRef(notifications);
  notificationsRef.current = notifications;
  useEffect(() => {
    const client = getSupabaseClient();
    if (!client) return;
    let busy = false;
    const sync = async () => {
      if (busy || !currentUserRef.current || isDownloadingRef.current || document.visibilityState === 'hidden') return;
      busy = true;
      try {
        const since = new Date(Date.now() - 30 * 86400000).toISOString();
        const { data, error } = await client.from('notifications').select('*').gte('created_at', since).order('created_at', { ascending: false }).limit(300);
        if (error || !data) return;
        const cloud = (data as any[]).map(normalizeNotification);
        const local = notificationsRef.current;
        const merged = pruneNotifications(mergeNotifications(local, cloud), Date.now());
        const up = notificationsToUpload(merged, cloud);
        if (up.length > 0) {
          const { error: upErr } = await client.from('notifications').upsert(up);
          if (upErr) console.warn('Supabase notifications upload error:', upErr.message);
        }
        if (JSON.stringify(merged) !== JSON.stringify(local)) setNotifications(merged);
      } catch (e) {
        console.warn('notifications sync failed', e);
      } finally {
        busy = false;
      }
    };
    const timer = setInterval(sync, 15000);
    const onVisible = () => { if (document.visibilityState === 'visible') sync(); };
    document.addEventListener('visibilitychange', onVisible);
    sync();
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); };
  }, []);

  // ====== قسم الصيانة — مبني فوق قاعدة بيانات السيارات الحالية (car_id = Car.id)، بدون أي تكرار لبياناتها ======
  const [maintenanceRequests, setMaintenanceRequests] = useState<MaintenanceRequest[]>(() => {
    // الطلبات المحفوظة بالحالات القديمة بتتحوّل لأقرب مرحلة في سير العمل الجديد
    const invs = loadSavedArray<MaintenanceInvoice>('elbanna_maintenance_invoices', []);
    return loadSavedArray<MaintenanceRequest>('elbanna_maintenance_requests', []).map(r => normalizeMaintenanceRequest(r as any, invs) as MaintenanceRequest);
  });
  const [maintenanceInvoices, setMaintenanceInvoices] = useState<MaintenanceInvoice[]>(() =>
    loadSavedArray('elbanna_maintenance_invoices', [])
  );

  const [farms, setFarms] = useState<string[]>(() =>
    loadSavedArray('elbanna_farms', [])
  );

  // خريطة صلاحيات الشاشات القابلة للتعديل لكل رتبة (بدل الثابت المُقفل قديمًا في App.tsx)
  const [rolePermissions, setRolePermissions] = useState<Record<string, string[]>>(() =>
    mergeNewDefaultScreens(loadSavedObject('elbanna_role_permissions', DEFAULT_ROLE_PERMISSIONS))
  );

  const updateRolePermissions = (role: string, screenIds: string[]) => {
    setRolePermissions(prev => {
      const next = { ...prev, [role]: screenIds };
      localStorage.setItem('elbanna_role_permissions', JSON.stringify(next));
      const supabase = getSupabaseClient();
      if (supabase && isCloudConnected) {
        supabase.from('system_settings').upsert({ key: 'role_permissions', value: JSON.stringify(next) })
          .then(({ error }) => { if (error) console.warn("Supabase save role_permissions error:", error); });
      }
      return next;
    });
  };

  // شاشات مخصصة لكل مستخدم (مشرف صرف) بعينه — مستقلة تمامًا عن رتبته المشتركة، عشان تقدر
  // تضيف أي مستخدم جديد وتحدد له شاشاته الخاصة بدل ما يكون مربوط بصلاحيات قسم/رتبة ثابتة.
  // المفتاح هو official.id، والقيمة هي قائمة معرفات الشاشات؛ غياب المفتاح = استخدام صلاحيات
  // رتبة "مشرف صرف" المشتركة بشكل افتراضي.
  const [officialCustomScreens, setOfficialCustomScreens] = useState<Record<string, string[]>>(() =>
    loadSavedObject('elbanna_official_custom_screens', {})
  );

  const updateOfficialScreens = (officialId: string, screenIds: string[] | null) => {
    setOfficialCustomScreens(prev => {
      const next = { ...prev };
      if (screenIds === null) {
        delete next[officialId];
      } else {
        next[officialId] = screenIds;
      }
      localStorage.setItem('elbanna_official_custom_screens', JSON.stringify(next));
      const supabase = getSupabaseClient();
      if (supabase && isCloudConnected) {
        supabase.from('system_settings').upsert({ key: 'official_custom_screens', value: JSON.stringify(next) })
          .then(({ error }) => { if (error) console.warn("Supabase save official_custom_screens error:", error); });
      }
      return next;
    });
  };

  // ====== نظام المستخدمين الموحّد (Supabase Auth + جدول profiles) ======
  // الاسم/الشاشات/الربط بالعهدة في جدول profiles (القراءة بس من التطبيق، RLS)، وكلمات السر عند Supabase Auth.
  // أي إضافة/تعديل/حذف بتعدّي على Edge Function (admin-users) اللي بتتحقق إن المنفّذ أدمن أو صاحب شاشة المستخدمين.
  // الأدمن بيشوف كل المستخدمين؛ غيره بيشوف نفسه بس (سياسة RLS).
  const [systemUsers, setSystemUsers] = useState<SystemUser[]>([]);
  const systemUsersRef = useRef<SystemUser[]>(systemUsers);
  systemUsersRef.current = systemUsers;
  const [systemUsersSyncError, setSystemUsersSyncError] = useState<string | null>(null);

  // مشتقّات الإشعارات — لازم تيجي بعد تعريف systemUsers (شوف الملحوظة فوق عند notificationScreens)
  const notificationKey = notificationUserKey(currentUser);
  const myNotifications = notifications.filter(n => isVisibleTo(n, notificationScreens()));
  const unreadNotificationCount = myNotifications.filter(n => isUnread(n, notificationKey)).length;

  const addSystemUser = async (username: string, password: string, displayName: string, allowedScreens: string[]) => {
    const trimmedUser = username.trim();
    if (!trimmedUser || !password) return { success: false, error: 'يرجى إدخال اسم مستخدم وكلمة مرور', cloudSaved: false };
    // ملاحظة: إنشاء المستخدم لا ينشئ حساب عهدة تلقائيًا — العهدة بتتنشأ يدويًا من
    // شاشة "🔐 إدارة كلمات مرور مسؤولي الصرف" (زر "إنشاء عهدة") بواسطة الأدمن.
    const res = await callAdminUsers({ action: 'create', username: trimmedUser, password, display_name: displayName.trim() || trimmedUser, allowed_screens: allowedScreens });
    if (!res.ok) return { success: false, error: res.error, cloudSaved: false };
    await refreshSystemUsers();
    return { success: true, user: res.user ? profileToSystemUser(res.user) : undefined, cloudSaved: true };
  };

  // تحديث بيانات مستخدم (اسم/يوزر/باسورد/شاشات) — من غير أي إنشاء تلقائي لحساب عهدة
  const updateSystemUser = async (id: string, updates: { username?: string; password?: string; display_name?: string; official_name?: string; allowed_screens?: string[]; active?: boolean }) => {
    const body: Record<string, unknown> = { action: 'update', id };
    if (updates.username !== undefined && updates.username.trim()) body.username = updates.username.trim();
    if (updates.password) body.password = updates.password;
    if (updates.display_name !== undefined && updates.display_name.trim()) body.display_name = updates.display_name.trim();
    if (updates.allowed_screens) body.allowed_screens = updates.allowed_screens;
    if (typeof updates.active === 'boolean') body.active = updates.active;
    const res = await callAdminUsers(body);
    if (!res.ok || !res.user) return { success: false, error: res.error, cloudSaved: false };
    const updatedUser = profileToSystemUser(res.user);
    await refreshSystemUsers();

    // اسم مسؤول التراخيص (حساب العهدة) مستقل عن الاسم الظاهر واسم المستخدم.
    if (updatedUser.linked_official_id && updates.official_name && updates.official_name.trim()) {
      updateOfficialName(updatedUser.linked_official_id, updates.official_name.trim());
    }

    // لو المستخدم ده هو نفسه الداخل دلوقتي، نحدّث جلسته النشطة فورًا من غير ما يحتاج يعمل تسجيل خروج
    if (currentUser?.systemUserId === id) {
      const updatedSession = { ...currentUser, name: updatedUser.display_name, username: updatedUser.username, allowedScreens: updatedUser.allowed_screens, officialId: updatedUser.linked_official_id };
      setCurrentUser(updatedSession);
      localStorage.setItem('elbanna_current_user', JSON.stringify(updatedSession));
    }
    return { success: true, cloudSaved: true };
  };

  // حذف مستخدم (حساب الدخول + صف profiles) — حساب العهدة المالية المربوط (لو موجود) بيفضل زي ما هو
  // ومايتمسحش تلقائي، حفاظًا على البيانات المالية؛ يتحذف بشكل منفصل ومقصود لو لزم الأمر
  const deleteSystemUser = async (id: string) => {
    const res = await callAdminUsers({ action: 'delete', id });
    if (res.ok) await refreshSystemUsers();
    return { success: res.ok, error: res.error, cloudSaved: res.ok };
  };

  // تفعيل دخول كل المستخدمين المنقولين من النظام القديم (أدمن بس): بيرجّع كلمة سر مؤقتة لكل واحد مرة واحدة
  const provisionSystemUsers = async () => {
    const res = await callAdminUsers<Array<{ id: string; username: string; display_name: string; password?: string; error?: string }>>({ action: 'provision' });
    if (res.ok) await refreshSystemUsers();
    return { success: res.ok, error: res.error, results: res.data || [] };
  };

  // تغيير كلمة سر المستخدم الحالي بنفسه: بنتأكد من الحالية الأول (إعادة دخول) وبعدين Auth بيغيّرها
  const changeOwnPassword = async (currentPassword: string, newPassword: string): Promise<{ success: boolean; error?: string }> => {
    const client = getSupabaseClient();
    if (!client || !currentUser) return { success: false, error: 'لازم تكون مسجّل دخول.' };
    if (newPassword.length < 8) return { success: false, error: 'كلمة المرور لازم تكون 8 حروف على الأقل.' };
    const { error: reErr } = await client.auth.signInWithPassword({ email: usernameToEmail(currentUser.username), password: currentPassword });
    if (reErr) return { success: false, error: 'كلمة المرور الحالية غير صحيحة.' };
    const { error } = await client.auth.updateUser({ password: newPassword });
    return error ? { success: false, error: error.message } : { success: true };
  };

  // إنشاء حساب عهدة (مشرف صرف) يدويًا لمستخدم موجود — بيتم من شاشة إدارة مسؤولي الصرف، مش تلقائي
  const createOfficialForUser = async (userId: string, initial?: { cash_custody?: number; visa_custody?: number }) => {
    const user = systemUsersRef.current.find(u => u.id === userId);
    if (!user) return { success: false, error: 'المستخدم غير موجود', cloudSaved: false };
    if (user.linked_official_id && officials.some(o => o.id === user.linked_official_id)) {
      return { success: false, error: 'المستخدم ده عنده حساب عهدة بالفعل', cloudSaved: false };
    }
    const official = addOfficial({
      name: user.display_name,
      cash_custody: initial?.cash_custody || 0,
      visa_custody: initial?.visa_custody || 0,
    });
    const res = await callAdminUsers({ action: 'update', id: userId, linked_official_id: official.id });
    if (res.ok) await refreshSystemUsers();
    if (res.ok && currentUser?.systemUserId === userId) {
      const updatedSession = { ...currentUser, officialId: official.id };
      setCurrentUser(updatedSession);
      localStorage.setItem('elbanna_current_user', JSON.stringify(updatedSession));
    }
    return { success: res.ok, error: res.error, official, cloudSaved: res.ok };
  };

  const addFarmIfNew = (farmName: string) => {
    const trimmed = farmName.trim();
    if (!trimmed) return;
    setFarms(prev => {
      if (prev.includes(trimmed)) return prev;
      const next = [...prev, trimmed];
      localStorage.setItem('elbanna_farms', JSON.stringify(next));
      const supabase = getSupabaseClient();
      if (supabase && isCloudConnected) {
        supabase.from('system_settings').upsert({ key: 'farms', value: JSON.stringify(next) })
          .then(({ error }) => { if (error) console.warn("Supabase save farms error:", error); });
      }
      return next;
    });
  };

  // ====== المرحلة 1 من تطوير نظام طلبات النقل: إعدادات تكلفة خطوط السير ======

  // نقطة البداية/النهاية الافتراضية لخط السير لو السيارة مالهاش جراج محدد في بياناتها
  const [defaultGarageLocation, setDefaultGarageLocation] = useState<string>(() => {
    try {
      const saved = localStorage.getItem('elbanna_default_garage_location');
      return saved && saved.trim() ? saved : 'منيا القمح';
    } catch {
      return 'منيا القمح';
    }
  });

  const updateDefaultGarageLocation = (location: string) => {
    const trimmed = location.trim() || 'منيا القمح';
    setDefaultGarageLocation(trimmed);
    localStorage.setItem('elbanna_default_garage_location', trimmed);
    const supabase = getSupabaseClient();
    if (supabase && isCloudConnected) {
      supabase.from('system_settings').upsert({ key: 'default_garage_location', value: trimmed })
        .then(({ error }) => { if (error) console.warn("Supabase save default_garage_location error:", error); });
    }
  };

  // بنود التكلفة الإضافية القابلة للإضافة من الإعدادات (بجانب دخان السائق)
  const [costItemTypes, setCostItemTypes] = useState<CostItemType[]>(() =>
    loadSavedArray<CostItemType>('elbanna_cost_item_types', [])
  );

  const persistCostItemTypes = (next: CostItemType[]) => {
    setCostItemTypes(next);
    localStorage.setItem('elbanna_cost_item_types', JSON.stringify(next));
    const supabase = getSupabaseClient();
    if (supabase && isCloudConnected) {
      supabase.from('system_settings').upsert({ key: 'cost_item_types', value: JSON.stringify(next) })
        .then(({ error }) => { if (error) console.warn("Supabase save cost_item_types error:", error); });
    }
  };

  const addCostItemType = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (costItemTypes.some(i => i.name === trimmed)) return;
    persistCostItemTypes([...costItemTypes, { id: generateId('cost_item'), name: trimmed }]);
  };

  const deleteCostItemType = (id: string) => {
    persistCostItemTypes(costItemTypes.filter(i => i.id !== id));
  };

  // نولون السيارة لكل كيلومتر حسب نوع السيارة — المفتاح هو نوع السيارة (car_type)
  const [vehicleFreightRates, setVehicleFreightRates] = useState<Record<string, number>>(() =>
    loadSavedObject('elbanna_vehicle_freight_rates', {})
  );

  const updateVehicleFreightRate = (carType: string, ratePerKm: number) => {
    setVehicleFreightRates(prev => {
      const next = { ...prev, [carType]: ratePerKm };
      localStorage.setItem('elbanna_vehicle_freight_rates', JSON.stringify(next));
      const supabase = getSupabaseClient();
      if (supabase && isCloudConnected) {
        supabase.from('system_settings').upsert({ key: 'vehicle_freight_rates', value: JSON.stringify(next) })
          .then(({ error }) => { if (error) console.warn("Supabase save vehicle_freight_rates error:", error); });
      }
      return next;
    });
  };

  const deleteVehicleFreightRate = (carType: string) => {
    setVehicleFreightRates(prev => {
      const next = { ...prev };
      delete next[carType];
      localStorage.setItem('elbanna_vehicle_freight_rates', JSON.stringify(next));
      const supabase = getSupabaseClient();
      if (supabase && isCloudConnected) {
        supabase.from('system_settings').upsert({ key: 'vehicle_freight_rates', value: JSON.stringify(next) })
          .then(({ error }) => { if (error) console.warn("Supabase save vehicle_freight_rates error:", error); });
      }
      return next;
    });
  };

  // لائحة خطوط السير (من - إلى - مبلغ الدخان الافتراضي)
  const [routePriceList, setRoutePriceList] = useState<RoutePriceEntry[]>(() =>
    loadSavedArray<RoutePriceEntry>('elbanna_route_price_list', [])
  );

  const persistRoutePriceList = (next: RoutePriceEntry[]) => {
    setRoutePriceList(next);
    localStorage.setItem('elbanna_route_price_list', JSON.stringify(next));
    const supabase = getSupabaseClient();
    if (supabase && isCloudConnected) {
      supabase.from('system_settings').upsert({ key: 'route_price_list', value: JSON.stringify(next) })
        .then(({ error }) => { if (error) console.warn("Supabase save route_price_list error:", error); });
    }
  };

  const addRoutePrice = (fromLocation: string, toLocation: string, smokeAmount: number, distanceKm: number = 0) => {
    const from = fromLocation.trim();
    const to = toLocation.trim();
    if (!from || !to) return;
    persistRoutePriceList([...routePriceList, { id: generateId('route'), from_location: from, to_location: to, smoke_amount: smokeAmount, distance_km: distanceKm }]);
  };

  const updateRoutePrice = (id: string, fromLocation: string, toLocation: string, smokeAmount: number, distanceKm: number = 0) => {
    persistRoutePriceList(routePriceList.map(r => r.id === id ? { ...r, from_location: fromLocation.trim(), to_location: toLocation.trim(), smoke_amount: smokeAmount, distance_km: distanceKm } : r));
  };

  const deleteRoutePrice = (id: string) => {
    persistRoutePriceList(routePriceList.filter(r => r.id !== id));
  };

  // ====== المرحلة 2: بيانات تكلفة خط سير كل طلب نقل (Route Accounting) ======
  const [transportRequestCosts, setTransportRequestCosts] = useState<TransportRequestCost[]>(() =>
    loadSavedArray<TransportRequestCost>('elbanna_transport_request_costs', [])
  );

  const persistTransportRequestCosts = (next: TransportRequestCost[]) => {
    setTransportRequestCosts(next);
    localStorage.setItem('elbanna_transport_request_costs', JSON.stringify(next));
    const supabase = getSupabaseClient();
    if (supabase && isCloudConnected) {
      supabase.from('system_settings').upsert({ key: 'transport_request_costs', value: JSON.stringify(next) })
        .then(({ error }) => { if (error) console.warn("Supabase save transport_request_costs error:", error); });
    }
  };

  // إضافة أو تحديث سجل تكلفة خط سير لطلب معين (سجل واحد لكل طلب — upsert حسب request_id)
  const upsertTransportRequestCost = (requestId: string, data: Omit<TransportRequestCost, 'id' | 'request_id' | 'updated_at' | 'updated_by'>) => {
    const existing = transportRequestCosts.find(c => c.request_id === requestId);
    const record: TransportRequestCost = {
      id: existing?.id || generateId('trc'),
      request_id: requestId,
      ...data,
      updated_at: new Date().toISOString(),
      updated_by: currentUser?.name || currentUser?.username,
    };
    const next = existing
      ? transportRequestCosts.map(c => c.request_id === requestId ? record : c)
      : [...transportRequestCosts, record];
    persistTransportRequestCosts(next);
    return record;
  };

  const deleteTransportRequestCost = (requestId: string) => {
    persistTransportRequestCosts(transportRequestCosts.filter(c => c.request_id !== requestId));
  };

  // ====== مصاريف وأرباح السيارات اليومية (CarDailyCost): النولون، كارتات، مخالفات، غسيل كاوتش،
  // صيانة — كل ده مربوط بالسيارة + تاريخ التنفيذ (مش بطلب بعينه)، عشان يدعم حساب ربحية السيارة ======
  const [carDailyCosts, setCarDailyCosts] = useState<CarDailyCost[]>(() =>
    loadSavedArray<CarDailyCost>('elbanna_car_daily_costs', [])
  );

  // لو جداول التكاليف موجودة في Supabase بنكتب الصفوف المتغيّرة بس (مفيش جهاز بيمسح شغل جهاز تاني)، وإلا بنرجع للطريقة القديمة
  const costTablesRef = useRef<{ daily: boolean; monthly: boolean; fuel: boolean; plans: boolean }>({ daily: false, monthly: false, fuel: false, plans: false });
  const syncCostRows = (table: string, onConflict: string, prev: any[], next: any[]) => {
    const client = getSupabaseClient();
    if (!client || !isCloudConnected) return;
    const before = new Map(prev.map(r => [r.id, JSON.stringify(r)]));
    const changed = next.filter(r => before.get(r.id) !== JSON.stringify(r));
    if (changed.length === 0) return;
    client.from(table).upsert(changed, { onConflict })
      .then(({ error }) => { if (error) console.warn(`Supabase save ${table} error:`, error.message); });
  };

  const persistCarDailyCosts = (next: CarDailyCost[]) => {
    const prevRows = carDailyCosts;
    setCarDailyCosts(next);
    localStorage.setItem('elbanna_car_daily_costs', JSON.stringify(next));
    if (costTablesRef.current.daily) {
      syncCostRows('car_daily_costs', 'car_id,date', prevRows, next);
      return;
    }
    const supabase = getSupabaseClient();
    if (supabase && isCloudConnected) {
      supabase.from('system_settings').upsert({ key: 'car_daily_costs', value: JSON.stringify(next) })
        .then(({ error }) => { if (error) console.warn("Supabase save car_daily_costs error:", error); });
    }
  };

  // إضافة أو تحديث سجل مصاريف يوم معين لسيارة معينة (سجل واحد لكل سيارة+تاريخ — upsert)
  const upsertCarDailyCost = (carId: string, date: string, data: Omit<CarDailyCost, 'id' | 'car_id' | 'date' | 'updated_at' | 'updated_by'>) => {
    const normalizedDate = normalizeDateToYmd(date);
    const existing = carDailyCosts.find(c => c.car_id === carId && c.date === normalizedDate);
    if (!canEditMonth(normalizedDate)) {
      return existing || ({ id: '', car_id: carId, date: normalizedDate, ...data, updated_at: '' } as CarDailyCost);
    }
    const record: CarDailyCost = {
      id: existing?.id || generateId('cdc'),
      car_id: carId,
      date: normalizedDate,
      ...data,
      // تكلفة الصيانة دايمًا بتتحسب حيًّا من فواتير الصيانة الحقيقية لنفس السيارة/اليوم — مش
      // رقم يدوي، عشان ميتحسبش مرتين (قرار المراجعة بتاريخ اعتماد خطة إعادة الهيكلة)
      maintenance_amount: getMaintenanceCostForCarDay(carId, normalizedDate),
      updated_at: new Date().toISOString(),
      updated_by: currentUser?.name || currentUser?.username,
    };
    const next = existing
      ? carDailyCosts.map(c => (c.car_id === carId && c.date === normalizedDate) ? record : c)
      : [...carDailyCosts, record];
    persistCarDailyCosts(next);
    return record;
  };

  // حفظ مصاريف عدة سيارات/أيام مرة واحدة. مهم: الاستدعاء المتكرر لـ upsertCarDailyCost في حلقة بيكتب
  // فوق بعضه (كل استدعاء بيبني على نفس الحالة القديمة) فكان بيتحفظ آخر سجل بس — هنا كله بيتجمّع الأول.
  const upsertCarDailyCostsBatch = (entries: { carId: string; date: string; data: Omit<CarDailyCost, 'id' | 'car_id' | 'date' | 'updated_at' | 'updated_by'> }[]) => {
    let next = carDailyCosts;
    let saved = 0, skippedLocked = 0;
    entries.forEach(({ carId, date, data }) => {
      const normalizedDate = normalizeDateToYmd(date);
      if (!canEditMonth(normalizedDate)) { skippedLocked++; return; }
      const existing = next.find(c => c.car_id === carId && c.date === normalizedDate);
      const record: CarDailyCost = {
        id: existing?.id || generateId('cdc'),
        car_id: carId,
        date: normalizedDate,
        ...data,
        maintenance_amount: getMaintenanceCostForCarDay(carId, normalizedDate),
        updated_at: new Date().toISOString(),
        updated_by: currentUser?.name || currentUser?.username,
      };
      next = existing
        ? next.map(c => (c.car_id === carId && c.date === normalizedDate) ? record : c)
        : [...next, record];
      saved++;
    });
    if (saved > 0) persistCarDailyCosts(next);
    return { saved, skippedLocked };
  };

  const deleteCarDailyCost = (carId: string, date: string) => {
    const normalizedDate = normalizeDateToYmd(date);
    if (!canEditMonth(normalizedDate)) return;
    persistCarDailyCosts(carDailyCosts.filter(c => !(c.car_id === carId && c.date === normalizedDate)));
  };

  // ===== التكاليف الشهرية (مرتب السائق + سولار + زيت) لكل سيارة — بنفس طريقة حفظ المصاريف اليومية =====
  const [carMonthlyCosts, setCarMonthlyCosts] = useState<CarMonthlyCost[]>(() =>
    loadSavedArray<CarMonthlyCost>('elbanna_car_monthly_costs', [])
  );

  const persistCarMonthlyCosts = (next: CarMonthlyCost[]) => {
    const prevRows = carMonthlyCosts;
    setCarMonthlyCosts(next);
    localStorage.setItem('elbanna_car_monthly_costs', JSON.stringify(next));
    if (costTablesRef.current.monthly) {
      syncCostRows('car_monthly_costs', 'car_id,month', prevRows, next);
      return;
    }
    const supabase = getSupabaseClient();
    if (supabase && isCloudConnected) {
      supabase.from('system_settings').upsert({ key: 'car_monthly_costs', value: JSON.stringify(next) })
        .then(({ error }) => { if (error) console.warn("Supabase save car_monthly_costs error:", error); });
    }
  };

  const upsertCarMonthlyCost = (carId: string, month: string, data: Omit<CarMonthlyCost, 'id' | 'car_id' | 'month' | 'updated_at' | 'updated_by'>) => {
    const existing = carMonthlyCosts.find(c => c.car_id === carId && c.month === month);
    if (!canEditMonth(month)) {
      return existing || ({ id: '', car_id: carId, month, ...data, updated_at: '' } as CarMonthlyCost);
    }
    const record: CarMonthlyCost = {
      id: existing?.id || generateId('cmc'),
      car_id: carId,
      month,
      ...data,
      updated_at: new Date().toISOString(),
      updated_by: currentUser?.name || currentUser?.username,
    };
    persistCarMonthlyCosts(existing
      ? carMonthlyCosts.map(c => (c.car_id === carId && c.month === month) ? record : c)
      : [...carMonthlyCosts, record]);
    return record;
  };

  const upsertCarMonthlyCostsBatch = (entries: { carId: string; month: string; data: Omit<CarMonthlyCost, 'id' | 'car_id' | 'month' | 'updated_at' | 'updated_by'> }[]) => {
    let next = carMonthlyCosts;
    let saved = 0, skippedLocked = 0;
    entries.forEach(({ carId, month, data }) => {
      if (!canEditMonth(month)) { skippedLocked++; return; }
      const existing = next.find(c => c.car_id === carId && c.month === month);
      const record: CarMonthlyCost = {
        id: existing?.id || generateId('cmc'),
        car_id: carId,
        month,
        ...data,
        updated_at: new Date().toISOString(),
        updated_by: currentUser?.name || currentUser?.username,
      };
      next = existing
        ? next.map(c => (c.car_id === carId && c.month === month) ? record : c)
        : [...next, record];
      saved++;
    });
    if (saved > 0) persistCarMonthlyCosts(next);
    return { saved, skippedLocked };
  };

  const deleteCarMonthlyCost = (carId: string, month: string) => {
    if (!canEditMonth(month)) return;
    persistCarMonthlyCosts(carMonthlyCosts.filter(c => !(c.car_id === carId && c.month === month)));
  };

  // ===== سجل التموين + خطط الصيانة الوقائية =====
  const [fuelLogs, setFuelLogs] = useState<FuelLog[]>(() => loadSavedArray<FuelLog>('elbanna_fuel_logs', []));
  const [servicePlans, setServicePlans] = useState<ServicePlan[]>(() => loadSavedArray<ServicePlan>('elbanna_service_plans', []));

  const persistRows = <T extends { id: string }>(table: string, storageKey: string, tableOk: boolean, prev: T[], next: T[], setter: (rows: T[]) => void) => {
    setter(next);
    localStorage.setItem(storageKey, JSON.stringify(next));
    if (tableOk) {
      syncCostRows(table, 'id', prev, next);
      return;
    }
    const client = getSupabaseClient();
    if (client && isCloudConnected) {
      client.from('system_settings').upsert({ key: table, value: JSON.stringify(next) })
        .then(({ error }) => { if (error) console.warn(`Supabase save ${table} error:`, error); });
    }
  };

  const getCarOdometer = (carId: string): number | null => {
    const readings = fuelLogs.filter(l => l.car_id === carId && typeof l.odometer_km === 'number').map(l => l.odometer_km as number);
    return readings.length > 0 ? Math.max(...readings) : null;
  };

  const upsertFuelLog = (data: Omit<FuelLog, 'id' | 'updated_at' | 'updated_by' | 'total_amount'> & { id?: string; total_amount?: number }): { success: boolean; error?: string } => {
    if (!data.car_id) return { success: false, error: 'اختار السيارة.' };
    if (!(data.liters > 0)) return { success: false, error: 'اكتب عدد اللترات.' };
    if (!canEditMonth(data.date)) return { success: false, error: MONTH_LOCKED_MSG };
    const existing = data.id ? fuelLogs.find(l => l.id === data.id) : undefined;
    if (existing && !canEditMonth(existing.date)) return { success: false, error: MONTH_LOCKED_MSG };
    const record: FuelLog = {
      ...data,
      id: existing?.id || generateId('fuel'),
      total_amount: data.total_amount && data.total_amount > 0 ? data.total_amount : Math.round(data.liters * (data.price_per_liter || 0) * 100) / 100,
      updated_at: new Date().toISOString(),
      updated_by: currentUser?.name || currentUser?.username,
    };
    persistRows('fuel_logs', 'elbanna_fuel_logs', costTablesRef.current.fuel, fuelLogs, existing ? fuelLogs.map(l => l.id === record.id ? record : l) : [...fuelLogs, record], setFuelLogs);
    return { success: true };
  };

  const deleteFuelLog = (id: string): { success: boolean; error?: string } => {
    const target = fuelLogs.find(l => l.id === id);
    if (!target) return { success: false, error: 'التموين غير موجود.' };
    if (!canEditMonth(target.date)) return { success: false, error: MONTH_LOCKED_MSG };
    persistRows('fuel_logs', 'elbanna_fuel_logs', costTablesRef.current.fuel, fuelLogs, fuelLogs.filter(l => l.id !== id), setFuelLogs);
    return { success: true };
  };

  const upsertServicePlan = (data: Omit<ServicePlan, 'id' | 'updated_at' | 'updated_by'> & { id?: string }): { success: boolean; error?: string } => {
    if (!data.car_id) return { success: false, error: 'اختار السيارة.' };
    if (!data.name.trim()) return { success: false, error: 'اكتب اسم الخدمة.' };
    if (!(data.interval_km > 0)) return { success: false, error: 'اكتب المسافة بين كل خدمة والتانية بالكيلومتر.' };
    const existing = data.id ? servicePlans.find(p => p.id === data.id) : undefined;
    const record: ServicePlan = {
      ...data,
      name: data.name.trim(),
      id: existing?.id || generateId('plan'),
      updated_at: new Date().toISOString(),
      updated_by: currentUser?.name || currentUser?.username,
    };
    persistRows('service_plans', 'elbanna_service_plans', costTablesRef.current.plans, servicePlans, existing ? servicePlans.map(p => p.id === record.id ? record : p) : [...servicePlans, record], setServicePlans);
    return { success: true };
  };

  const deleteServicePlan = (id: string) => {
    persistRows('service_plans', 'elbanna_service_plans', costTablesRef.current.plans, servicePlans, servicePlans.filter(p => p.id !== id), setServicePlans);
  };

  // تسجيل إن الخدمة اتنفذت دلوقتي (بقراءة العدّاد لو متاحة، وإلا بالتاريخ بس)
  const markServiceDone = (planId: string, odometer?: number) => {
    const plan = servicePlans.find(p => p.id === planId);
    if (!plan) return;
    upsertServicePlan({
      ...plan,
      last_done_date: new Date().toISOString().split('T')[0],
      last_done_km: odometer ?? getCarOdometer(plan.car_id) ?? undefined,
    });
  };

  // ===== قفل الأشهر: بعد ما الأدمن يقفل شهر، مصاريفه وفواتير التراخيص بتاعته مابتتعدّلش غير بأدمن البرنامج =====
  const [lockedMonths, setLockedMonths] = useState<{ month: string; locked_by?: string; locked_at: string }[]>(() =>
    loadSavedArray<{ month: string; locked_by?: string; locked_at: string }>('elbanna_locked_months', [])
  );
  const MONTH_LOCKED_MSG = 'الشهر ده مقفول — التعديل عليه متاح لأدمن البرنامج فقط.';
  const persistLockedMonths = (next: { month: string; locked_by?: string; locked_at: string }[]) => {
    setLockedMonths(next);
    localStorage.setItem('elbanna_locked_months', JSON.stringify(next));
    const client = getSupabaseClient();
    if (client && isCloudConnected) {
      client.from('system_settings').upsert({ key: 'locked_months', value: JSON.stringify(next) })
        .then(({ error }) => { if (error) console.warn("Supabase save locked_months error:", error); });
    }
  };
  const isMonthLocked = (dateOrMonth: string): boolean => isMonthLockedIn(lockedMonths, dateOrMonth);
  const canEditMonth = (dateOrMonth: string): boolean => canEditMonthFor(lockedMonths, currentUser?.role, dateOrMonth);
  const lockMonth = (month: string): { success: boolean; error?: string } => {
    if (currentUser?.role !== 'admin') return { success: false, error: 'قفل الشهر متاح لأدمن البرنامج فقط.' };
    if (!/^\d{4}-\d{2}$/.test(month)) return { success: false, error: 'صيغة الشهر غير صحيحة.' };
    if (isMonthLocked(month)) return { success: true };
    persistLockedMonths([...lockedMonths, { month, locked_by: currentUser?.name || currentUser?.username, locked_at: new Date().toISOString() }]);
    return { success: true };
  };
  const unlockMonth = (month: string): { success: boolean; error?: string } => {
    if (currentUser?.role !== 'admin') return { success: false, error: 'فتح الشهر متاح لأدمن البرنامج فقط.' };
    persistLockedMonths(lockedMonths.filter(m => m.month !== month));
    return { success: true };
  };

  // استرجاع من نسخة احتياطية: بيستبدل البيانات الأساسية بالكامل (السائقين، السيارات، المسؤولين، الفواتير،
  // الحركات، العهد، طلبات النقل، تكاليف السيارات). المستخدمين وكلمات المرور والصيانة مش جوه الاسترجاع.
  const restoreFromBackup = (payload: any): { success: boolean; message: string } => {
    const data = payload?.data;
    if (payload?.app !== 'elbanna-fleet' || !data || typeof data !== 'object') {
      return { success: false, message: 'الملف ده مش نسخة احتياطية صالحة لنظام الأسطول.' };
    }
    const list = (v: any): any[] => (Array.isArray(v) ? v : []);
    const restoredOfficials = list(data.officials).map((o: any) => ({
      ...o,
      // كلمات المرور مالهاش وجود في جدول المسؤولين (الدخول عبر Supabase Auth)
      password: undefined,
    }));

    // السجلات اللي في النسخة لازم تتشال من قائمة المحذوفات عشان ماتتفلترش بعد الاسترجاع
    const idsByTable: Record<string, Set<string>> = {
      drivers: new Set(list(data.drivers).map((r: any) => r.id)),
      officials: new Set(restoredOfficials.map((r: any) => r.id)),
      cars: new Set(list(data.cars).map((r: any) => r.id)),
      violations: new Set(list(data.violations).map((r: any) => r.id)),
      invoices: new Set(list(data.invoices).map((r: any) => r.id)),
      invoice_items: new Set(list(data.invoiceItems).map((r: any) => r.id)),
      driver_account_movements: new Set(list(data.driverMovements).map((r: any) => r.id)),
      custody_accounts: new Set(list(data.custodyAccounts).map((r: any) => r.id)),
      custody_movements: new Set(list(data.custodyMovements).map((r: any) => r.id)),
      transport_requests: new Set(list(data.transportRequests).map((r: any) => r.id)),
    };
    const t: Record<string, string[]> = { ...tombstonesRef.current };
    Object.keys(idsByTable).forEach(tb => {
      if (t[tb]) t[tb] = t[tb].filter(id => !idsByTable[tb].has(id));
    });
    saveTombstones(t);

    setDrivers(list(data.drivers));
    setOfficials(restoredOfficials as Official[]);
    setCars(list(data.cars));
    setViolations(list(data.violations));
    setInvoices(list(data.invoices));
    setInvoiceItems(list(data.invoiceItems));
    setAuditLogs(list(data.auditLogs));
    setMovements(list(data.driverMovements));
    setCustodyAccounts(list(data.custodyAccounts));
    setCustodyMovements(list(data.custodyMovements));
    setTransportRequests(list(data.transportRequests).map((r: any) => normalizeTransportRequest(r)));
    persistCarDailyCosts(list(data.carDailyCosts));
    persistCarMonthlyCosts(list(data.carMonthlyCosts));
    if (Array.isArray(data.fuelLogs)) persistRows('fuel_logs', 'elbanna_fuel_logs', costTablesRef.current.fuel, fuelLogs, data.fuelLogs, setFuelLogs);
    if (Array.isArray(data.servicePlans)) persistRows('service_plans', 'elbanna_service_plans', costTablesRef.current.plans, servicePlans, data.servicePlans, setServicePlans);

    return {
      success: true,
      message: `تم الاسترجاع: ${list(data.drivers).length} سائق، ${list(data.cars).length} سيارة، ${list(data.invoices).length} فاتورة، ${list(data.transportRequests).length} طلب نقل.`,
    };
  };

  const [isRealtimeActive, setRealtimeActive] = useState(true);
  const [latencyMs, setLatencyMs] = useState(50);

  // Cloud management state
  const [isCloudConnected, setIsCloudConnected] = useState(false);
  const [isCloudSyncing, setIsCloudSyncing] = useState(false);
  const [cloudError, setCloudError] = useState<string | null>(null);
  const isDownloadingRef = useRef(false);
  const isFirstMountRef = useRef(true);

  // ===== سجل المحذوفات (Tombstones) =====
  // أي سجل بيتحذف محليًا بنسجل الـ id بتاعه هنا ونرفعه للسحابة (system_settings / deleted_ids).
  // كده أي جهاز/متصفح فيه نسخة قديمة مش هيقدر يرجّع السجل المحذوف تاني، لا عند التحميل ولا عند الرفع.
  const TOMBSTONE_KEY = 'elbanna_deleted_ids_v1';
  // ترتيب الحذف من السحابة (الأبناء قبل الآباء)
  const PURGE_ORDER = ['fuel_logs', 'service_plans', 'car_daily_costs', 'car_monthly_costs', 'invoice_items', 'driver_account_movements', 'violations', 'custody_movements', 'custody_accounts', 'maintenance_invoices', 'maintenance_requests', 'transport_requests', 'invoices', 'cars', 'drivers', 'officials'];
  const readTombstones = (): Record<string, string[]> => {
    try {
      const raw = localStorage.getItem(TOMBSTONE_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch { return {}; }
  };
  const tombstonesRef = useRef<Record<string, string[]>>(readTombstones());
  const prevIdsRef = useRef<Record<string, Set<string>> | null>(null);

  const saveTombstones = (t: Record<string, string[]>) => {
    tombstonesRef.current = t;
    try { localStorage.setItem(TOMBSTONE_KEY, JSON.stringify(t)); } catch (e) { console.warn('tombstones save error', e); }
  };
  // أسماء المشرفين المحذوفين (عشان الفواتير اللي باسمهم تفضل ظاهرة بالاسم بعد حذف المشرف)
  const DELETED_NAMES_KEY = 'elbanna_deleted_official_names';
  const [deletedOfficialNames, setDeletedOfficialNames] = useState<Record<string, string>>(() => {
    try { return JSON.parse(localStorage.getItem(DELETED_NAMES_KEY) || '{}') || {}; } catch { return {}; }
  });
  const saveDeletedOfficialNames = (next: Record<string, string>) => {
    setDeletedOfficialNames(next);
    try { localStorage.setItem(DELETED_NAMES_KEY, JSON.stringify(next)); } catch {}
    const client = getSupabaseClient();
    if (client) {
      client.from('system_settings').upsert({ key: 'deleted_official_names', value: JSON.stringify(next) })
        .then(({ error }) => { if (error) console.warn('push deleted official names error:', error.message); });
    }
  };
  const notDeleted = <T extends { id: string }>(table: string, rows: T[]): T[] => {
    const ids = tombstonesRef.current[table];
    if (!ids || ids.length === 0) return rows;
    const set = new Set(ids);
    return rows.filter(r => !set.has(r.id));
  };
  const pushTombstonesToCloud = async () => {
    const client = getSupabaseClient();
    if (!client) return;
    try {
      const { error } = await client.from('system_settings').upsert({ key: 'deleted_ids', value: JSON.stringify(tombstonesRef.current) });
      if (error) console.warn('push tombstones error:', error.message);
    } catch (e) { console.warn('push tombstones exception:', e); }
  };
  // حذف فعلي من السحابة مع فحص الخطأ (الحذف بيتعاد تلقائيًا في كل فتح للموقع لو فشل)
  const purgeCloudRows = async (byTable: Record<string, string[]>) => {
    const client = getSupabaseClient();
    if (!client) return;
    for (const table of PURGE_ORDER) {
      const ids = byTable[table];
      if (!ids || ids.length === 0) continue;
      for (let i = 0; i < ids.length; i += 100) {
        try {
          const { error } = await client.from(table).delete().in('id', ids.slice(i, i + 100));
          if (error) console.warn(`purge ${table} error:`, error.message);
        } catch (e) { console.warn(`purge ${table} exception:`, e); }
      }
    }
  };

  // رصد أي سجل اختفى من الحالة (حذف) وتسجيله + حذفه من السحابة
  useEffect(() => {
    const current: Record<string, { id: string }[]> = {
      drivers, officials, cars, violations, invoices,
      invoice_items: invoiceItems,
      driver_account_movements: movements,
      custody_accounts: custodyAccounts,
      custody_movements: custodyMovements,
      transport_requests: transportRequests,
      maintenance_requests: maintenanceRequests,
      maintenance_invoices: maintenanceInvoices,
      car_daily_costs: carDailyCosts,
      car_monthly_costs: carMonthlyCosts,
      fuel_logs: fuelLogs,
      service_plans: servicePlans
    };
    const nextIds: Record<string, Set<string>> = {};
    Object.keys(current).forEach(t => { nextIds[t] = new Set(current[t].map(r => r.id)); });
    const prev = prevIdsRef.current;
    prevIdsRef.current = nextIds;
    if (!prev) return;

    const t: Record<string, string[]> = { ...tombstonesRef.current };
    const removedByTable: Record<string, string[]> = {};
    let changed = false;
    Object.keys(nextIds).forEach(table => {
      const p = prev[table]; const n = nextIds[table];
      if (!p || !n) return;
      const removed = [...p].filter(id => !n.has(id));
      const added = [...n].filter(id => !p.has(id));
      let list = t[table] || [];
      if (added.length && list.length) {
        const addedSet = new Set(added);
        const next = list.filter(id => !addedSet.has(id));
        if (next.length !== list.length) { list = next; changed = true; }
      }
      if (removed.length) {
        list = Array.from(new Set([...list, ...removed]));
        removedByTable[table] = removed;
        changed = true;
      }
      if (list.length > 5000) list = list.slice(-5000);
      t[table] = list;
    });
    if (!changed) return;
    saveTombstones(t);
    (async () => {
      await pushTombstonesToCloud();
      await purgeCloudRows(removedByTable);
    })();
  }, [drivers, officials, cars, violations, invoices, invoiceItems, movements, custodyAccounts, custodyMovements, transportRequests, maintenanceRequests, maintenanceInvoices, carDailyCosts, carMonthlyCosts, fuelLogs, servicePlans]);

  // Persist store state in local storage (local backup)
  useEffect(() => {
    localStorage.setItem('elbanna_drivers', JSON.stringify(drivers));
  }, [drivers]);

  useEffect(() => {
    localStorage.setItem('elbanna_officials', JSON.stringify(officials));
  }, [officials]);

  useEffect(() => {
    localStorage.setItem('elbanna_cars', JSON.stringify(cars));
  }, [cars]);

  useEffect(() => {
    localStorage.setItem('elbanna_violations', JSON.stringify(violations));
  }, [violations]);

  useEffect(() => {
    localStorage.setItem('elbanna_invoices', JSON.stringify(invoices));
  }, [invoices]);

  useEffect(() => {
    localStorage.setItem('elbanna_invoice_items', JSON.stringify(invoiceItems));
  }, [invoiceItems]);

  useEffect(() => {
    localStorage.setItem('elbanna_audit_logs', JSON.stringify(auditLogs));
  }, [auditLogs]);

  useEffect(() => {
    localStorage.setItem('elbanna_movements', JSON.stringify(movements));
  }, [movements]);

  useEffect(() => {
    localStorage.setItem('elbanna_custody_accounts', JSON.stringify(custodyAccounts));
  }, [custodyAccounts]);

  useEffect(() => {
    localStorage.setItem('elbanna_custody_movements', JSON.stringify(custodyMovements));
  }, [custodyMovements]);

  useEffect(() => {
    localStorage.setItem('elbanna_companies', JSON.stringify(companies));
  }, [companies]);

  useEffect(() => {
    localStorage.setItem('elbanna_hidden_companies', JSON.stringify(hiddenCompanies));
  }, [hiddenCompanies]);

  useEffect(() => {
    localStorage.setItem('elbanna_transport_requests', JSON.stringify(transportRequests));
  }, [transportRequests]);

  useEffect(() => {
    localStorage.setItem('elbanna_farms', JSON.stringify(farms));
  }, [farms]);

  // Automatic background silent upload whenever state changes locally (without manual triggers)
  useEffect(() => {
    // Skip the very first run on mount to prevent uploading stale local storage data before downloading fresh cloud data
    if (isFirstMountRef.current) {
      isFirstMountRef.current = false;
      return;
    }

    const client = getSupabaseClient();
    if (!client) return;

    const delayDebounce = setTimeout(async () => {
      if (!currentUserRef.current) return; // الجداول مقفولة قبل تسجيل الدخول
      if (isDownloadingRef.current) {
        await new Promise(r => setTimeout(r, 3000));
        if (isDownloadingRef.current) return;
      }
      try {
        const res = await uploadLocalDataToCloud();
        if (!res.success) {
          setCloudError(res.message);
          setTimeout(async () => {
            const retry = await uploadLocalDataToCloud();
            if (retry.success) setCloudError(null);
          }, 5000);
        } else {
          setCloudError(null);
        }
      } catch (err: any) {
        console.error("Auto-upload error:", err);
      }
    }, 1500);

    return () => clearTimeout(delayDebounce);
  }, [drivers, officials, cars, violations, invoices, invoiceItems, auditLogs, movements, custodyAccounts, custodyMovements, companies, hiddenCompanies]);

  // Network jitter simulation
  useEffect(() => {
    const interval = setInterval(() => {
      if (isRealtimeActive) {
        setLatencyMs(Math.floor(Math.random() * 80) + 30);
      }
    }, 4000);
    return () => clearInterval(interval);
  }, [isRealtimeActive]);

  // Download Cloud Data to Local (Replaces currently loaded state with database content)
  const downloadCloudDataToLocal = async (isManual: boolean = false): Promise<{ success: boolean; message: string }> => {
    const supabase = getSupabaseClient();
    if (!supabase) {
      setIsCloudConnected(false);
      return { success: false, message: "مفاتيح ربط Supabase السحابية غير مهيأة بعد." };
    }

    setIsCloudSyncing(true);
    setCloudError(null);
    isDownloadingRef.current = true;

    try {
      const [
        resDrivers,
        resOfficials,
        resCars,
        resViolations,
        resInvoices,
        resItems,
        resLogs,
        resMovements,
        resCustodyAccs,
        resCustodyMovs,
        resTransportRequests,
        resMaintenanceRequests,
        resMaintenanceInvoices,
        resDailyCosts,
        resMonthlyCosts,
        resFuelLogs,
        resServicePlans
      ] = await Promise.all([
        supabase.from('drivers').select('*'),
        supabase.from('officials').select('*'),
        supabase.from('cars').select('*'),
        supabase.from('violations').select('*').order('violation_date', { ascending: false }),
        supabase.from('invoices').select('*').order('invoice_number', { ascending: false }),
        supabase.from('invoice_items').select('*'),
        supabase.from('invoice_audit_logs').select('*').order('timestamp', { ascending: false }),
        supabase.from('driver_account_movements').select('*').order('date', { ascending: false }),
        supabase.from('custody_accounts').select('*'),
        supabase.from('custody_movements').select('*').order('date', { ascending: false }),
        supabase.from('transport_requests').select('*').order('request_number', { ascending: false }),
        supabase.from('maintenance_requests').select('*').order('request_number', { ascending: false }),
        supabase.from('maintenance_invoices').select('*').order('invoice_number', { ascending: false }),
        supabase.from('car_daily_costs').select('*'),
        supabase.from('car_monthly_costs').select('*'),
        supabase.from('fuel_logs').select('*'),
        supabase.from('service_plans').select('*')
      ]);

      let errorOccurred = false;
      const detailedErrors: string[] = [];

      if (resDrivers.error) {
        errorOccurred = true;
        detailedErrors.push(`drivers: ${resDrivers.error.message} (code: ${resDrivers.error.code})`);
      }
      if (resOfficials.error) {
        errorOccurred = true;
        detailedErrors.push(`officials: ${resOfficials.error.message} (code: ${resOfficials.error.code})`);
      }
      if (resCars.error) {
        errorOccurred = true;
        detailedErrors.push(`cars: ${resCars.error.message} (code: ${resCars.error.code})`);
      }
      if (resViolations.error) {
        errorOccurred = true;
        detailedErrors.push(`violations: ${resViolations.error.message} (code: ${resViolations.error.code})`);
      }
      if (resInvoices.error) {
        errorOccurred = true;
        detailedErrors.push(`invoices: ${resInvoices.error.message} (code: ${resInvoices.error.code})`);
      }
      if (resItems.error) {
        errorOccurred = true;
        detailedErrors.push(`invoice_items: ${resItems.error.message} (code: ${resItems.error.code})`);
      }
      if (resLogs.error) {
        errorOccurred = true;
        detailedErrors.push(`invoice_audit_logs: ${resLogs.error.message} (code: ${resLogs.error.code})`);
      }
      if (resMovements.error) {
        errorOccurred = true;
        detailedErrors.push(`driver_account_movements: ${resMovements.error.message} (code: ${resMovements.error.code})`);
      }
      if (resCustodyAccs.error) {
        errorOccurred = true;
        detailedErrors.push(`custody_accounts: ${resCustodyAccs.error.message} (code: ${resCustodyAccs.error.code})`);
      }
      if (resCustodyMovs.error) {
        errorOccurred = true;
        detailedErrors.push(`custody_movements: ${resCustodyMovs.error.message} (code: ${resCustodyMovs.error.code})`);
      }
      // جدول طلبات النقل قد لا يكون منشأ بعد على مشاريع قديمة، فلا نمنع باقي المزامنة بسببه
      if (resTransportRequests.error && !resTransportRequests.error.message?.includes("does not exist") && !resTransportRequests.error.message?.includes("schema cache")) {
        errorOccurred = true;
        detailedErrors.push(`transport_requests: ${resTransportRequests.error.message} (code: ${resTransportRequests.error.code})`);
      }
      // جداول الصيانة جديدة وقد لا تكون منشأة بعد، فلا نمنع باقي المزامنة بسببها
      if (resMaintenanceRequests.error && !resMaintenanceRequests.error.message?.includes("does not exist") && !resMaintenanceRequests.error.message?.includes("schema cache")) {
        errorOccurred = true;
        detailedErrors.push(`maintenance_requests: ${resMaintenanceRequests.error.message} (code: ${resMaintenanceRequests.error.code})`);
      }
      if (resMaintenanceInvoices.error && !resMaintenanceInvoices.error.message?.includes("does not exist") && !resMaintenanceInvoices.error.message?.includes("schema cache")) {
        errorOccurred = true;
        detailedErrors.push(`maintenance_invoices: ${resMaintenanceInvoices.error.message} (code: ${resMaintenanceInvoices.error.code})`);
      }

      if (errorOccurred) {
        console.warn("Supabase download tables errors:", detailedErrors);
        const mainErrorMsg = detailedErrors.join(" | ");

        // 1. Check for missing columns (error code 42703 or "column ... does not exist" message)
        const isColumnMissing = detailedErrors.some(errMsg => errMsg.includes("42703") || (errMsg.includes("column") && errMsg.includes("does not exist")));
        if (isColumnMissing) {
          setIsCloudConnected(true);
          const customMsg = "تنبيه قاعدة البيانات السحابية: هناك حقل مفقود بجدول السيارات (traffic_office) في مشروع Supabase الخاص بك. لحل هذه المشكلة فورًا لتبسيط الاتصال وعرض جميع بيانات الجداول، يرجى التوجه إلى SQL Editor في Supabase وتشغيل الكود التالي:\n\nALTER TABLE cars ADD COLUMN IF NOT EXISTS traffic_office VARCHAR(100);";
          setCloudError(customMsg);
          return { success: false, message: customMsg };
        }

        // 2. Check for missing tables (relation does not exist)
        const isRelationMissing = detailedErrors.some(errMsg => errMsg.includes("42P01") || (errMsg.includes("relation") && errMsg.includes("does not exist")) || errMsg.includes("schema cache"));
        if (isRelationMissing) {
          const missingTables: string[] = [];
          if (resDrivers.error?.message?.includes("does not exist")) missingTables.push("drivers");
          if (resOfficials.error?.message?.includes("does not exist")) missingTables.push("officials");
          if (resCars.error?.message?.includes("does not exist")) missingTables.push("cars");
          if (resViolations.error?.message?.includes("does not exist")) missingTables.push("violations");
          if (resInvoices.error?.message?.includes("does not exist")) missingTables.push("invoices");
          if (resItems.error?.message?.includes("does not exist")) missingTables.push("invoice_items");
          if (resLogs.error?.message?.includes("does not exist")) missingTables.push("invoice_audit_logs");
          if (resMovements.error?.message?.includes("does not exist")) missingTables.push("driver_account_movements");
          if (resCustodyAccs.error?.message?.includes("does not exist")) missingTables.push("custody_accounts");
          if (resCustodyMovs.error?.message?.includes("does not exist")) missingTables.push("custody_movements");
          if (resTransportRequests.error?.message?.includes("does not exist")) missingTables.push("transport_requests");

          setIsCloudConnected(true);
          const msg = `جداول قاعدة البيانات التالية غير منشأة بالخادم السحابي بعد: [ ${missingTables.join(", ")} ]. يرجى فتح نافذة الـ SQL Editor لتهيئتها لتجربة المزامنة الكاملة وحفظ البيانات فوريًا.`;
          setCloudError(msg);
          return { success: false, message: msg };
        }

        setIsCloudConnected(false);
        setCloudError(mainErrorMsg);
        return { success: false, message: `فشل جلب بعض الجداول السحابية: ${mainErrorMsg}` };
      }

      // ===== تطبيق سجل المحذوفات: دمج المحذوفات السحابية مع المحلية ثم استبعادها =====
      try {
        const { data: tsRow } = await supabase.from('system_settings').select('value').eq('key', 'deleted_ids').maybeSingle();
        if (tsRow?.value) {
          const cloudT = JSON.parse(tsRow.value) as Record<string, string[]>;
          const merged: Record<string, string[]> = { ...tombstonesRef.current };
          Object.keys(cloudT || {}).forEach(tb => {
            merged[tb] = Array.from(new Set([...(merged[tb] || []), ...(cloudT[tb] || [])]));
          });
          saveTombstones(merged);
        }
      } catch (e) { console.warn('load tombstones error', e); }
      try {
        const { data: dnRow } = await supabase.from('system_settings').select('value').eq('key', 'deleted_official_names').maybeSingle();
        if (dnRow?.value) {
          const cloudNames = JSON.parse(dnRow.value) as Record<string, string>;
          const mergedNames = { ...cloudNames, ...JSON.parse(localStorage.getItem(DELETED_NAMES_KEY) || '{}') };
          setDeletedOfficialNames(mergedNames);
          try { localStorage.setItem(DELETED_NAMES_KEY, JSON.stringify(mergedNames)); } catch {}
        }
      } catch (e) { console.warn('load deleted official names error', e); }

      const staleCloud: Record<string, string[]> = {};
      const stripDeleted = (table: string, res: any) => {
        const ids = tombstonesRef.current[table];
        if (!res?.data || !ids || ids.length === 0) return;
        const set = new Set(ids);
        const stale = res.data.filter((r: any) => set.has(r.id)).map((r: any) => r.id);
        if (stale.length > 0) {
          staleCloud[table] = stale;
          res.data = res.data.filter((r: any) => !set.has(r.id));
        }
      };
      stripDeleted('drivers', resDrivers);
      stripDeleted('officials', resOfficials);
      stripDeleted('cars', resCars);
      stripDeleted('violations', resViolations);
      stripDeleted('invoices', resInvoices);
      stripDeleted('invoice_items', resItems);
      stripDeleted('driver_account_movements', resMovements);
      stripDeleted('custody_accounts', resCustodyAccs);
      stripDeleted('custody_movements', resCustodyMovs);
      stripDeleted('transport_requests', resTransportRequests);
      stripDeleted('maintenance_requests', resMaintenanceRequests);
      stripDeleted('maintenance_invoices', resMaintenanceInvoices);
      stripDeleted('car_daily_costs', resDailyCosts);
      stripDeleted('car_monthly_costs', resMonthlyCosts);
      stripDeleted('fuel_logs', resFuelLogs);
      stripDeleted('service_plans', resServicePlans);
      if (Object.keys(staleCloud).length > 0) {
        purgeCloudRows(staleCloud); // تنظيف السحابة من السجلات المحذوفة سابقًا
      }

      // Check if all cloud tables fetched successfully and are empty
      const isDownloadedEmpty = 
        (!resDrivers.data || resDrivers.data.length === 0) &&
        (!resOfficials.data || resOfficials.data.length === 0) &&
        (!resCars.data || resCars.data.length === 0) &&
        (!resViolations.data || resViolations.data.length === 0) &&
        (!resInvoices.data || resInvoices.data.length === 0) &&
        (!resItems.data || resItems.data.length === 0) &&
        (!resLogs.data || resLogs.data.length === 0) &&
        (!resMovements.data || resMovements.data.length === 0) &&
        (!resCustodyAccs.data || resCustodyAccs.data.length === 0) &&
        (!resCustodyMovs.data || resCustodyMovs.data.length === 0);

      if (isDownloadedEmpty) {
        // If the database is completely empty (newly created project)
        // Check if there is local data to protect
        const hasLocalData = drivers.length > 5 || cars.length > 3 || invoices.length > 1;
        if (hasLocalData && !isManual) {
          console.log("Empty Cloud database detected. Proactively auto-uploading local state to seed Cloud DB...");
          // Clean the loading refs shortly so client context is allowed to write
          isDownloadingRef.current = false;
          setIsCloudSyncing(false);
          const uploadRes = await uploadLocalDataToCloud();
          if (uploadRes.success) {
            setIsCloudConnected(true);
            setCloudError(null);
            return {
              success: true,
              message: "تم الاتصال بقاعدة بياناتك السحابية الجديدة الفارغة بنجاح! ⚡\n\nولحماية بياناتك المحلية المتاحة على هذا الجهاز من الضياع، قمنا برفعها تلقائياً بالكامل وتسكينها بمشروع السحابة الجديد لضمان مزامنة سلسة ومستمرة!"
            };
          }
        }
      }

      // Populating tables individually - merging local additions with cloud fetched records
      if (resDrivers.data) {
        const cloudDrivers = resDrivers.data;
        const cloudIds = new Set(cloudDrivers.map(d => d.id));
        const cloudCodes = new Set(cloudDrivers.map(d => d.driver_code));
        const localOnly = notDeleted('drivers', drivers).filter(d => !cloudIds.has(d.id) && !cloudCodes.has(d.driver_code));
        setDrivers([...cloudDrivers, ...localOnly]);
      }
      if (resOfficials.data) {
        const cloudOfficials = resOfficials.data;
        const cloudIds = new Set(cloudOfficials.map(o => o.id));
        const localOnly = notDeleted('officials', officials).filter(o => !cloudIds.has(o.id));
        setOfficials([...cloudOfficials, ...localOnly]);
      }
      if (resCars.data) {
        const cloudCars = resCars.data;
        const cloudIds = new Set(cloudCars.map(c => c.id));
        const cloudNumbers = new Set(cloudCars.map(c => c.car_number));
        const localOnly = notDeleted('cars', cars).filter(c => !cloudIds.has(c.id) && !cloudNumbers.has(c.car_number));
        setCars([...cloudCars, ...localOnly]);
      }
      if (resViolations.data) {
        const cloudViolations = resViolations.data.map(v => ({ ...v, violation_date: normalizeDateToYmd(v.violation_date) }));
        const cloudIds = new Set(cloudViolations.map(v => v.id));
        const localOnly = notDeleted('violations', violations).filter(v => !cloudIds.has(v.id));
        setViolations([...cloudViolations, ...localOnly]);
      }
      if (resInvoices.data) {
        const cloudInvoices = resInvoices.data.map((i: any) => ({ ...i, approval_status: i.approval_status || 'approved' }));
        const cloudIds = new Set(cloudInvoices.map(i => i.id));
        const cloudNumbers = new Set(cloudInvoices.map(i => i.invoice_number));
        const localOnly = notDeleted('invoices', invoices).filter(i => !cloudIds.has(i.id) && !cloudNumbers.has(i.invoice_number));
        setInvoices([...cloudInvoices, ...localOnly]);
      }
      if (resItems.data) {
        const sorted = [...resItems.data].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
        const cloudItemIds = new Set(sorted.map(i => i.id));
        // بنود الفاتورة بتتحذف وتتحل محلها بنود جديدة (معرفات جديدة) عند أي تعديل على الفاتورة (updateInvoice).
        // لو اعتمدنا على مطابقة الـ id بس، أي جهاز/جلسة لسه محتفظة بالبنود القديمة (قبل التعديل) في
        // التخزين المحلي هترجّعها تاني كـ "بنود محلية لسه مارفعتش" فتتضاعف البنود في الفاتورة نفسها.
        // الحل: لو الفاتورة نفسها موجودة بالفعل في السحابة، نعتبر قائمة بنودها في السحابة هي المرجع
        // الوحيد لها، ونحتفظ بالبنود المحلية بس لو خاصة بفاتورة لسه مارفعتش للسحابة أصلاً.
        const cloudInvoiceIds = new Set((resInvoices.data || []).map((i: any) => i.id));
        const localOnly = notDeleted('invoice_items', invoiceItems).filter(i => !cloudItemIds.has(i.id) && !cloudInvoiceIds.has(i.invoice_id));
        setInvoiceItems([...sorted, ...localOnly]);
      }
      if (resLogs.data) {
        const cloudLogs = resLogs.data;
        const cloudIds = new Set(cloudLogs.map(l => l.id));
        const localOnly = auditLogs.filter(l => !cloudIds.has(l.id));
        setAuditLogs([...cloudLogs, ...localOnly]);
      }
      if (resMovements.data) {
        const cloudMovements = resMovements.data.map(m => ({ ...m, date: normalizeDateToYmd(m.date) }));
        const cloudIds = new Set(cloudMovements.map(m => m.id));
        const localOnly = notDeleted('driver_account_movements', movements).filter(m => !cloudIds.has(m.id));
        setMovements([...cloudMovements, ...localOnly]);

        // رفع الحركات المحلية الغائبة عن السحابة تلقائياً
        if (localOnly.length > 0 && supabase) {
          const sanitized = localOnly.map(m => ({
            ...m,
            date: normalizeDateToYmd(m.date)
          }));
          supabase.from('driver_account_movements').upsert(sanitized)
            .then(({ error }) => {
              if (error) console.warn("Auto-upload local movements error:", error.message);
              else console.log(`✅ Auto-uploaded ${sanitized.length} local movement(s) to Supabase`);
            });
        }
      }
      if (resCustodyAccs.data) {
        const cloudAccs = resCustodyAccs.data;
        const cloudIds = new Set(cloudAccs.map(a => a.id));
        const localOnly = notDeleted('custody_accounts', custodyAccounts).filter(a => !cloudIds.has(a.id));
        setCustodyAccounts([...cloudAccs, ...localOnly]);
      }
      if (resCustodyMovs.data) {
        const cloudMovs = resCustodyMovs.data;
        const cloudIds = new Set(cloudMovs.map(m => m.id));
        const localOnly = notDeleted('custody_movements', custodyMovements).filter(m => !cloudIds.has(m.id));
        setCustodyMovements([...cloudMovs, ...localOnly]);
      }
      if (resTransportRequests.data) {
        const cloudRequests = resTransportRequests.data;
        const cloudIds = new Set(cloudRequests.map((r: any) => r.id));
        const localOnly = notDeleted('transport_requests', transportRequests).filter(r => !cloudIds.has(r.id));
        setTransportRequests([...cloudRequests, ...localOnly].map((r: any) => normalizeTransportRequest(r)));
      }
      if (resMaintenanceRequests.data) {
        const cloudReqs = resMaintenanceRequests.data;
        const cloudIds = new Set(cloudReqs.map((r: any) => r.id));
        const localOnly = notDeleted('maintenance_requests', maintenanceRequests).filter(r => !cloudIds.has(r.id));
        setMaintenanceRequests([...cloudReqs, ...localOnly].map((r: any) => normalizeMaintenanceRequest(r, (resMaintenanceInvoices.data as any[]) || maintenanceInvoices) as MaintenanceRequest));
      }
      if (resMaintenanceInvoices.data) {
        const cloudInvs = resMaintenanceInvoices.data;
        const cloudIds = new Set(cloudInvs.map((i: any) => i.id));
        const localOnly = notDeleted('maintenance_invoices', maintenanceInvoices).filter(i => !cloudIds.has(i.id));
        setMaintenanceInvoices([...cloudInvs, ...localOnly]);
      }

      // ===== جداول التكاليف (car_daily_costs / car_monthly_costs) =====
      // لو الجداول موجودة بنشتغل بيها (صف لكل سجل — مفيش جهاز بيمسح شغل جهاز تاني). لو لسه ماتعملتش بنكمّل بالطريقة القديمة.
      // وأول مرة بينقل أي أرقام قديمة (الملف الواحد في system_settings + اللي على الجهاز) للجداول تلقائيًا.
      const dailyTableOk = !resDailyCosts.error;
      const monthlyTableOk = !resMonthlyCosts.error;
      const fuelTableOk = !resFuelLogs.error;
      const plansTableOk = !resServicePlans.error;
      costTablesRef.current = { daily: dailyTableOk, monthly: monthlyTableOk, fuel: fuelTableOk, plans: plansTableOk };
      const num0 = (v: any) => { const n = Number(v); return isNaN(n) ? 0 : n; };

      const mergeCostTable = async (
        table: string, keyOf: (r: any) => string, res: any, localRows: any[],
        setLocal: (rows: any[]) => void, storageKey: string, onConflict: string, normalize: (r: any) => any
      ) => {
        const cloudRows: any[] = (res.data || []).map(normalize);
        const cloudIds = new Set(cloudRows.map(r => r.id));
        const seen = new Set(cloudRows.map(keyOf));
        let legacyRows: any[] = [];
        try {
          const { data: legacyRow } = await supabase.from('system_settings').select('value').eq('key', table).maybeSingle();
          if (legacyRow?.value) {
            const parsed = JSON.parse(legacyRow.value);
            if (Array.isArray(parsed)) legacyRows = parsed;
          }
        } catch (e) { console.warn(`read legacy ${table} error`, e); }

        const pending: any[] = [];
        [...notDeleted(table, localRows), ...notDeleted(table, legacyRows)].forEach(r => {
          const k = keyOf(r);
          if (cloudIds.has(r.id) || seen.has(k)) return;
          seen.add(k);
          pending.push(r);
        });
        const merged = [...cloudRows, ...pending];
        setLocal(merged);
        localStorage.setItem(storageKey, JSON.stringify(merged));
        if (pending.length > 0) {
          const { error } = await supabase.from(table).upsert(pending, { onConflict });
          if (error) { console.warn(`migrate ${table} error:`, error.message); return; }
        }
        if (legacyRows.length > 0) {
          await supabase.from('system_settings').delete().eq('key', table);
        }
      };

      if (dailyTableOk) {
        await mergeCostTable('car_daily_costs', r => `${r.car_id}|${r.date}`, resDailyCosts, carDailyCosts, setCarDailyCosts, 'elbanna_car_daily_costs', 'car_id,date',
          r => ({ ...r, date: String(r.date).slice(0, 10), total_distance_km: num0(r.total_distance_km), freight_amount: num0(r.freight_amount), cards_amount: num0(r.cards_amount), violations_amount: num0(r.violations_amount), tire_wash_amount: num0(r.tire_wash_amount), maintenance_amount: num0(r.maintenance_amount), extra_costs: Array.isArray(r.extra_costs) ? r.extra_costs : [] }));
      }
      if (monthlyTableOk) {
        await mergeCostTable('car_monthly_costs', r => `${r.car_id}|${r.month}`, resMonthlyCosts, carMonthlyCosts, setCarMonthlyCosts, 'elbanna_car_monthly_costs', 'car_id,month',
          r => ({ ...r, driver_id: r.driver_id || undefined, salary_amount: num0(r.salary_amount), diesel_amount: num0(r.diesel_amount), oil_amount: num0(r.oil_amount) }));
      }
      if (fuelTableOk) {
        await mergeCostTable('fuel_logs', r => r.id, resFuelLogs, fuelLogs, setFuelLogs, 'elbanna_fuel_logs', 'id',
          r => ({ ...r, date: String(r.date).slice(0, 10), liters: num0(r.liters), price_per_liter: num0(r.price_per_liter), total_amount: num0(r.total_amount), odometer_km: r.odometer_km === null || r.odometer_km === undefined ? undefined : num0(r.odometer_km), driver_id: r.driver_id || undefined, note: r.note || undefined }));
      }
      if (plansTableOk) {
        await mergeCostTable('service_plans', r => r.id, resServicePlans, servicePlans, setServicePlans, 'elbanna_service_plans', 'id',
          r => ({ ...r, interval_km: num0(r.interval_km), last_done_km: r.last_done_km === null || r.last_done_km === undefined ? undefined : num0(r.last_done_km), last_done_date: r.last_done_date ? String(r.last_done_date).slice(0, 10) : undefined, note: r.note || undefined }));
      }

      // إعدادات النظام (من غير أي أسرار — كلمات السر والمستخدمين بقوا في Auth/profiles)، وقايمة المستخدمين من profiles
      try {
        refreshSystemUsers();
        const { data, error } = await supabase.from('system_settings').select('*');
        if (!error && data) {
          data.forEach(row => {
            if (row.key === 'companies' && row.value) {
              try {
                const parsed = JSON.parse(row.value);
                if (Array.isArray(parsed)) {
                  setCompanies(parsed);
                  localStorage.setItem('elbanna_companies', JSON.stringify(parsed));
                }
              } catch (e) {
                console.warn("Parse companies JSON error", e);
              }
            }
            if (row.key === 'hidden_companies' && row.value) {
              try {
                const parsed = JSON.parse(row.value);
                if (Array.isArray(parsed)) {
                  setHiddenCompanies(parsed);
                  localStorage.setItem('elbanna_hidden_companies', JSON.stringify(parsed));
                }
              } catch (e) {
                console.warn("Parse hidden_companies JSON error", e);
              }
            }
            if (row.key === 'farms' && row.value) {
              try {
                const parsed = JSON.parse(row.value);
                if (Array.isArray(parsed)) {
                  setFarms(parsed);
                  localStorage.setItem('elbanna_farms', JSON.stringify(parsed));
                }
              } catch (e) {
                console.warn("Parse farms JSON error", e);
              }
            }
            if (row.key === 'official_custom_screens' && row.value) {
              try {
                const parsed = JSON.parse(row.value);
                if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                  setOfficialCustomScreens(parsed);
                  localStorage.setItem('elbanna_official_custom_screens', JSON.stringify(parsed));
                }
              } catch (e) {
                console.warn("Parse official_custom_screens JSON error", e);
              }
            }
            if (row.key === 'default_garage_location' && row.value) {
              setDefaultGarageLocation(row.value);
              localStorage.setItem('elbanna_default_garage_location', row.value);
            }
            if (row.key === 'cost_item_types' && row.value) {
              try {
                const parsed = JSON.parse(row.value);
                if (Array.isArray(parsed)) {
                  setCostItemTypes(parsed);
                  localStorage.setItem('elbanna_cost_item_types', JSON.stringify(parsed));
                }
              } catch (e) {
                console.warn("Parse cost_item_types JSON error", e);
              }
            }
            if (row.key === 'vehicle_freight_rates' && row.value) {
              try {
                const parsed = JSON.parse(row.value);
                if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                  setVehicleFreightRates(parsed);
                  localStorage.setItem('elbanna_vehicle_freight_rates', JSON.stringify(parsed));
                }
              } catch (e) {
                console.warn("Parse vehicle_freight_rates JSON error", e);
              }
            }
            if (row.key === 'route_price_list' && row.value) {
              try {
                const parsed = JSON.parse(row.value);
                if (Array.isArray(parsed)) {
                  setRoutePriceList(parsed);
                  localStorage.setItem('elbanna_route_price_list', JSON.stringify(parsed));
                }
              } catch (e) {
                console.warn("Parse route_price_list JSON error", e);
              }
            }
            if (row.key === 'transport_request_costs' && row.value) {
              try {
                const parsed = JSON.parse(row.value);
                if (Array.isArray(parsed)) {
                  setTransportRequestCosts(parsed);
                  localStorage.setItem('elbanna_transport_request_costs', JSON.stringify(parsed));
                }
              } catch (e) {
                console.warn("Parse transport_request_costs JSON error", e);
              }
            }
            if (row.key === 'fuel_logs' && row.value && !fuelTableOk) {
              try { const parsed = JSON.parse(row.value); if (Array.isArray(parsed)) { setFuelLogs(parsed); localStorage.setItem('elbanna_fuel_logs', JSON.stringify(parsed)); } } catch (e) { console.warn("Parse fuel_logs JSON error", e); }
            }
            if (row.key === 'service_plans' && row.value && !plansTableOk) {
              try { const parsed = JSON.parse(row.value); if (Array.isArray(parsed)) { setServicePlans(parsed); localStorage.setItem('elbanna_service_plans', JSON.stringify(parsed)); } } catch (e) { console.warn("Parse service_plans JSON error", e); }
            }
            if (row.key === 'locked_months' && row.value) {
              try {
                const parsed = JSON.parse(row.value);
                if (Array.isArray(parsed)) {
                  setLockedMonths(parsed);
                  localStorage.setItem('elbanna_locked_months', JSON.stringify(parsed));
                }
              } catch (e) {
                console.warn("Parse locked_months JSON error", e);
              }
            }
            if (row.key === 'car_daily_costs' && row.value && !dailyTableOk) {
              try {
                const parsed = JSON.parse(row.value);
                if (Array.isArray(parsed)) {
                  setCarDailyCosts(parsed);
                  localStorage.setItem('elbanna_car_daily_costs', JSON.stringify(parsed));
                }
              } catch (e) {
                console.warn("Parse car_daily_costs JSON error", e);
              }
            }
            if (row.key === 'car_monthly_costs' && row.value && !monthlyTableOk) {
              try {
                const parsed = JSON.parse(row.value);
                if (Array.isArray(parsed)) {
                  setCarMonthlyCosts(parsed);
                  localStorage.setItem('elbanna_car_monthly_costs', JSON.stringify(parsed));
                }
              } catch (e) {
                console.warn("Parse car_monthly_costs JSON error", e);
              }
            }
            if (row.key === 'role_permissions' && row.value) {
              try {
                const parsed = JSON.parse(row.value);
                if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                  const merged = mergeNewDefaultScreens({ ...DEFAULT_ROLE_PERMISSIONS, ...parsed });
                  setRolePermissions(merged);
                  localStorage.setItem('elbanna_role_permissions', JSON.stringify(merged));
                }
              } catch (e) {
                console.warn("Parse role_permissions JSON error", e);
              }
            }
          });
        }
      } catch (settingsError) {
        console.warn("Supabase load system_settings exception:", settingsError);
      }

      setIsCloudConnected(true);
      setCloudError(null);
      
      const countsSummary = [
        `• السائقين: ${resDrivers.data?.length || 0} سائق`,
        `• السيارات: ${resCars.data?.length || 0} سيارة`,
        `• المسؤولين: ${resOfficials.data?.length || 0} مسؤول`,
        `• المخالفات: ${resViolations.data?.length || 0} مخالفة`,
        `• الفواتير والمصروفات: ${resInvoices.data?.length || 0} فاتورة`,
        `• بنود الفواتير التفصيلية: ${resItems.data?.length || 0} بند مصروف`,
        `• حركات كشوف حساب السائقين: ${resMovements.data?.length || 0} حركة حساب`,
        `• حركات العهد النقدية للمشرفين: ${resCustodyMovs.data?.length || 0} حركة عهدة`,
        `• طلبات النقل: ${resTransportRequests.data?.length || 0} طلب`,
        `• إعدادات وكلمات مرور المشرفين والأدمن: تم المزامنة والتحديث بنجاح ✔`
      ].join("\n");

      return { 
        success: true, 
        message: `تمت مزامنة واستيراد كافة البيانات بنجاح من قاعدة البيانات السحابية!\n\nتفاصيل البيانات المستوردة:\n${countsSummary}` 
      };
    } catch (e: any) {
      console.error("Supabase download exception:", e);
      setIsCloudConnected(false);
      setCloudError(e.message || "حدث خطأ غير متوقع أثناء الاتصال بالخادم سحابيًا.");
      return { success: false, message: `حدث خطأ بالاتصال: ${e.message}` };
    } finally {
      setIsCloudSyncing(false);
      isDownloadingRef.current = false;
    }
  };

  // Upload Current Local State to Cloud (Dumping / Syncing)
  // فحص دقة البيانات محليًا قبل الرفع للسحابة — بيرصد أي بيانات ناقصة أو متضاربة
  // يمكن تمنع رفع بعض السجلات (زي تكرار مخالفة بنفس السيارة والتاريخ) أو تكون غير دقيقة
  const validateLocalData = (): string[] => {
    const issues: string[] = [];
    const driverIds = new Set(drivers.map(d => d.id));
    const carNumbers = new Set(cars.map(c => (c.car_number || '').trim()).filter(Boolean));

    // السيارات: أرقام لوحات ناقصة
    const carsMissingNumber = cars.filter(c => !((c.car_number || '').trim()));
    if (carsMissingNumber.length > 0) {
      issues.push(`⚠️ يوجد ${carsMissingNumber.length} سيارة بدون رقم لوحة مسجل.`);
    }

    // المخالفات: تواريخ أو مبالغ ناقصة، سيارة أو سائق غير مرتبطين، وتكرار (سيارة + تاريخ)
    const violationsMissingDate = violations.filter(v => !((v.violation_date || '').trim()));
    if (violationsMissingDate.length > 0) {
      issues.push(`⚠️ يوجد ${violationsMissingDate.length} مخالفة بدون تاريخ مسجل (سيتم استخدام تاريخ افتراضي عند الرفع).`);
    }
    const violationsMissingAmount = violations.filter(v => !v.amount || v.amount <= 0);
    if (violationsMissingAmount.length > 0) {
      issues.push(`⚠️ يوجد ${violationsMissingAmount.length} مخالفة بمبلغ خصم صفر أو غير صحيح.`);
    }
    const violationsUnknownCar = violations.filter(v => v.car_number && !carNumbers.has(v.car_number.trim()));
    if (violationsUnknownCar.length > 0) {
      issues.push(`⚠️ يوجد ${violationsUnknownCar.length} مخالفة مرتبطة برقم سيارة غير مسجل في شاشة السيارات.`);
    }
    const violationsUnknownDriver = violations.filter(v => v.driver_id && !driverIds.has(v.driver_id));
    if (violationsUnknownDriver.length > 0) {
      issues.push(`⚠️ يوجد ${violationsUnknownDriver.length} مخالفة مرتبطة بسائق محذوف أو غير موجود.`);
    }
    const violationDupKeys = new Map<string, number>();
    violations.forEach(v => {
      const key = `${(v.car_number || '').trim()}|${(v.violation_date || '').trim()}`;
      violationDupKeys.set(key, (violationDupKeys.get(key) || 0) + 1);
    });
    const dupCount = [...violationDupKeys.values()].filter(c => c > 1).length;
    if (dupCount > 0) {
      issues.push(`🔴 يوجد ${dupCount} حالة تكرار (نفس السيارة + نفس تاريخ المخالفة) — هذا قد يمنع رفع المخالفات بسبب قيد unique_violation_date_car في السحابة. استخدم "كود الإصلاح السريع" بشاشة Supabase لإسقاط هذا القيد لو كان تكرار مخالفتين بنفس اليوم أمر طبيعي عندكم.`);
    }

    // حركات الخصم: سائق غير موجود، أو مبلغ خصم صفري
    const movementsUnknownDriver = movements.filter(m => m.driver_id && !driverIds.has(m.driver_id));
    if (movementsUnknownDriver.length > 0) {
      issues.push(`⚠️ يوجد ${movementsUnknownDriver.length} حركة خصم/رصيد مرتبطة بسائق محذوف أو غير موجود.`);
    }
    const movementsZeroAmount = movements.filter(m => !m.amount_change);
    if (movementsZeroAmount.length > 0) {
      issues.push(`⚠️ يوجد ${movementsZeroAmount.length} حركة خصم بقيمة صفر.`);
    }

    return issues;
  };

  // نسخة تفصيلية ومُجهّزة للمعالجة التفاعلية — بترجع مجموعات فعلية (مش عدد بس)
  // عشان شاشة "معالجة مشاكل البيانات" تقدر تعرض كل حالة وتوفر إجراء لحلها
  const getDataIssuesDetail = () => {
    const driverIds = new Set(drivers.map(d => d.id));
    const carNumbers = new Set(cars.map(c => (c.car_number || '').trim()).filter(Boolean));

    // مجموعات المخالفات المرتبطة برقم سيارة غير مسجل، مجمّعة حسب رقم السيارة
    const unknownCarGroups = new Map<string, Violation[]>();
    violations.forEach(v => {
      const num = (v.car_number || '').trim();
      if (num && !carNumbers.has(num)) {
        if (!unknownCarGroups.has(num)) unknownCarGroups.set(num, []);
        unknownCarGroups.get(num)!.push(v);
      }
    });

    const orphanedDriverViolations = violations.filter(v => v.driver_id && !driverIds.has(v.driver_id));

    const dupGroupsMap = new Map<string, Violation[]>();
    violations.forEach(v => {
      const key = `${(v.car_number || '').trim()}|${(v.violation_date || '').trim()}`;
      if (!dupGroupsMap.has(key)) dupGroupsMap.set(key, []);
      dupGroupsMap.get(key)!.push(v);
    });
    const duplicateGroups = [...dupGroupsMap.values()].filter(g => g.length > 1);

    return {
      unknownCarGroups: [...unknownCarGroups.entries()].map(([car_number, items]) => ({ car_number, items })),
      orphanedDriverViolations,
      duplicateGroups
    };
  };

  // تحديث بيانات مخالفة موجودة (مثال: إعادة ربطها بسائق صحيح بعد ما كانت مرتبطة بسائق محذوف)
  const updateViolation = (id: string, updatedFields: Partial<Violation>) => {
    setViolations(prev => prev.map(v => v.id === id ? { ...v, ...updatedFields } : v));

    const supabase = getSupabaseClient();
    if (supabase && isCloudConnected) {
      supabase.from('violations').update(updatedFields).eq('id', id).then(({ error }) => {
        if (error) console.error("Supabase update violation error:", error);
      });
    }
  };

  // إعادة ربط كل المخالفات المسجلة برقم سيارة معين (غير مسجل) لرقم سيارة آخر دفعة واحدة
  // مفيد لما يكون رقم السيارة بالمخالفات مكتوب بصيغة مختلفة عن رقم نفس السيارة المسجل بشاشة السيارات
  const remapViolationsCarNumber = (oldCarNumber: string, newCarNumber: string) => {
    setViolations(prev => prev.map(v => v.car_number === oldCarNumber ? { ...v, car_number: newCarNumber } : v));

    const supabase = getSupabaseClient();
    if (supabase && isCloudConnected) {
      supabase.from('violations').update({ car_number: newCarNumber }).eq('car_number', oldCarNumber).then(({ error }) => {
        if (error) console.error("Supabase remap violations car_number error:", error);
      });
    }
  };

  const uploadLocalDataToCloud = async (): Promise<{ success: boolean; message: string }> => {
    const supabase = getSupabaseClient();
    if (!supabase) {
      return { success: false, message: "قاعدة البيانات السحابية Supabase غير مجهزة أو المفاتيح غير صالحة." };
    }

    const sanitizeDateStr = (d: any, defaultFallback: string): string => {
      if (!d || typeof d !== "string" || d.trim() === "0" || d.trim() === "") {
        return defaultFallback;
      }
      const trimmed = d.trim();
      const valParsed = Date.parse(trimmed);
      if (isNaN(valParsed)) {
        return defaultFallback;
      }
      try {
        const dateObj = new Date(trimmed);
        const yr = dateObj.getFullYear();
        if (yr < 1900 || yr > 2100) {
          return defaultFallback;
        }
        return dateObj.toISOString().split('T')[0];
      } catch (e) {
        return defaultFallback;
      }
    };

    const sanitizeTimestampStr = (t: any): string => {
      if (!t || typeof t !== "string" || t.trim() === "0" || t.trim() === "") {
        return new Date().toISOString();
      }
      const valParsed = Date.parse(t.trim());
      if (isNaN(valParsed)) {
        return new Date().toISOString();
      }
      try {
        const dateObj = new Date(t.trim());
        const yr = dateObj.getFullYear();
        if (yr < 1900 || yr > 2100) {
          return new Date().toISOString();
        }
        return dateObj.toISOString();
      } catch (e) {
        return new Date().toISOString();
      }
    };

    setIsCloudSyncing(true);
    setCloudError(null);

    try {
      const processedNatIds = new Set<string>();
      const processedCodes = new Set<string>();
      const sanitizedDrivers = notDeleted('drivers', drivers).map((d, index) => {
        let natId = (d.national_id || "").trim();
        let code = (d.driver_code || "").trim();

        const isPlaceholder = natId === "" || natId === "0" || natId.includes("لا") || natId.includes("بدون") || natId.includes("00") || natId.length < 6;
        if (isPlaceholder || processedNatIds.has(natId)) {
          // Generate a safe unique 14-character national ID
          const cleanId = d.id.replace(/[^0-9]/g, '');
          const safeDigits = (cleanId + "123456789").slice(0, 7);
          natId = `900${index}${safeDigits}`.slice(0, 14);
        }
        processedNatIds.add(natId);

        const isCodeInvalid = code === "" || code === "0" || processedCodes.has(code);
        if (isCodeInvalid) {
          const suffix = d.id.replace(/[^a-zA-Z0-9]/g, '').slice(-4);
          code = `DRV-${index}-${suffix}`.slice(0, 20);
        }
        processedCodes.add(code);

        return {
          ...d,
          driver_code: code,
          national_id: natId,
          license_end_date: sanitizeDateStr(d.license_end_date, "2026-12-31")
        };
      });

      const processedCarNumbers = new Set<string>();
      const processedChassisNumbers = new Set<string>();
      const sanitizedCars = notDeleted('cars', cars).map((c, index) => {
        let carNum = (c.car_number || "").trim();
        let chassis = (c.chassis_number || "").trim();

        const isCarNumInvalid = carNum === "" || processedCarNumbers.has(carNum);
        if (isCarNumInvalid) {
          carNum = `CAR-GEN-${index}`.slice(0, 20);
        }
        processedCarNumbers.add(carNum);

        const isChassisInvalid = chassis === "" || chassis === "0" || chassis.includes("لا") || processedChassisNumbers.has(chassis);
        if (isChassisInvalid) {
          const suffix = c.id.replace(/[^a-zA-Z0-9]/g, '').slice(-6);
          chassis = `CH-${index}-${suffix}`.slice(0, 50);
        }
        processedChassisNumbers.add(chassis);

        return {
          ...c,
          car_number: carNum,
          chassis_number: chassis,
          license_end_date: sanitizeDateStr(c.license_end_date, "2026-12-31")
        };
      });

      const sanitizedViolations = notDeleted('violations', violations).map(v => ({
        ...v,
        violation_date: sanitizeDateStr(v.violation_date, "2026-06-07")
      }));

      const processedInvoiceNumbers = new Set<string>();
      const sanitizedInvoices = notDeleted('invoices', invoices).map((inv, index) => {
        let invNum = (inv.invoice_number || "").trim();
        if (invNum === "" || processedInvoiceNumbers.has(invNum)) {
          invNum = `INV-GEN-${Date.now()}-${index}`.slice(0, 30);
        }
        processedInvoiceNumbers.add(invNum);

        return {
          ...inv,
          invoice_number: invNum,
          approval_status: inv.approval_status || 'approved',
          invoice_date: sanitizeDateStr(inv.invoice_date, "2026-06-07"),
          // لو الفاتورة مرتبطة بسيارة اتحذفت، نفك الربط (زي ON DELETE SET NULL) بدل ما الرفع كله يفشل
          car_id: (inv.car_id && sanitizedCars.some(c => c.id === inv.car_id)) ? inv.car_id : (null as any)
        };
      });
      const uploadedInvoiceIds = new Set(sanitizedInvoices.map(i => i.id));

      const sanitizedAuditLogs = auditLogs.map(l => ({
        ...l,
        timestamp: sanitizeTimestampStr(l.timestamp)
      }));

      const sanitizedMovements = notDeleted('driver_account_movements', movements).map(cm => ({
        ...cm,
        date: sanitizeDateStr(cm.date, "2026-06-07")
      }));

      const sanitizedCustodyMovements = notDeleted('custody_movements', custodyMovements).map(m => ({
        ...m,
        date: sanitizeDateStr(m.date, "2026-06-07")
      }));

      const sanitizedTransportRequests = notDeleted('transport_requests', transportRequests).map(r => ({
        ...r,
        request_date: sanitizeDateStr(r.request_date, "2026-06-07")
      }));

      // رفع متسلسل بترتيب الاعتماديات (المسؤولين ← السائقين ← السيارات ...) لتفادي أخطاء المفاتيح الأجنبية
      const uploadSteps: Array<[string, any[]]> = [
        ['officials', notDeleted('officials', officials)],
        ['drivers', sanitizedDrivers],
        ['cars', sanitizedCars],
        ['violations', sanitizedViolations],
        ['invoices', sanitizedInvoices],
        ['invoice_items', notDeleted('invoice_items', invoiceItems).filter(i => uploadedInvoiceIds.has(i.invoice_id))],
        ['invoice_audit_logs', sanitizedAuditLogs],
        ['driver_account_movements', sanitizedMovements],
        ['custody_accounts', notDeleted('custody_accounts', custodyAccounts)],
        ['custody_movements', sanitizedCustodyMovements]
      ];
      const errors: any[] = [];
      const failedRows: string[] = [];
      // لو صف واحد خالف قيد (تكرار/ربط مكسور) بنقسم الدفعة لنصين لحد ما نعزل الصف المعطوب ونرفع الباقي
      const upsertSalvage = async (table: string, rows: any[]): Promise<void> => {
        const { error } = await supabase.from(table).upsert(rows);
        if (!error) return;
        // أعمدة سبب الإرجاع لسه ماتضافتش في Supabase: نرفع الفواتير من غيرها بدل ما الرفع كله يفشل
        if (error.code === 'PGRST204' && table === 'invoices') {
          const stripped = rows.map((r: any) => { const { return_reason, returned_by, returned_at, ...rest } = r; return rest; });
          const retry = await supabase.from(table).upsert(stripped);
          if (!retry.error) return;
        }
        const isConstraint = error.code === '23505' || error.code === '23503';
        if (!isConstraint) { errors.push(error); return; }
        if (rows.length === 1) {
          const r = rows[0];
          failedRows.push(`${table} (${r.invoice_number || r.car_number || r.driver_code || r.id}): ${error.message}`);
          errors.push(error);
          return;
        }
        const mid = Math.ceil(rows.length / 2);
        await upsertSalvage(table, rows.slice(0, mid));
        await upsertSalvage(table, rows.slice(mid));
      };
      for (const [table, rows] of uploadSteps) {
        if (!rows || rows.length === 0) continue;
        await upsertSalvage(table, rows);
      }

      // رفع طلبات النقل بشكل منفصل ومتسامح: لو الجدول غير منشأ بعد على مشروع قديم، منمنعش باقي المزامنة
      if (sanitizedTransportRequests.length > 0) {
        try {
          const { error } = await upsertTransportRows(supabase, sanitizedTransportRequests);
          if (error && !error.message?.includes("does not exist") && !error.message?.includes("schema cache")) {
            console.warn("Supabase upload transport_requests error:", error);
          }
        } catch (e) {
          console.warn("Supabase upload transport_requests exception:", e);
        }
      }

      // إعدادات النظام وكلمات المرور بتتحفظ دايمًا حتى لو جدول بيانات فشل رفعه
      // Safe separate background save for administrative credentials / system settings
      try {
        const settingsToUpsert = [
          { key: 'companies', value: JSON.stringify(companies) },
          { key: 'hidden_companies', value: JSON.stringify(hiddenCompanies) },
          { key: 'farms', value: JSON.stringify(farms) },
          { key: 'deleted_ids', value: JSON.stringify(tombstonesRef.current) }
        ];
        await supabase.from('system_settings').upsert(settingsToUpsert);
      } catch (settingsUpsertError) {
        console.warn("Supabase upsert system_settings error:", settingsUpsertError);
      }

      if (errors.length > 0) {
        console.error("Supabase upload error:", errors);
        if (failedRows.length > 0) {
          console.error("Rows that failed to upload:", failedRows);
          return {
            success: false,
            message: `تم رفع باقي البيانات، لكن ${failedRows.length} سجل رفضته قاعدة البيانات:\n` + failedRows.slice(0, 5).join('\n')
          };
        }
        const err = errors[0]!;
        const uploadErrMsg = err.message || "";
        
        if (
          err.message?.includes("unique_violation_date_car") ||
          err.message?.toLowerCase().includes("violates unique constraint")
        ) {
          return {
            success: false,
            message: "فشل الرفع السحابي بسبب قيد منع التكرار للمخالفات (unique_violation_date_car) على قاعدة بيانات Supabase. لحل هذه المشكلة فورًا، يُرجى فتح شاشة 'محرر ومراقب Supabase' وضغط زر 'نسخ كود الإصلاح السريع' للصقه وتشغيله في الـ SQL Editor بـ Supabase لإسقاط هذا القيد وتسهيل المزامنة التامة."
          };
        }
        
        // Check for missing columns (error code 42703 or "column ... does not exist" message)
        if (err.code === "42703" || (uploadErrMsg.includes("column") && uploadErrMsg.includes("does not exist"))) {
          const customMsg = "تنبيه قاعدة البيانات السحابية: يوجد حقل مفقود بجدول السيارات (traffic_office) في مشروع Supabase الخاص بك. لحل هذه المشكلة فورًا لتبسيط الاتصال وعرض جميع بيانات الجداول، يرجى التوجه إلى SQL Editor في Supabase وتشغيل الكود التالي:\n\nALTER TABLE cars ADD COLUMN IF NOT EXISTS traffic_office VARCHAR(100);";
          return { success: false, message: customMsg };
        }
        
        if (
          (uploadErrMsg.includes("relation") && uploadErrMsg.includes("does not exist")) || 
          uploadErrMsg.includes("Could not find the table") || 
          uploadErrMsg.includes("schema cache") ||
          err.code === "P0001" || 
          err.code === "42P01"
        ) {
          return { 
            success: false, 
            message: "الخادم السحابي متصل بنجاح، ولكن الجداول غير منشأة بالخلفية بعد! يرجى الضغط على زر 'محرر ومراقب Supabase' ونسخ كود الـ SQL الموحد ولصقه في الـ SQL Editor بـ Supabase لتهيئة الجداول." 
          };
        }
        return { success: false, message: `فشل الرفع السحابي: ${err.message}` };
      }

      setIsCloudConnected(true);
      return { success: true, message: "تم رفع وتصدير كافة البيانات من هذا الجهاز إلى قاعدة البيانات السحابية بنجاح 100%!" };
    } catch (e: any) {
      console.error("Supabase bulk upload exception:", e);
      return { success: false, message: `حدث خطأ استثنائي أثناء الرفع: ${e.message}` };
    } finally {
      setIsCloudSyncing(false);
    }
  };

  // Quick Connection Tester
  const testCloudConnection = async (): Promise<{ success: boolean; message: string }> => {
    const supabase = getSupabaseClient();
    if (!supabase) {
      setIsCloudConnected(false);
      return { success: false, message: "مفاتيح الربط السحابية غير مهيأة. يرجى إدخالها أولاً!" };
    }

    try {
      const { error } = await supabase.from('drivers').select('id', { count: 'exact', head: true });
      if (error) {
        if (
          error.message?.includes("does not exist") || 
          error.message?.includes("Could not find the table") || 
          error.message?.includes("schema cache") ||
          error.code === "P0001" || 
          error.code === "42P01"
        ) {
          setIsCloudConnected(true);
          return { success: true, message: "مؤهل سحابيًا! تم الاتصال بالخادم السحابي لـ Supabase بنجاح، ولكن الجداول لم تسجل بالخلفية بعد. يرجى تهيئتها بنسخ كود الـ SQL الموحد." };
        }
        setIsCloudConnected(false);
        return { success: false, message: `فشل التحقق من الاتصال: ${error.message}` };
      }
      setIsCloudConnected(true);
      setCloudError(null);
      return { success: true, message: "الخادم السحابي متقن وجاهز للتشغيل المشترك!" };
    } catch (e: any) {
      setIsCloudConnected(false);
      return { success: false, message: `خطأ اتصال: ${e.message}` };
    }
  };

  // تنظيف البيانات الوهمية وتنزيل السحابة عند الفتح
  useEffect(() => {
    cleanupMockData();
  }, []);

  // تنزيل السحابة بعد تسجيل الدخول (الجداول مقفولة بـ RLS قبله) — وعند فتح التطبيق لو فيه جلسة محفوظة
  const syncedForUserRef = useRef<string | null>(null);
  useEffect(() => {
    const uid = currentUser ? (currentUser.systemUserId || currentUser.username) : null;
    if (!uid) { syncedForUserRef.current = null; return; }
    if (syncedForUserRef.current === uid) return;
    syncedForUserRef.current = uid;
    if (getSupabaseClient()) downloadCloudDataToLocal();
  }, [currentUser]);

  // مزامنة خفيفة لطلبات النقل: سحب من السحابة كل 15 ثانية وعند رجوع الشاشة للواجهة، ورفع أي طلب محلي ناقص
  // (عشان طلب اتسجل من تطبيق الموبايل يظهر في الموقع من غير ريفرش، والعكس)
  const transportRequestsRef = useRef(transportRequests);
  transportRequestsRef.current = transportRequests;
  useEffect(() => {
    const client = getSupabaseClient();
    if (!client) return;
    let busy = false;
    const sync = async () => {
      if (busy || !currentUserRef.current || isDownloadingRef.current || document.visibilityState === 'hidden') return;
      busy = true;
      try {
        const { data, error } = await client.from('transport_requests').select('*').order('request_number', { ascending: false });
        if (error || !data) return;
        const cloudIds = new Set(data.map((r: any) => r.id));
        const cloudRows = notDeleted('transport_requests', data as any[]);
        let localOnly: any[] = notDeleted('transport_requests', transportRequestsRef.current).filter(r => !cloudIds.has(r.id));
        // تعارض رقم الطلب: جهازين ولّدوا نفس الرقم (مثلًا 2610-0002) — نعيد ترقيم الطلب المحلي برقم متاح
        const takenNumbers = new Set<string>((data as any[]).map(r => r.request_number));
        const maxSeqFor = (prefix: string) => {
          let m = 0;
          [...(data as any[]), ...localOnly].forEach(r => {
            const parts = String(r.request_number || '').split('-');
            if (parts[0] === prefix) { const n = parseInt(parts[1] || '0', 10); if (!isNaN(n) && n > m) m = n; }
          });
          return m;
        };
        localOnly = localOnly.map(r => {
          if (!takenNumbers.has(r.request_number)) { takenNumbers.add(r.request_number); return r; }
          const prefix = String(r.request_number || '').split('-')[0] || '0000';
          const next = `${prefix}-${String(maxSeqFor(prefix) + 1).padStart(4, '0')}`;
          takenNumbers.add(next);
          return { ...r, request_number: next };
        });
        if (localOnly.length > 0) {
          const { error: upErr } = await upsertTransportRows(client, localOnly as any[]);
          if (upErr) setCloudError(`تعذر رفع الطلبات للسحابة: ${upErr.message}`);
        }
        const merged = [...cloudRows, ...localOnly].map((r: any) => normalizeTransportRequest(r));
        const sameShape = JSON.stringify([...merged].sort((a: any, b: any) => a.id.localeCompare(b.id))) ===
          JSON.stringify([...transportRequestsRef.current].sort((a: any, b: any) => a.id.localeCompare(b.id)));
        if (!sameShape) setTransportRequests(merged as any);
      } catch (e) {
        console.warn('transport_requests sync failed', e);
      } finally {
        busy = false;
      }
    };
    const timer = setInterval(sync, 15000);
    const onVisible = () => { if (document.visibilityState === 'visible') sync(); };
    document.addEventListener('visibilitychange', onVisible);
    sync();
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); };
  }, []);

  // RESET STORE TO INITIAL
  const resetToInitial = () => {
    setDrivers(INITIAL_DRIVERS);
    setOfficials(INITIAL_OFFICIALS);
    setCars(INITIAL_CARS);
    setViolations(INITIAL_VIOLATIONS);
    setInvoices(INITIAL_INVOICES);
    setInvoiceItems(INITIAL_INVOICE_ITEMS);
    setAuditLogs(INITIAL_AUDIT_LOGS);
    setMovements(INITIAL_ACCOUNT_MOVEMENTS);
    setCustodyAccounts([
      { id: "ca_1_1", official_id: "1", name: "نقدي كاش رئيسي", type: 'cash', balance: 50000 },
      { id: "ca_1_2", official_id: "1", name: "فيزا بنك مصر (025)", type: 'visa', balance: 40000 },
      { id: "ca_1_3", official_id: "1", name: "فيزا الائتمان الرئيسي (114)", type: 'other_visa', balance: 60000 },
      { id: "ca_2_1", official_id: "2", name: "نقدي كاش فرعي", type: 'cash', balance: 25000 },
      { id: "ca_2_2", official_id: "2", name: "فيزا البريد المصري", type: 'visa', balance: 40000 },
      { id: "ca_3_1", official_id: "3", name: "نقدي كاش يدوي", type: 'cash', balance: 15000 },
      { id: "ca_3_2", official_id: "3", name: "فيزا البنك الأهلي تراخيص", type: 'visa', balance: 20000 }
    ]);
    setCustodyMovements([]);
    setTransportRequests([]);
    setFarms([]);
    localStorage.removeItem('elbanna_transport_requests');
    localStorage.removeItem('elbanna_farms');
    localStorage.removeItem('elbanna_drivers');
    localStorage.removeItem('elbanna_officials');
    localStorage.removeItem('elbanna_cars');
    localStorage.removeItem('elbanna_violations');
    localStorage.removeItem('elbanna_invoices');
    localStorage.removeItem('elbanna_invoice_items');
    localStorage.removeItem('elbanna_audit_logs');
    localStorage.removeItem('elbanna_movements');
    localStorage.removeItem('elbanna_custody_accounts');
    localStorage.removeItem('elbanna_custody_movements');

    // Wipe Supabase too if desired
    const supabase = getSupabaseClient();
    if (supabase && isCloudConnected) {
      Promise.all([
        supabase.from('drivers').delete().neq('id', 'WIPE_ALL'),
        supabase.from('officials').delete().neq('id', 'WIPE_ALL'),
        supabase.from('cars').delete().neq('id', 'WIPE_ALL'),
        supabase.from('violations').delete().neq('id', 'WIPE_ALL'),
        supabase.from('invoices').delete().neq('id', 'WIPE_ALL'),
        supabase.from('invoice_items').delete().neq('id', 'WIPE_ALL'),
        supabase.from('invoice_audit_logs').delete().neq('id', 'WIPE_ALL'),
        supabase.from('driver_account_movements').delete().neq('id', 'WIPE_ALL'),
        supabase.from('custody_accounts').delete().neq('id', 'WIPE_ALL'),
        supabase.from('custody_movements').delete().neq('id', 'WIPE_ALL'),
        supabase.from('transport_requests').delete().neq('id', 'WIPE_ALL')
      ]).catch(e => console.error("Wiped supabase on reset table error:", e));
    }
  };

  // Generators compliant with UUID constraints
  // Transport Requests action definitions (طلبات النقل)
  const generateRequestNumber = (): string => {
    const now = new Date();
    const yy = String(now.getFullYear()).slice(-2);
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const prefix = `${yy}${mm}`;
    const sameMonthRequests = transportRequests.filter(r => (r.request_number || '').startsWith(prefix + '-'));
    let maxSeq = 0;
    sameMonthRequests.forEach(r => {
      const parts = (r.request_number || '').split('-');
      const seq = parseInt(parts[1] || '0', 10);
      if (!isNaN(seq) && seq > maxSeq) maxSeq = seq;
    });
    const nextSeq = String(maxSeq + 1).padStart(4, '0');
    return `${prefix}-${nextSeq}`;
  };

  // أعمدة رحلة السائق — لو لسه ماتضافتش في Supabase منوقفش باقي الحفظ، بنبعت من غيرها وننبّه المستخدم
  const TRIP_COLS = ['trip_status', 'trip_leg', 'trip_log', 'finish_odometer', 'expected_smoke'];
  const tripColsHint = 'أعمدة رحلة السائق مش موجودة في قاعدة البيانات السحابية. شغّل سكريبت transport-trip.sql (أو انسخ مخطط الجداول من شاشة الاتصال السحابي) مرة واحدة في Supabase SQL Editor عشان حالة الرحلة توصل لتطبيق السائق وباقي الأجهزة.';
  const mentionsTripCol = (msg?: string) => TRIP_COLS.some(c => new RegExp(c).test(msg || ''));
  const stripTripCols = (row: any) => { const out = { ...row }; TRIP_COLS.forEach(c => delete out[c]); return out; };
  const upsertTransportRows = async (client: any, rows: any[]) => {
    let res = await client.from('transport_requests').upsert(rows);
    if (res.error && mentionsTripCol(res.error.message)) {
      setCloudError(tripColsHint);
      res = await client.from('transport_requests').upsert(rows.map(stripTripCols));
    }
    return res;
  };

  const addTransportRequest = (data: {
    requester_name: string;
    farm_name: string;
    destinations: string[];
    car_type: string;
    cargo_description: string;
    request_date: string;
  }): TransportRequest => {
    const newId = generateId("tr");
    const newRequest: TransportRequest = {
      id: newId,
      request_number: generateRequestNumber(),
      requester_name: data.requester_name.trim(),
      farm_name: data.farm_name.trim(),
      destinations: (data.destinations || []).map(d => d.trim()).filter(Boolean),
      car_type: data.car_type.trim(),
      cargo_description: data.cargo_description.trim(),
      request_date: normalizeDateToYmd(data.request_date),
      status: 'new',
      created_by: currentUser?.name || currentUser?.username
    };
    setTransportRequests(prev => [...prev, newRequest]);
    notifyEvent(transportNotification('created', newRequest));
    addFarmIfNew(newRequest.farm_name);
    newRequest.destinations.forEach(d => addFarmIfNew(d));

    const supabase = getSupabaseClient();
    if (supabase) {
      upsertTransportRows(supabase, [newRequest]).then(({ error }) => {
        if (error) { console.error("Supabase insert transport_request error:", error); setCloudError(`تعذر رفع الطلب للسحابة: ${error.message}`); }
      });
    }
    return newRequest;
  };

  const updateTransportRequest = (id: string, updatedFields: Partial<TransportRequest>) => {
    setTransportRequests(prev => prev.map(r => r.id === id ? { ...r, ...updatedFields } : r));

    const supabase = getSupabaseClient();
    if (supabase) {
      const send = (payload: any, stripped: boolean) => {
        supabase.from('transport_requests').update(payload).eq('id', id).then(({ error }) => {
          if (!error) return;
          if (!stripped && mentionsTripCol(error.message)) {
            setCloudError(tripColsHint);
            const rest = stripTripCols(payload);
            if (Object.keys(rest).length > 0) send(rest, true);
            return;
          }
          console.error("Supabase update transport_request error:", error);
          setCloudError(`تعذر تحديث الطلب في السحابة: ${error.message}`);
        });
      };
      send(updatedFields, false);
    }
  };

  const deleteTransportRequest = (id: string) => {
    setTransportRequests(prev => prev.filter(r => r.id !== id));
    // تنضيف سجل تكلفة خط السير المرتبط بالطلب المحذوف ده (لو موجود) عشان ميفضلش يتيم بلا فايدة
    if (transportRequestCosts.some(c => c.request_id === id)) {
      persistTransportRequestCosts(transportRequestCosts.filter(c => c.request_id !== id));
    }

    const supabase = getSupabaseClient();
    if (supabase) {
      supabase.from('transport_requests').delete().eq('id', id).then(({ error }) => {
        if (error) console.error("Supabase delete transport_request error:", error);
      });
    }
  };

  // ====== قسم الصيانة — طلبات الصيانة وفواتيرها ======

  const generateMaintenanceRequestNumber = (): string => {
    const now = new Date();
    const yy = String(now.getFullYear()).slice(-2);
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const prefix = `MT-${yy}${mm}`;
    const sameMonth = maintenanceRequests.filter(r => (r.request_number || '').startsWith(prefix + '-'));
    let maxSeq = 0;
    sameMonth.forEach(r => {
      const seq = parseInt((r.request_number || '').split('-')[2] || '0', 10);
      if (!isNaN(seq) && seq > maxSeq) maxSeq = seq;
    });
    return `${prefix}-${String(maxSeq + 1).padStart(3, '0')}`;
  };

  const generateMaintenanceInvoiceNumber = (): string => {
    const now = new Date();
    const yy = String(now.getFullYear()).slice(-2);
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const prefix = `MINV-${yy}${mm}`;
    const sameMonth = maintenanceInvoices.filter(i => (i.invoice_number || '').startsWith(prefix + '-'));
    let maxSeq = 0;
    sameMonth.forEach(i => {
      const seq = parseInt((i.invoice_number || '').split('-')[2] || '0', 10);
      if (!isNaN(seq) && seq > maxSeq) maxSeq = seq;
    });
    return `${prefix}-${String(maxSeq + 1).padStart(3, '0')}`;
  };

  // إنشاء طلب صيانة جديد — مربوط بـ car_id من قاعدة بيانات السيارات الحالية (بدون أي تكرار لبياناتها)
  const addMaintenanceRequest = (data: {
    car_id: string;
    fault_description: string;
    request_date: string;
  }): MaintenanceRequest => {
    const newRequest: MaintenanceRequest = {
      id: generateId('mnt'),
      request_number: generateMaintenanceRequestNumber(),
      car_id: data.car_id,
      fault_description: data.fault_description.trim(),
      workshop_type: 'company', // بيتحدد لاحقًا من مدير الصيانة عند التوجيه للورشة
      request_date: normalizeDateToYmd(data.request_date),
      status: 'new',
      parts: [],
      work_performed: '',
      created_by: currentUser?.name || currentUser?.username,
      stage_history: [{ status: 'new', at: new Date().toISOString(), by: currentUser?.name || currentUser?.username, kind: 'create' }],
    };
    setMaintenanceRequests(prev => [...prev, newRequest]);
    notifyEvent(maintenanceNotification('new', newRequest, cars.find(c => c.id === newRequest.car_id)?.car_number || ''));

    const supabase = getSupabaseClient();
    if (supabase && isCloudConnected) {
      supabase.from('maintenance_requests').insert([newRequest]).then(async (res) => {
        let error = res.error;
        if (error && /stage_history/.test(error.message || '')) {
          // عمود سجل المراحل لسه ماتضافش في Supabase: نحفظ الطلب من غيره
          const { stage_history: _sh, ...legacyPayload } = newRequest;
          error = (await supabase.from('maintenance_requests').insert([legacyPayload])).error;
        }
        if (error) {
          console.error("Supabase insert maintenance_request error:", error);
          // طلب الصيانة ده هيفضل ظاهر على الجهاز ده بس (محفوظ محليًا) ومش هيتزامن مع باقي
          // الأجهزة لحد ما تتصلح المشكلة — لازم تنبيه واضح بدل ما يفشل بصمت وتختلف البيانات
          // بين الأجهزة من غير ما حد يلاحظ
          alert(`تنبيه: تم حفظ طلب الصيانة على هذا الجهاز فقط، وفشل حفظه في قاعدة البيانات السحابية بسبب: ${error.message}\nمعنى ده إن الطلب مش هيظهر على باقي الأجهزة لحد ما تتصلح المشكلة. على الأغلب السبب إن جدول "maintenance_requests" لسه مش منشأ في قاعدة البيانات — افتح شاشة "الاتصال السحابي"، انسخ "مخطط إنشاء الجداول (SQL Schema)" بالكامل، وشغّله مرة واحدة في SQL Editor بتاع Supabase.`);
        }
      });
    }
    return newRequest;
  };

  // تحديث عام لطلب الصيانة — بيحافظ على كل البيانات السابقة (الحالة، القطع، الأعمال المنفذة...)
  // ولا يصفّر أي حاجة إلا المرسلة فعليًا في updatedFields، حسب قاعدة "عدم الكتابة فوق البيانات السابقة"
  // أي تغيير في حالة الطلب بيتسجل تلقائيًا في سجل المراحل (_note/_kind اختياريين: سبب الإرجاع ونوع الحركة)
  const updateMaintenanceRequest = (id: string, updatedFields: Partial<MaintenanceRequest> & { _note?: string; _kind?: 'advance' | 'return' }) => {
    const { _note, _kind, ...fields } = updatedFields as any;
    const existing = maintenanceRequests.find(r => r.id === id);
    let patch: Partial<MaintenanceRequest> = fields;
    if (existing && fields.status && fields.status !== existing.status) {
      const entry = {
        status: fields.status,
        at: new Date().toISOString(),
        by: currentUser?.name || currentUser?.username,
        kind: (_kind || 'advance') as 'advance' | 'return',
        ...(_note ? { note: _note } : {}),
      };
      patch = { ...fields, stage_history: [...(existing.stage_history || []), entry] };
    }
    setMaintenanceRequests(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r));
    if (existing && fields.status && fields.status !== existing.status) {
      notifyEvent(maintenanceNotification(fields.status, { ...existing, ...patch }, cars.find(c => c.id === existing.car_id)?.car_number || ''));
    }

    const supabase = getSupabaseClient();
    if (supabase && isCloudConnected) {
      const OPTIONAL_COLS = ['stage_history', 'odometer', 'km_since_last', 'purchase_invoice_image'];
      const send = (payload: any, stripped: string[]) => {
        supabase.from('maintenance_requests').update(payload).eq('id', id).then(({ error }) => {
          if (!error) return;
          // لو عمود جديد لسه ماتضافش في Supabase، نبعت باقي التغييرات من غيره بدل ما الحالة نفسها تفشل
          const missing = OPTIONAL_COLS.find(c => c in payload && !stripped.includes(c) && new RegExp(c).test(error.message || ''));
          if (missing) {
            const { [missing]: _drop, ...rest } = payload;
            if (Object.keys(rest).length > 0) send(rest, [...stripped, missing]);
            if (missing !== 'stage_history') alert(`تنبيه: تم الحفظ على الجهاز، لكن عمود "${missing}" مش موجود في قاعدة البيانات السحابية. شغّل سكريبت الصيانة الجديد (maintenance-workflow.sql) مرة واحدة في Supabase SQL Editor.`);
            return;
          }
          console.error("Supabase update maintenance_request error:", error);
          if (/status|check constraint|violates/i.test(error.message || '')) {
            alert(`تنبيه: تم تحديث حالة الطلب على الجهاز ده بس. قاعدة البيانات السحابية رفضت الحالة الجديدة (${error.message}). شغّل سكريبت الصيانة الجديد (maintenance-workflow.sql) مرة واحدة في Supabase SQL Editor.`);
          }
        });
      };
      send(patch, []);
    }
  };

  const addMaintenancePart = (requestId: string, part: Omit<MaintenancePartItem, 'id'>) => {
    const req = maintenanceRequests.find(r => r.id === requestId);
    if (!req) return;
    const newPart: MaintenancePartItem = { ...part, id: generateId('part') };
    updateMaintenanceRequest(requestId, { parts: [...(req.parts || []), newPart] });
  };

  const deleteMaintenancePart = (requestId: string, partId: string) => {
    const req = maintenanceRequests.find(r => r.id === requestId);
    if (!req) return;
    updateMaintenanceRequest(requestId, { parts: (req.parts || []).filter(p => p.id !== partId) });
  };

  const deleteMaintenanceRequest = (id: string) => {
    setMaintenanceRequests(prev => prev.filter(r => r.id !== id));
    const supabase = getSupabaseClient();
    if (supabase && isCloudConnected) {
      supabase.from('maintenance_requests').delete().eq('id', id).then(({ error }) => {
        if (error) console.error("Supabase delete maintenance_request error:", error);
      });
    }
  };

  // فتح فاتورة الصيانة المرتبطة بالطلب — بتستكمل بنود قطع الغيار تلقائيًا من الطلب (بدون إعادة كتابة)
  // ولو الفاتورة موجودة بالفعل بترجّعها زي ما هي من غير ما تنشئ نسخة تانية
  const openMaintenanceInvoice = (requestId: string): MaintenanceInvoice | null => {
    const req = maintenanceRequests.find(r => r.id === requestId);
    if (!req) return null;
    if (req.invoice_id) {
      return maintenanceInvoices.find(i => i.id === req.invoice_id) || null;
    }
    const partsItems: MaintenanceInvoiceItem[] = (req.parts || []).map(p => ({
      id: generateId('mii'),
      description: p.name,
      item_type: 'parts',
      source: p.source,
      quantity: p.quantity,
      unit_price: 0,
      total: 0,
    }));
    const newInvoice: MaintenanceInvoice = {
      id: generateId('minv'),
      invoice_number: generateMaintenanceInvoiceNumber(),
      maintenance_request_id: requestId,
      car_id: req.car_id,
      items: partsItems,
      discount: 0,
      status: 'draft',
      invoice_date: new Date().toISOString().split('T')[0],
      created_by: currentUser?.name || currentUser?.username,
    };
    setMaintenanceInvoices(prev => [...prev, newInvoice]);
    updateMaintenanceRequest(requestId, { invoice_id: newInvoice.id });

    const supabase = getSupabaseClient();
    if (supabase && isCloudConnected) {
      supabase.from('maintenance_invoices').insert([newInvoice]).then(({ error }) => {
        if (error) {
          console.error("Supabase insert maintenance_invoice error:", error);
          alert(`تنبيه: تم فتح فاتورة الصيانة على هذا الجهاز فقط، وفشل حفظها في قاعدة البيانات السحابية بسبب: ${error.message}\nمعنى ده إن الفاتورة مش هتظهر على باقي الأجهزة لحد ما تتصلح المشكلة. على الأغلب السبب إن جدول "maintenance_invoices" لسه مش منشأ في قاعدة البيانات — افتح شاشة "الاتصال السحابي"، انسخ "مخطط إنشاء الجداول (SQL Schema)" بالكامل، وشغّله مرة واحدة في SQL Editor بتاع Supabase.`);
        }
      });
    }
    return newInvoice;
  };

  const updateMaintenanceInvoice = (id: string, updatedFields: Partial<MaintenanceInvoice>) => {
    setMaintenanceInvoices(prev => prev.map(i => i.id === id ? { ...i, ...updatedFields } : i));
    const supabase = getSupabaseClient();
    if (supabase && isCloudConnected) {
      supabase.from('maintenance_invoices').update(updatedFields).eq('id', id).then(({ error }) => {
        if (error) console.error("Supabase update maintenance_invoice error:", error);
      });
    }
  };

  const addMaintenanceInvoiceItem = (invoiceId: string, item: Omit<MaintenanceInvoiceItem, 'id'>) => {
    const inv = maintenanceInvoices.find(i => i.id === invoiceId);
    if (!inv) return;
    const newItem: MaintenanceInvoiceItem = { ...item, id: generateId('mii') };
    updateMaintenanceInvoice(invoiceId, { items: [...inv.items, newItem] });
  };

  // المصدر الوحيد لتكلفة الصيانة الفعلية لسيارة معينة في تاريخ معين — بيُحسب حيًّا من فواتير
  // الصيانة الحقيقية (قطع غيار + مصنعية − خصم)، بدل ما يتسجل رقم يدوي منفصل في المصاريف
  // اليومية، عشان نمنع احتساب نفس تكلفة الصيانة مرتين في حساب ربحية السيارة (حسب قرار المراجعة)
  const getMaintenanceCostForCarDay = (carId: string, date: string): number =>
    maintenanceCostForCarDay(maintenanceInvoices, carId, date);

  const deleteMaintenanceInvoiceItem = (invoiceId: string, itemId: string) => {
    const inv = maintenanceInvoices.find(i => i.id === invoiceId);
    if (!inv) return;
    updateMaintenanceInvoice(invoiceId, { items: inv.items.filter(it => it.id !== itemId) });
  };

  // الرد على طلب نقل بسيارة: الحالة تتحول لـ "جاري" ويتم ربط السائق تلقائيًا بالسيارة المختارة
  const respondTransportRequestWithCar = (requestId: string, carId: string): { success: boolean; error?: string } => {
    const request = transportRequests.find(r => r.id === requestId);
    if (!request) return { success: false, error: 'الطلب غير موجود' };
    const car = cars.find(c => c.id === carId);
    if (!car) return { success: false, error: 'السيارة غير موجودة' };

    const updatedFields: Partial<TransportRequest> = {
      status: 'in_progress',
      assigned_car_id: car.id,
      assigned_driver_id: car.driver_id || undefined,
      responded_at: new Date().toISOString(),
      ...startTripPatch(new Date().toISOString())
    };

    updateTransportRequest(requestId, updatedFields);
    notifyEvent(transportNotification('responded', request, car.car_number));
    return { success: true };
  };

  // إنهاء التوصيل: الحالة تتحول لـ "منتهى"، وتاريخ التنفيذ بيتحدد تلقائيًا بتاريخ اليوم (أو
  // التاريخ المُمرر صراحةً)، وده قابل للتعديل لاحقًا عادي لو الرحلة فعليًا اتأجلت ليوم تاني
  const markTransportRequestDelivered = (requestId: string, executionDate?: string) => {
    const request = transportRequests.find(r => r.id === requestId);
    updateTransportRequest(requestId, {
      status: 'done',
      delivered_at: new Date().toISOString(),
      execution_date: executionDate ? normalizeDateToYmd(executionDate) : (request?.execution_date || normalizeDateToYmd(new Date().toISOString())),
      ...(request ? closeTripByOfficePatch(request, new Date().toISOString()) : {})
    });
    if (request && request.status !== 'done') {
      notifyEvent(transportNotification('delivered', request, cars.find(c => c.id === request.assigned_car_id)?.car_number));
    }
  };

  // تنفيذ خطوة من رحلة السائق (قبول / وصول / استلام / ... / انتهاء بالعداد والدخان المتوقع)
  const advanceTransportTrip = (requestId: string, action: TripAction, payload?: TripPayload): { success: boolean; error?: string } => {
    const request = transportRequests.find(r => r.id === requestId);
    if (!request) return { success: false, error: 'الطلب غير موجود' };
    const nowIso = new Date().toISOString();
    const res = advanceTrip(request, action, nowIso, normalizeDateToYmd(nowIso), payload);
    if (!res.ok || !res.patch) return { success: false, error: res.error || 'تعذر تنفيذ الخطوة' };
    updateTransportRequest(requestId, res.patch);
    if (action === 'accept' || action === 'finish') {
      notifyEvent(transportNotification(action === 'accept' ? 'trip_accepted' : 'trip_finished', request, cars.find(c => c.id === request.assigned_car_id)?.car_number));
    }
    return { success: true };
  };

  // Drivers action definitions
  const addDriver = (driver: Omit<Driver, 'id' | 'balance'>) => {
    const newId = generateId("dr");
    const newDriver: Driver = {
      ...driver,
      id: newId,
      balance: 0
    };
    setDrivers(prev => [...prev, newDriver]);

    const supabase = getSupabaseClient();
    if (supabase && isCloudConnected) {
      supabase.from('drivers').insert([newDriver]).then(({ error }) => {
        if (error) console.error("Supabase insert driver error:", error);
      });
    }
    return newDriver;
  };

  const updateDriver = (id: string, updatedFields: Partial<Driver>) => {
    setDrivers(prev => prev.map(d => d.id === id ? { ...d, ...updatedFields } : d));

    const supabase = getSupabaseClient();
    if (supabase && isCloudConnected) {
      supabase.from('drivers').update(updatedFields).eq('id', id).then(({ error }) => {
        if (error) console.error("Supabase update driver error:", error);
      });
    }
  };

  const deleteDriver = (id: string) => {
    // لازم نمسح كل الحركات والمخالفات المرتبطة بالسائق ده أولاً محلياً وسحابياً
    // لأن لو فضلوا مرتبطين بيه في قاعدة البيانات (Foreign Key) هيرفض حذف السائق
    // وهيفضل السائق راجع تاني كل ما نعمل مزامنة/تحميل من السحابة رغم إننا شايفينه اتمسح محلياً
    const relatedMovementIds = movements.filter(m => m.driver_id === id).map(m => m.id);
    const relatedViolationIds = violations.filter(v => v.driver_id === id).map(v => v.id);

    setDrivers(prev => prev.filter(d => d.id !== id));
    setMovements(prev => prev.filter(m => m.driver_id !== id));
    setViolations(prev => prev.filter(v => v.driver_id !== id));

    const supabase = getSupabaseClient();
    if (supabase && isCloudConnected) {
      (async () => {
        try {
          if (relatedMovementIds.length > 0) {
            const { error } = await supabase.from('driver_account_movements').delete().in('id', relatedMovementIds);
            if (error) console.error("Supabase delete driver movements error:", error);
          }
          if (relatedViolationIds.length > 0) {
            const { error } = await supabase.from('violations').delete().in('id', relatedViolationIds);
            if (error) console.error("Supabase delete driver violations error:", error);
          }
          const { error: driverError } = await supabase.from('drivers').delete().eq('id', id);
          if (driverError) {
            console.error("Supabase delete driver error:", driverError);
            alert(`تنبيه: تم حذف السائق من الشاشة لكن فشل حذفه نهائياً من قاعدة البيانات السحابية بسبب: ${driverError.message}\nقد يظهر السائق مرة أخرى بعد المزامنة القادمة. برجاء مراجعة الفني.`);
          }
        } catch (e: any) {
          console.error("Supabase cascade delete driver error:", e);
        }
      })();
    }
  };

  // Cars action definitions
  const addCar = (car: Omit<Car, 'id'>) => {
    const newId = generateId("car");
    const newCar: Car = {
      ...car,
      id: newId
    };
    setCars(prev => [...prev, newCar]);

    const supabase = getSupabaseClient();
    if (supabase && isCloudConnected) {
      supabase.from('cars').insert([newCar]).then(({ error }) => {
        if (error) console.error("Supabase insert car error:", error);
      });
    }
    return newCar;
  };

  const updateCar = (id: string, updatedFields: Partial<Car>) => {
    setCars(prev => prev.map(c => c.id === id ? { ...c, ...updatedFields } : c));

    const supabase = getSupabaseClient();
    if (supabase && isCloudConnected) {
      supabase.from('cars').update(updatedFields).eq('id', id).then(({ error }) => {
        if (error) console.error("Supabase update car error:", error);
      });
    }
  };

  const deleteCar = (id: string) => {
    // نفك ارتباط الفواتير وبنود الفواتير بالسيارة دي قبل حذفها، عشان مانمسحش سجلات مالية
    // بس في نفس الوقت مانسيبهاش مربوطة بمعرف سيارة محذوف (ده اللي بيخلي الحذف يترفض في السحابة
    // بسبب قيد Foreign Key، وترجع السيارة تظهر تاني بعد أول مزامنة)
    const affectedInvoiceIds = invoices.filter(inv => inv.car_id === id).map(inv => inv.id);
    const affectedInvoiceItemIds = invoiceItems.filter(it => it.car_id === id).map(it => it.id);
    // نفك ارتباط حركات حساب السائقين (خصومات/مخالصات مربوطة بسيارة) وطلبات النقل المرتبطة
    // بالسيارة دي كمان، لنفس السبب: لو فضلت مربوطة بمعرف سيارة محذوف هترفض في السحابة بقيد
    // Foreign Key وترجع السيارة تظهر تاني بعد أول مزامنة (زي ما كان بيحصل مع الفواتير)
    const affectedMovementIds = movements.filter(m => m.car_id === id).map(m => m.id);
    const affectedRequestIds = transportRequests.filter(r => r.assigned_car_id === id).map(r => r.id);

    setCars(prev => prev.filter(c => c.id !== id));
    // تنضيف سجلات مصاريف السيارة اليومية الخاصة بالسيارة المحذوفة دي (لو موجودة)
    if (carDailyCosts.some(c => c.car_id === id)) {
      persistCarDailyCosts(carDailyCosts.filter(c => c.car_id !== id));
    }
    if (carMonthlyCosts.some(c => c.car_id === id)) {
      persistCarMonthlyCosts(carMonthlyCosts.filter(c => c.car_id !== id));
    }
    if (affectedInvoiceIds.length > 0) {
      setInvoices(prev => prev.map(inv => inv.car_id === id ? { ...inv, car_id: undefined } : inv));
    }
    if (affectedInvoiceItemIds.length > 0) {
      setInvoiceItems(prev => prev.map(it => it.car_id === id ? { ...it, car_id: '' } : it));
    }
    if (affectedMovementIds.length > 0) {
      setMovements(prev => prev.map(m => m.car_id === id ? { ...m, car_id: undefined } : m));
    }
    if (affectedRequestIds.length > 0) {
      setTransportRequests(prev => prev.map(r => r.assigned_car_id === id ? { ...r, assigned_car_id: undefined } : r));
    }

    const supabase = getSupabaseClient();
    if (supabase && isCloudConnected) {
      (async () => {
        try {
          if (affectedInvoiceIds.length > 0) {
            const { error } = await supabase.from('invoices').update({ car_id: null }).eq('car_id', id);
            if (error) console.error("Supabase unlink invoices from car error:", error);
          }
          if (affectedInvoiceItemIds.length > 0) {
            const { error } = await supabase.from('invoice_items').update({ car_id: null }).eq('car_id', id);
            if (error) console.error("Supabase unlink invoice_items from car error:", error);
          }
          if (affectedMovementIds.length > 0) {
            const { error } = await supabase.from('driver_account_movements').update({ car_id: null }).eq('car_id', id);
            if (error) console.error("Supabase unlink driver_account_movements from car error:", error);
          }
          if (affectedRequestIds.length > 0) {
            const { error } = await supabase.from('transport_requests').update({ assigned_car_id: null }).eq('assigned_car_id', id);
            if (error) console.error("Supabase unlink transport_requests from car error:", error);
          }
          const { error: carError } = await supabase.from('cars').delete().eq('id', id);
          if (carError) {
            console.error("Supabase delete car error:", carError);
            alert(`تنبيه: تم حذف السيارة من الشاشة لكن فشل حذفها نهائياً من قاعدة البيانات السحابية بسبب: ${carError.message}\nقد تظهر السيارة مرة أخرى بعد المزامنة القادمة. برجاء مراجعة الفني.`);
          }
        } catch (e: any) {
          console.error("Supabase cascade delete car error:", e);
        }
      })();
    }
  };

  const deleteOfficial = (id: string) => {
    // الفواتير اللي باسم المشرف بتفضل زي ما هي — بنحفظ اسمه عشان يفضل ظاهر عليها
    const goneOfficial = officials.find(o => o.id === id);
    if (goneOfficial) saveDeletedOfficialNames({ ...deletedOfficialNames, [id]: goneOfficial.name });
    setOfficials(prev => prev.filter(o => o.id !== id));
    setCustodyAccounts(prev => prev.filter(ca => ca.official_id !== id));

    // أي مستخدم كان مربوط بالمشرف المحذوف بنفك ارتباطه (المستخدم نفسه بيفضل موجود)
    const linkedToGone = systemUsersRef.current.filter(u => u.linked_official_id === id);
    if (linkedToGone.length > 0) {
      Promise.all(linkedToGone.map(u => callAdminUsers({ action: 'update', id: u.id, linked_official_id: null }))).then(() => refreshSystemUsers());
    }

    if (officialCustomScreens[id]) {
      updateOfficialScreens(id, null);
    }

    const supabase = getSupabaseClient();
    if (supabase && isCloudConnected) {
      supabase.from('officials').delete().eq('id', id).then(({ error }) => {
        if (error) console.error("Supabase delete official error:", error);
      });
    }
  };

  const getOfficialName = (id: string): string => officials.find(o => o.id === id)?.name || deletedOfficialNames[id] || '';

  // Add Officials
  const addOfficial = (official: Omit<Official, 'id'>) => {
    const officialId = generateId("off");
    const newOfficial: Official = {
      ...official,
      id: officialId
    };
    setOfficials(prev => [...prev, newOfficial]);

    // Create defaults
    const cashAcc: CustodyAccount = {
      id: generateId("ca_cash"),
      official_id: officialId,
      name: "نقدي افتراضي",
      type: 'cash',
      balance: official.cash_custody
    };
    const visaAcc: CustodyAccount = {
      id: generateId("ca_visa"),
      official_id: officialId,
      name: "فيزا رئيسية افتراضية",
      type: 'visa',
      balance: official.visa_custody
    };
    setCustodyAccounts(prev => [...prev, cashAcc, visaAcc]);

    // Log movements
    const mov1: CustodyMovement = {
      id: generateId("cm"),
      official_id: officialId,
      to_account_id: cashAcc.id,
      date: new Date().toISOString().split('T')[0],
      description: `تأسيس حساب نقدي افتراضي للمسؤول ${official.name}`,
      amount: official.cash_custody,
      type: 'deposit'
    };
    const mov2: CustodyMovement = {
      id: generateId("cm"),
      official_id: officialId,
      to_account_id: visaAcc.id,
      date: new Date().toISOString().split('T')[0],
      description: `تأسيس حساب فيزا افتراضي للمسؤول ${official.name}`,
      amount: official.visa_custody,
      type: 'deposit'
    };
    setCustodyMovements(prev => [mov1, mov2, ...prev]);

    // Supabase
    const supabase = getSupabaseClient();
    if (supabase && isCloudConnected) {
      Promise.all([
        supabase.from('officials').insert([newOfficial]),
        supabase.from('custody_accounts').insert([cashAcc, visaAcc]),
        supabase.from('custody_movements').insert([mov1, mov2])
      ]).catch(e => console.error("Supabase write officials batch error:", e));
    }

    return newOfficial;
  };

  const updateCustody = (id: string, cashDelta: number, visaDelta: number) => {
    const parent = officials.find(o => o.id === id);
    if (!parent) return;

    const updatedOfficial = {
      ...parent,
      cash_custody: parent.cash_custody + cashDelta,
      visa_custody: parent.visa_custody + visaDelta
    };

    setOfficials(prev => prev.map(o => o.id === id ? updatedOfficial : o));

    const supabase = getSupabaseClient();
    if (supabase && isCloudConnected) {
      supabase.from('officials').update({
        cash_custody: updatedOfficial.cash_custody,
        visa_custody: updatedOfficial.visa_custody
      }).eq('id', id).then(({ error }) => {
        if (error) console.error("Supabase update custody sum error:", error);
      });
    }
  };

  // تغيير كلمة سر مسؤول (من الأدمن): الدخول بقى عبر Supabase Auth، فبنغيّرها على المستخدم المربوط بالمسؤول
  // من خلال Edge Function. مفيش كلمات سر بتتخزن على جدول officials تاني.
  const updateOfficialPassword = async (id: string, newPassword: string): Promise<{ success: boolean; error?: string }> => {
    const linked = systemUsersRef.current.find(u => u.linked_official_id === id);
    if (!linked) return { success: false, error: 'المسؤول ده مالوش مستخدم دخول مربوط — اربطه من شاشة المستخدمين الأول.' };
    const res = await updateSystemUser(linked.id, { password: newPassword });
    return { success: res.success, error: res.error };
  };

  // تغيير اسم مشرف الصرف (اسم المستخدم الظاهر بالنظام)
  const updateOfficialName = (id: string, newName: string) => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    let updatedParent: Official | undefined;
    setOfficials(prev => prev.map(o => {
      if (o.id === id) {
        updatedParent = { ...o, name: trimmed };
        return updatedParent;
      }
      return o;
    }));

    const supabase = getSupabaseClient();
    if (supabase && isCloudConnected && updatedParent) {
      supabase.from('officials').update({
        name: trimmed
      }).eq('id', id).then(({ error }) => {
        if (error) console.error("Supabase update official name error:", error);
      });
    }
  };

  // Sub custody actions
  const addCustodyAccount = (accountData: Omit<CustodyAccount, 'id'>) => {
    const newId = generateId("ca");
    const newAcc: CustodyAccount = {
      ...accountData,
      id: newId
    };
    setCustodyAccounts(prev => [...prev, newAcc]);

    // Sync official balance
    let updatedParent: Official | undefined;
    setOfficials(prev => prev.map(o => {
      if (o.id === accountData.official_id) {
        updatedParent = {
          ...o,
          cash_custody: accountData.type === 'cash' ? o.cash_custody + accountData.balance : o.cash_custody,
          visa_custody: accountData.type !== 'cash' ? o.visa_custody + accountData.balance : o.visa_custody
        };
        return updatedParent;
      }
      return o;
    }));

    // Log movement
    const newMov: CustodyMovement = {
      id: generateId("cm"),
      official_id: accountData.official_id,
      to_account_id: newId,
      date: new Date().toISOString().split('T')[0],
      description: `إنشاء وتخصيص حساب فرعي جديد: ${accountData.name} برصيد مالي ${accountData.balance.toLocaleString()} ج.م`,
      amount: accountData.balance,
      type: 'deposit'
    };
    setCustodyMovements(prev => [newMov, ...prev]);

    const supabase = getSupabaseClient();
    if (supabase && isCloudConnected) {
      Promise.all([
        supabase.from('custody_accounts').insert([newAcc]),
        updatedParent ? supabase.from('officials').update(updatedParent).eq('id', accountData.official_id) : Promise.resolve(),
        supabase.from('custody_movements').insert([newMov])
      ]).catch(e => console.error("Supabase create custody account batch fail:", e));
    }

    return newAcc;
  };

  const updateCustodyAccount = (id: string, fields: Partial<CustodyAccount>) => {
    // الرصيد مبقاش يتعدّل يدويًا (اتلغت التسوية): الرصيد بيتغيّر بس بإضافة عهدة (دائن) أو بخصم فاتورة (مدين)
    const { balance: _ignoredBalance, ...restFields } = fields;
    const updatedFields: Partial<CustodyAccount> = restFields;
    let updatedAcc: CustodyAccount | undefined;
    let updatedParent: Official | undefined;
    let newMov: CustodyMovement | undefined;

    setCustodyAccounts(prev => prev.map(acc => {
      if (acc.id === id) {
        const oldBalance = acc.balance;
        const newBalance = updatedFields.balance !== undefined ? updatedFields.balance : oldBalance;
        const balanceDiff = newBalance - oldBalance;

        updatedAcc = { ...acc, ...updatedFields };

        if (balanceDiff !== 0) {
          // Sync official balance
          setOfficials(ops => ops.map(o => {
            if (o.id === acc.official_id) {
              updatedParent = {
                ...o,
                cash_custody: acc.type === 'cash' ? Math.max(0, o.cash_custody + balanceDiff) : o.cash_custody,
                visa_custody: acc.type !== 'cash' ? Math.max(0, o.visa_custody + balanceDiff) : o.visa_custody
              };
              return updatedParent;
            }
            return o;
          }));

          // Log movement
          newMov = {
            id: generateId("cm"),
            official_id: acc.official_id,
            to_account_id: balanceDiff > 0 ? acc.id : undefined,
            from_account_id: balanceDiff < 0 ? acc.id : undefined,
            date: new Date().toISOString().split('T')[0],
            description: `تسوية وتعديل رصيد الحساب الفرعي ${updatedFields.name || acc.name} يدويًا (${balanceDiff > 0 ? 'إضافة وتسوية بقيمة' : 'عجز وتنزيل بقيمة'}: ${Math.abs(balanceDiff).toLocaleString()} ج.م)`,
            amount: Math.abs(balanceDiff),
            type: 'settlement'
          };
          setCustodyMovements(prev => [newMov!, ...prev]);
        }

        return updatedAcc;
      }
      return acc;
    }));

    // Sync Supabase
    const supabase = getSupabaseClient();
    if (supabase && isCloudConnected) {
      const q = [];
      if (updatedAcc) q.push(supabase.from('custody_accounts').update(updatedFields).eq('id', id));
      if (updatedParent && updatedAcc) q.push(supabase.from('officials').update(updatedParent).eq('id', (updatedAcc as CustodyAccount).official_id));
      if (newMov) q.push(supabase.from('custody_movements').insert([newMov]));
      Promise.all(q).catch(e => console.error("Supabase updateCustodyAccount error:", e));
    }
  };

  // إضافة عهدة جديدة لحساب مشرف: حركة دائن (وارد) في كشف الحساب ويزيد الرصيد
  const addCustodyFunds = (accountId: string, amount: number, description?: string): { success: boolean; error?: string } => {
    const acc = custodyAccounts.find(a => a.id === accountId);
    if (!acc) return { success: false, error: 'لم يتم العثور على حساب العهدة!' };
    if (!(amount > 0)) return { success: false, error: 'اكتب مبلغ العهدة أكبر من صفر.' };
    const today = new Date().toISOString().split('T')[0];
    if (!canEditMonth(today)) return { success: false, error: MONTH_LOCKED_MSG };

    const updatedAcc: CustodyAccount = { ...acc, balance: acc.balance + amount };
    setCustodyAccounts(prev => prev.map(a => a.id === accountId ? updatedAcc : a));

    const parent = officials.find(o => o.id === acc.official_id);
    const updatedParent = parent ? {
      ...parent,
      cash_custody: acc.type === 'cash' ? parent.cash_custody + amount : parent.cash_custody,
      visa_custody: acc.type !== 'cash' ? parent.visa_custody + amount : parent.visa_custody,
    } : undefined;
    if (updatedParent) setOfficials(prev => prev.map(o => o.id === acc.official_id ? updatedParent : o));

    const mov: CustodyMovement = {
      id: generateId("cm"),
      official_id: acc.official_id,
      to_account_id: accountId,
      date: today,
      description: (description && description.trim()) || `عهدة جديدة — ${acc.name}`,
      amount,
      type: 'deposit'
    };
    setCustodyMovements(prev => [mov, ...prev]);

    const supabase = getSupabaseClient();
    if (supabase && isCloudConnected) {
      Promise.all([
        supabase.from('custody_accounts').update({ balance: updatedAcc.balance }).eq('id', accountId),
        updatedParent ? supabase.from('officials').update({ cash_custody: updatedParent.cash_custody, visa_custody: updatedParent.visa_custody }).eq('id', acc.official_id) : Promise.resolve(),
        supabase.from('custody_movements').insert([mov])
      ]).catch(e => console.error("Supabase addCustodyFunds error:", e));
    }
    return { success: true };
  };

  const deleteCustodyAccount = (id: string) => {
    const acc = custodyAccounts.find(a => a.id === id);
    if (!acc) return;

    let updatedParent: Official | undefined;
    setOfficials(prev => prev.map(o => {
      if (o.id === acc.official_id) {
        updatedParent = {
          ...o,
          cash_custody: acc.type === 'cash' ? Math.max(0, o.cash_custody - acc.balance) : o.cash_custody,
          visa_custody: acc.type !== 'cash' ? Math.max(0, o.visa_custody - acc.balance) : o.visa_custody
        };
        return updatedParent;
      }
      return o;
    }));

    setCustodyAccounts(prev => prev.filter(a => a.id !== id));

    const newMov: CustodyMovement = {
      id: generateId("cm"),
      official_id: acc.official_id,
      from_account_id: id,
      date: new Date().toISOString().split('T')[0],
      description: `إلغاء وحذف الحساب الفرعي ${acc.name}، وتصفير ميزانيته المستردة`,
      amount: acc.balance,
      type: 'withdrawal'
    };
    setCustodyMovements(prev => [newMov, ...prev]);

    const supabase = getSupabaseClient();
    if (supabase && isCloudConnected) {
      Promise.all([
        supabase.from('custody_accounts').delete().eq('id', id),
        updatedParent ? supabase.from('officials').update(updatedParent).eq('id', acc.official_id) : Promise.resolve(),
        supabase.from('custody_movements').insert([newMov])
      ]).catch(e => console.error("Supabase delete custody account failure:", e));
    }
  };

  const transferCustody = (fromAccountId: string, toAccountId: string, amount: number, description: string) => {
    const fromAcc = custodyAccounts.find(a => a.id === fromAccountId);
    const toAcc = custodyAccounts.find(a => a.id === toAccountId);
    const transferError = validateCustodyTransfer(fromAcc, toAcc, amount);
    if (transferError || !fromAcc || !toAcc) {
      return { success: false, error: transferError || 'أحد الحسابات أو كلاهما غير متوفر في قواعد البيانات!' };
    }

    let updatedFromAcc: CustodyAccount | undefined;
    let updatedToAcc: CustodyAccount | undefined;

    setCustodyAccounts(prev => prev.map(a => {
      if (a.id === fromAccountId) {
        updatedFromAcc = { ...a, balance: a.balance - amount };
        return updatedFromAcc;
      }
      if (a.id === toAccountId) {
        updatedToAcc = { ...a, balance: a.balance + amount };
        return updatedToAcc;
      }
      return a;
    }));

    const parentUpdates: Record<string, Official> = {};
    setOfficials(prev => prev.map(o => {
      const { patch, changed } = applyTransferToOfficial(o, fromAcc, toAcc, amount);
      if (changed) {
        parentUpdates[o.id] = patch;
      }
      return patch;
    }));

    const newMov: CustodyMovement = {
      id: generateId("cm"),
      official_id: fromAcc.official_id,
      from_account_id: fromAccountId,
      to_account_id: toAccountId,
      date: new Date().toISOString().split('T')[0],
      description: `تحويل مالي بين الخزائن: ${description} (من حساب: [${fromAcc.name}] إلى حساب: [${toAcc.name}])`,
      amount: amount,
      type: 'transfer'
    };
    setCustodyMovements(prev => [newMov, ...prev]);

    const supabase = getSupabaseClient();
    if (supabase && isCloudConnected) {
      const q = [
        updatedFromAcc ? supabase.from('custody_accounts').update({ balance: updatedFromAcc.balance }).eq('id', fromAccountId) : Promise.resolve(),
        updatedToAcc ? supabase.from('custody_accounts').update({ balance: updatedToAcc.balance }).eq('id', toAccountId) : Promise.resolve(),
        supabase.from('custody_movements').insert([newMov])
      ];
      for (const [pId, pVal] of Object.entries(parentUpdates)) {
        q.push(supabase.from('officials').update(pVal).eq('id', pId));
      }
      Promise.all(q).catch(e => console.error("Supabase live transfer custody write fail:", e));
    }

    return { success: true };
  };

  // Add violation
  const addViolation = (rawViolationData: Omit<Violation, 'id'>, forceBypass: boolean = false) => {
    let resolvedCarNum = rawViolationData.car_number.trim();
    if (resolvedCarNum) {
      const match = cars.find(c => {
        if (c.car_number.trim().toLowerCase() === resolvedCarNum.toLowerCase()) return true;
        const cDigits = (c.car_number.match(/\d+/) || [])[0];
        const vDigits = (resolvedCarNum.match(/\d+/) || [])[0];
        return !!(cDigits && vDigits && cDigits === vDigits);
      });
      if (match) {
        resolvedCarNum = match.car_number;
      }
    }

    const violationData = {
      ...rawViolationData,
      car_number: resolvedCarNum,
      violation_date: normalizeDateToYmd(rawViolationData.violation_date)
    };

    const duplicate = violations.find(v => 
      v.violation_date === violationData.violation_date && 
      v.car_number.trim() === violationData.car_number.trim() &&
      v.description.trim() === violationData.description.trim()
    );

    if (duplicate && !forceBypass) {
      return { 
        success: false, 
        error: `تنبيه: توجد مخالفة مسجلة بالفعل لهذه السيارة (${violationData.car_number}) في نفس التاريخ (${violationData.violation_date}) بنفس البيان "${violationData.description}". تكرار مكتشف ومحظور.`,
        duplicateViolation: duplicate 
      };
    }

    const newId = generateId("viol");
    const newViolation: Violation = {
      ...violationData,
      id: newId
    };

    setViolations(prev => [newViolation, ...prev]);

    let updatedDriver: Driver | undefined;
    let newMovement: DriverAccountMovement | undefined;

    setDrivers(prev => prev.map(drv => {
      if (drv.id === violationData.driver_id) {
        const nextBalance = drv.balance + violationData.amount;
        newMovement = {
          id: generateId("mov"),
          driver_id: drv.id,
          date: violationData.violation_date,
          description: `تسجيل مخالفة: ${violationData.description} (سيارة رقم: ${violationData.car_number})${forceBypass ? ' [إدخال استثنائي]' : ''}`,
          amount_change: violationData.amount,
          new_balance: nextBalance,
          type: 'violation'
        };

        updatedDriver = {
          ...drv,
          balance: nextBalance
        };
        return updatedDriver;
      }
      return drv;
    }));

    if (newMovement) {
      setMovements(prevMovs => [newMovement!, ...prevMovs]);
    }

    const supabase = getSupabaseClient();
    if (supabase && isCloudConnected) {
      Promise.all([
        supabase.from('violations').insert([newViolation]),
        updatedDriver ? supabase.from('drivers').update(updatedDriver).eq('id', violationData.driver_id) : Promise.resolve(),
        newMovement ? supabase.from('driver_account_movements').insert([newMovement]) : Promise.resolve()
      ]).catch(e => console.error("Supabase insert violation transaction fail:", e));
    }

    return { success: true };
  };

  const deleteViolation = (id: string) => {
    const target = violations.find(v => v.id === id);
    if (!target) return;

    setViolations(prev => prev.filter(v => v.id !== id));

    let updatedDriver: Driver | undefined;
    let newMovement: DriverAccountMovement | undefined;

    setDrivers(prev => prev.map(drv => {
      if (drv.id === target.driver_id) {
        const nextBalance = Math.max(0, drv.balance - target.amount);
        newMovement = {
          id: generateId("mov"),
          driver_id: drv.id,
          date: new Date().toISOString().split('T')[0],
          description: `حذف غرامة مخالفة مُلغاة: ${target.description} للسيارة ${target.car_number}`,
          amount_change: -target.amount,
          new_balance: nextBalance,
          type: 'reversal'
        };

        updatedDriver = {
          ...drv,
          balance: nextBalance
        };
        return updatedDriver;
      }
      return drv;
    }));

    if (newMovement) {
      setMovements(prevMov => [newMovement!, ...prevMov]);
    }

    const supabase = getSupabaseClient();
    if (supabase && isCloudConnected) {
      Promise.all([
        supabase.from('violations').delete().eq('id', id),
        updatedDriver ? supabase.from('drivers').update(updatedDriver).eq('id', target.driver_id) : Promise.resolve(),
        newMovement ? supabase.from('driver_account_movements').insert([newMovement]) : Promise.resolve()
      ]).catch(e => console.error("Supabase delete violation trigger fail:", e));
    }
  };

  // Deductions Actions
  const applyIndividualDeduction = (driverId: string, amount: number, description: string, date?: string, carId?: string) => {
    let updatedDriver: Driver | undefined;
    let newMovement: DriverAccountMovement | undefined;

    const resolvedDate = normalizeDateToYmd(date && date.trim() !== "" ? date.trim() : new Date().toISOString().split('T')[0]);
    const targetCar = carId ? cars.find(c => c.id === carId) : undefined;
    const carSuffix = targetCar ? ` للسيارة (${targetCar.car_number})` : '';

    setDrivers(prev => prev.map(drv => {
      if (drv.id === driverId) {
        const nextBalance = Math.max(0, drv.balance - amount);
        newMovement = {
          id: generateId("mov"),
          driver_id: driverId,
          car_id: carId,
          date: resolvedDate,
          description: `خصم مستقطع فردي${carSuffix}: ${description}`,
          amount_change: -amount,
          new_balance: nextBalance,
          type: 'deduction'
        };

        updatedDriver = {
          ...drv,
          balance: nextBalance
        };
        return updatedDriver;
      }
      return drv;
    }));

    if (newMovement) {
      setMovements(prevMovs => [newMovement!, ...prevMovs]);
    }

    const supabase = getSupabaseClient();
    if (supabase && isCloudConnected) {
      Promise.all([
        updatedDriver ? supabase.from('drivers').update(updatedDriver).eq('id', driverId) : Promise.resolve(),
        newMovement ? supabase.from('driver_account_movements').insert([newMovement]) : Promise.resolve()
      ]).catch(e => console.error("Supabase apply individual deduction error:", e));
    }
  };

  // Group deduction action
  const applyGroupDeductionRpc = async (amount: number, description: string): Promise<boolean> => {
    let updatedDriversList: Driver[] = [];
    let newMovementsList: DriverAccountMovement[] = [];

    setDrivers(prev => {
      const nextList = prev.map(drv => {
        const nextBalance = Math.max(0, drv.balance - amount);
        const movement: DriverAccountMovement = {
          id: generateId("mov"),
          driver_id: drv.id,
          date: new Date().toISOString().split('T')[0],
          description: `خصم جماعي موحد (بروتوكول RPC استثنائي): ${description}`,
          amount_change: -amount,
          new_balance: nextBalance,
          type: 'deduction'
        };
        newMovementsList.push(movement);
        
        const updated = { ...drv, balance: nextBalance };
        updatedDriversList.push(updated);
        return updated;
      });
      return nextList;
    });

    setMovements(prevMovs => [...newMovementsList, ...prevMovs]);

    const supabase = getSupabaseClient();
    if (supabase && isCloudConnected) {
      try {
        await Promise.all([
          supabase.from('drivers').upsert(updatedDriversList),
          supabase.from('driver_account_movements').insert(newMovementsList)
        ]);
      } catch (e) {
        console.error("Supabase RPC fallback failed:", e);
      }
    }

    return true;
  };

  // Create Invoice Transaction
  // الفاتورة الجديدة بتتسجل "قيد موافقة المالية": مفيش خصم من العهدة ولا تحميل على تكلفة السيارة
  // إلا بعد اعتمادها من شاشة "اعتماد فواتير التراخيص" (approveInvoice). الفواتير القديمة (من غير
  // الحقل ده) بتتعامل كمعتمدة. بعد الاعتماد مفيش تعديل/حذف غير من أدمن البرنامج.
  const isInvoiceApproved = isInvoiceApprovedPure;
  const INVOICE_LOCKED_MSG = 'الفاتورة معتمدة من المالية — التعديل أو الحذف عليها متاح لأدمن البرنامج فقط.';

  // ترقيم الفواتير: المسودات مش بتتعد، ومفيش رقم بيتكرر حتى لو حاجة اتمسحت (رقم الفاتورة فريد في قاعدة البيانات)
  const nextInvoiceNumber = (prefix: string): string => {
    const used = new Set(invoices.map(i => i.invoice_number));
    let n = invoices.filter(i => i.approval_status !== 'draft').length + 1;
    let num = `${prefix}${String(n).padStart(4, '0')}`;
    while (used.has(num)) {
      n += 1;
      num = `${prefix}${String(n).padStart(4, '0')}`;
    }
    return num;
  };

  // مسودة فاتورة: بتتحفظ في جدول الفواتير بحالة 'draft'، من غير خصم من العهدة ولا تحميل على السيارة ولا موافقة.
  // أي تعديل (الرأس والبنود) متاح لحد ما تتحول لفاتورة نهائية (createInvoice) أو تتمسح.
  const saveInvoiceDraft = (
    draftId: string | null,
    data: { invoice_date: string; official_id: string; car_id?: string; license_details?: string; license_location?: string; car_location?: string },
    items: { description: string; amount: number; payment_method: 'cash' | 'visa'; account_id?: string }[]
  ): { success: boolean; error?: string; draftId?: string } => {
    if (!data.invoice_date) return { success: false, error: 'حدد تاريخ الفاتورة الأول.' };
    const existing = draftId ? invoices.find(i => i.id === draftId && i.approval_status === 'draft') : undefined;
    if (draftId && !existing) return { success: false, error: 'المسودة مش موجودة (يمكن اتمسحت أو اتحوّلت لفاتورة).' };

    const id = existing ? existing.id : generateId('inv');
    const total = items.reduce((sum, it) => sum + (Number(it.amount) || 0), 0);
    const draft: Invoice = {
      id,
      invoice_number: existing ? existing.invoice_number : `DRAFT-${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 5).toUpperCase()}`,
      invoice_date: data.invoice_date,
      official_id: data.official_id || '',
      total_amount: total,
      version: 1,
      is_modified: false,
      is_deleted: false,
      car_id: data.car_id || undefined,
      license_details: data.license_details || '',
      license_location: data.license_location || '',
      car_location: data.car_location || '',
      approval_status: 'draft'
    };
    const newItems: InvoiceItem[] = items.map((it, idx) => ({
      id: generateId('item'),
      invoice_id: id,
      car_id: data.car_id || '',
      description: it.description || '',
      amount: Number(it.amount) || 0,
      payment_method: it.payment_method,
      account_id: it.account_id || '',
      sort_order: idx
    }));

    setInvoices(prev => existing ? prev.map(inv => inv.id === id ? draft : inv) : [draft, ...prev]);
    setInvoiceItems(prev => [...prev.filter(it => it.invoice_id !== id), ...newItems]);

    const sb = getSupabaseClient();
    if (sb && isCloudConnected) {
      const writeItems = () => newItems.length > 0 ? sb.from('invoice_items').insert(newItems) : Promise.resolve();
      Promise.resolve(existing
        ? sb.from('invoices').update(draft).eq('id', id)
        : sb.from('invoices').insert([draft]))
        .then(() => sb.from('invoice_items').delete().eq('invoice_id', id))
        .then(() => writeItems())
        .catch(e => console.error('Supabase saveInvoiceDraft error:', e));
    }
    return { success: true, draftId: id };
  };

  // مسح مسودة نهائيًا (مفيش لها أي أثر مالي فمفيش استرداد)
  const deleteInvoiceDraft = (draftId: string): { success: boolean; error?: string } => {
    const draft = invoices.find(i => i.id === draftId && i.approval_status === 'draft');
    if (!draft) return { success: false, error: 'المسودة مش موجودة.' };
    setInvoices(prev => prev.filter(inv => inv.id !== draftId));
    setInvoiceItems(prev => prev.filter(it => it.invoice_id !== draftId));
    const sb = getSupabaseClient();
    if (sb && isCloudConnected) {
      Promise.resolve(sb.from('invoice_items').delete().eq('invoice_id', draftId))
        .then(() => sb.from('invoices').delete().eq('id', draftId).eq('approval_status', 'draft'))
        .catch(e => console.error('Supabase deleteInvoiceDraft error:', e));
    }
    return { success: true };
  };

  const createInvoice = (
    invoiceData: Omit<Invoice, 'id' | 'invoice_number' | 'version' | 'is_modified' | 'is_deleted'>,
    items: Omit<InvoiceItem, 'id' | 'invoice_id' | 'car_id'>[]
  ) => {
    const official = officials.find(o => o.id === invoiceData.official_id);
    if (!official) {
      return { success: false, error: 'لم يتم العثور على المشرف المسؤول!' };
    }
    if (!canEditMonth(invoiceData.invoice_date)) {
      return { success: false, error: MONTH_LOCKED_MSG };
    }

    const accountTotals: Record<string, number> = {};
    const itemsWithAcc = items.map((itm) => {
      let accId = itm.account_id;
      if (!accId) {
        const found = custodyAccounts.find(a => a.official_id === invoiceData.official_id && a.type === itm.payment_method);
        accId = found ? found.id : '';
      }
      if (!accId) {
        const found = custodyAccounts.find(a => a.official_id === invoiceData.official_id);
        accId = found ? found.id : '';
      }

      accountTotals[accId] = (accountTotals[accId] || 0) + itm.amount;

      return {
        ...itm,
        account_id: accId
      };
    });

    // تحقق مبدئي من كفاية الرصيد (الخصم الفعلي بيحصل وقت الاعتماد، وبيتراجع الرصيد وقتها تاني)
    for (const [accId, requiredAmount] of Object.entries(accountTotals)) {
      if (!accId) {
        return { success: false, error: 'عذرًا، لم يتم تحديد أو العثور على حساب الصرف المرتبط!' };
      }
      const acc = custodyAccounts.find(a => a.id === accId);
      if (!acc) {
        return { success: false, error: 'لم يتم العثور على حساب الصرف المختار!' };
      }
      if (acc.balance < requiredAmount) {
        return { success: false, error: `عذرًا، رصيد الحساب الفرعي (${acc.name}) غير كافٍ! المتوفر: ${acc.balance} ج.م، المطلوب: ${requiredAmount} ج.م.` };
      }
    }

    const totalAmount = itemsWithAcc.reduce((sum, item) => sum + item.amount, 0);

    const invoiceNum = nextInvoiceNumber('INV-2026-');
    const newInvoiceId = generateId("inv");
    const newInvoice: Invoice = {
      ...invoiceData,
      id: newInvoiceId,
      invoice_number: invoiceNum,
      version: 1,
      is_modified: false,
      is_deleted: false,
      total_amount: totalAmount,
      approval_status: 'pending'
    };

    const newItems: InvoiceItem[] = itemsWithAcc.map((itm, idx) => ({
      ...itm,
      id: generateId("item"),
      invoice_id: newInvoiceId,
      car_id: invoiceData.car_id || '',
      sort_order: idx
    }));

    setInvoices(prev => [newInvoice, ...prev]);
    setInvoiceItems(prev => [...prev, ...newItems]);

    const targetCarNumber = cars.find(c => c.id === invoiceData.car_id)?.car_number || "غير محدد";
    const auditRecord: InvoiceAuditLog = {
      id: generateId("log"),
      invoice_id: newInvoiceId,
      invoice_number: invoiceNum,
      timestamp: new Date().toISOString(),
      supervisor_name: official.name,
      operation_type: "create",
      old_value: "لا يوجد (جديد)",
      new_value: `توليد فاتورة سيارة ${targetCarNumber} بمبلغ ${newInvoice.total_amount} ج.م (بيان الترخيص: ${invoiceData.license_details || 'بدون'}) — بانتظار موافقة المالية.`
    };
    setAuditLogs(prev => [auditRecord, ...prev]);

    const supabase = getSupabaseClient();
    if (supabase && isCloudConnected) {
      Promise.all([
        supabase.from('invoices').insert([newInvoice]),
        supabase.from('invoice_items').insert(newItems),
        supabase.from('invoice_audit_logs').insert([auditRecord])
      ]).catch(e => console.error("Supabase createInvoice error:", e));
    }

    return { success: true, invoice: newInvoice };
  };

  // اعتماد المالية للفاتورة: هنا بس بيحصل الخصم من العهدة وتتحمّل تكلفة الترخيص على السيارة
  const approveInvoice = (invoiceId: string): { success: boolean; error?: string } => {
    const invoice = invoices.find(inv => inv.id === invoiceId);
    if (!invoice || invoice.is_deleted) return { success: false, error: 'الفاتورة غير موجودة أو ملغاة!' };
    if (isInvoiceApproved(invoice)) return { success: false, error: 'الفاتورة معتمدة بالفعل.' };
    if (invoice.approval_status === 'returned') return { success: false, error: 'الفاتورة مرتجعة لمستخدم التراخيص — لازم يعدّلها أو يعيد إرسالها الأول.' };
    if (!canEditMonth(invoice.invoice_date)) return { success: false, error: MONTH_LOCKED_MSG };
    const official = officials.find(o => o.id === invoice.official_id);
    if (!official) {
      // المشرف اتحذف: الفاتورة بتتعتمد وتتحمّل على السيارة، من غير خصم من عهدة (العهدة نفسها اتحذفت)
      const approverName0 = currentUser?.name || currentUser?.username || 'المالية';
      const approvedAt0 = new Date().toISOString();
      const approved0: Invoice = { ...invoice, approval_status: 'approved', approved_by: approverName0, approved_at: approvedAt0 };
      setInvoices(prev => prev.map(inv => inv.id === invoiceId ? approved0 : inv));
      if (invoice.car_id) {
        setCars(prev => prev.map(car => car.id === invoice.car_id
          ? { ...car, license_total_cost: (car.license_total_cost || 0) + invoice.total_amount }
          : car));
      }
      const supabase0 = getSupabaseClient();
      if (supabase0 && isCloudConnected) {
        supabase0.from('invoices').update({ approval_status: 'approved', approved_by: approverName0, approved_at: approvedAt0 }).eq('id', invoiceId)
          .then(({ error }) => { if (error) console.error('Supabase approveInvoice (deleted official) error:', error); });
      }
      return { success: true };
    }

    const items = invoiceItems.filter(itm => itm.invoice_id === invoiceId);
    const plan = planInvoiceApproval({ invoice, items, custodyAccounts, official });
    if (plan.ok === false) return { success: false, error: plan.error };
    const { accountTotals, newCustodyAccounts, changedCustodyAccounts, updatedOfficial } = plan;
    setCustodyAccounts(newCustodyAccounts);
    setOfficials(prev => prev.map(o => o.id === invoice.official_id ? updatedOfficial : o));

    if (invoice.car_id) {
      setCars(prev => prev.map(car => car.id === invoice.car_id
        ? { ...car, license_total_cost: (car.license_total_cost || 0) + invoice.total_amount }
        : car));
    }

    const approverName = currentUser?.name || currentUser?.username || 'المالية';
    const approvedAt = new Date().toISOString();
    const approvedInvoice: Invoice = { ...invoice, approval_status: 'approved', approved_by: approverName, approved_at: approvedAt };
    setInvoices(prev => prev.map(inv => inv.id === invoiceId ? approvedInvoice : inv));

    const targetCarNumber = cars.find(c => c.id === invoice.car_id)?.car_number || "غير محدد";
    const chargeMovements = Object.entries(accountTotals).map(([accId, amt]) => {
      const acc = custodyAccounts.find(a => a.id === accId);
      return {
        id: generateId("cm"),
        official_id: invoice.official_id,
        from_account_id: accId,
        date: approvedAt.split('T')[0],
        description: `خصم مصروفات سيارة ${targetCarNumber} بموجب فاتورة ${invoice.invoice_number} بعد موافقة المالية (من حساب ${acc?.name})`,
        amount: amt,
        type: 'invoice_charge' as const
      };
    });
    setCustodyMovements(prev => [...chargeMovements, ...prev]);

    const auditRecord: InvoiceAuditLog = {
      id: generateId("log"),
      invoice_id: invoiceId,
      invoice_number: invoice.invoice_number,
      timestamp: approvedAt,
      supervisor_name: approverName,
      operation_type: "edit",
      old_value: "قيد موافقة المالية",
      new_value: `موافقة المالية وخصم ${invoice.total_amount} ج.م من العهدة (اعتمدها: ${approverName}).`
    };
    setAuditLogs(prev => [auditRecord, ...prev]);

    const supabase = getSupabaseClient();
    if (supabase && isCloudConnected) {
      Promise.all([
        supabase.from('invoices').update({ approval_status: 'approved', approved_by: approverName, approved_at: approvedAt }).eq('id', invoiceId),
        supabase.from('invoice_audit_logs').insert([auditRecord]),
        supabase.from('custody_movements').insert(chargeMovements),
        supabase.from('officials').update({
          cash_custody: updatedOfficial.cash_custody,
          visa_custody: updatedOfficial.visa_custody
        }).eq('id', invoice.official_id),
        changedCustodyAccounts.length > 0 ? supabase.from('custody_accounts').upsert(changedCustodyAccounts) : Promise.resolve()
      ]).catch(e => console.error("Supabase approveInvoice error:", e));
    }

    return { success: true };
  };

  // إرجاع المالية للفاتورة لمستخدم التراخيص بسبب (مفيش أثر مالي: لسه ماتخصمتش)
  const returnInvoice = (invoiceId: string, reason: string): { success: boolean; error?: string } => {
    const invoice = invoices.find(inv => inv.id === invoiceId);
    if (!invoice || invoice.is_deleted) return { success: false, error: 'الفاتورة غير موجودة أو ملغاة!' };
    if (isInvoiceApproved(invoice)) return { success: false, error: 'الفاتورة معتمدة بالفعل، مينفعش ترجّعها.' };
    if (invoice.approval_status === 'returned') return { success: false, error: 'الفاتورة مرتجعة بالفعل.' };
    if (!reason.trim()) return { success: false, error: 'اكتب سبب الإرجاع.' };
    if (!canEditMonth(invoice.invoice_date)) return { success: false, error: MONTH_LOCKED_MSG };

    const by = currentUser?.name || currentUser?.username || 'المالية';
    const at = new Date().toISOString();
    const returned: Invoice = { ...invoice, approval_status: 'returned', return_reason: reason.trim(), returned_by: by, returned_at: at };
    setInvoices(prev => prev.map(inv => inv.id === invoiceId ? returned : inv));

    const auditRecord: InvoiceAuditLog = {
      id: generateId("log"),
      invoice_id: invoiceId,
      invoice_number: invoice.invoice_number,
      timestamp: at,
      supervisor_name: by,
      operation_type: "edit",
      old_value: "قيد موافقة المالية",
      new_value: `إرجاع الفاتورة لمستخدم التراخيص بسبب: ${reason.trim()}`
    };
    setAuditLogs(prev => [auditRecord, ...prev]);

    const supabase = getSupabaseClient();
    if (supabase && isCloudConnected) {
      supabase.from('invoices').update({ approval_status: 'returned', return_reason: reason.trim(), returned_by: by, returned_at: at }).eq('id', invoiceId)
        .then(async ({ error }) => {
          if (error && /return_reason|returned_/.test(error.message || '')) {
            // أعمدة سبب الإرجاع لسه ماتضافتش في Supabase: نحفظ الحالة على الأقل
            await supabase.from('invoices').update({ approval_status: 'returned' }).eq('id', invoiceId);
          } else if (error) {
            console.error("Supabase returnInvoice error:", error);
          }
        });
      supabase.from('invoice_audit_logs').insert([auditRecord]).then(({ error }) => { if (error) console.error("Supabase audit error:", error); });
    }
    return { success: true };
  };

  // مستخدم التراخيص بيعيد إرسال فاتورة مرتجعة للمالية
  const resubmitInvoice = (invoiceId: string): { success: boolean; error?: string } => {
    const invoice = invoices.find(inv => inv.id === invoiceId);
    if (!invoice || invoice.is_deleted) return { success: false, error: 'الفاتورة غير موجودة أو ملغاة!' };
    if (invoice.approval_status !== 'returned') return { success: false, error: 'الفاتورة مش مرتجعة.' };
    if (!canEditMonth(invoice.invoice_date)) return { success: false, error: MONTH_LOCKED_MSG };

    setInvoices(prev => prev.map(inv => inv.id === invoiceId ? { ...inv, approval_status: 'pending' } : inv));
    const auditRecord: InvoiceAuditLog = {
      id: generateId("log"),
      invoice_id: invoiceId,
      invoice_number: invoice.invoice_number,
      timestamp: new Date().toISOString(),
      supervisor_name: currentUser?.name || currentUser?.username || 'مستخدم التراخيص',
      operation_type: "edit",
      old_value: "مرتجعة من المالية",
      new_value: 'تمت إعادة إرسال الفاتورة لموافقة المالية.'
    };
    setAuditLogs(prev => [auditRecord, ...prev]);
    const supabase = getSupabaseClient();
    if (supabase && isCloudConnected) {
      supabase.from('invoices').update({ approval_status: 'pending' }).eq('id', invoiceId).then(({ error }) => { if (error) console.error("Supabase resubmit error:", error); });
      supabase.from('invoice_audit_logs').insert([auditRecord]).then(({ error }) => { if (error) console.error("Supabase audit error:", error); });
    }
    return { success: true };
  };

  // تكلفة التراخيص المعتمدة لسيارة في يوم معيّن (مصدر واحد حي لشاشات تكاليف وربحية السيارات)
  const getLicenseCostForCarDay = (carId: string, date: string): number =>
    licenseCostForCarDay(invoices, carId, date);

  // Update Invoice logic
  const updateInvoice = (
    invoiceId: string,
    supervisorName: string,
    newItems: Omit<InvoiceItem, 'id' | 'invoice_id' | 'car_id'>[],
    headerData?: {
      car_id?: string;
      license_details?: string;
      license_location?: string;
      car_location?: string;
      invoice_date?: string;
    }
  ) => {
    const oldInvoice = invoices.find(inv => inv.id === invoiceId);
    if (!oldInvoice || oldInvoice.is_deleted) {
      return { success: false, error: "الفاتورة غير موجودة أو تم حذفها بالفعل!" };
    }

    const official = officials.find(o => o.id === oldInvoice.official_id);
    if (!official) {
      return { success: false, error: "المسؤول عن الفاتورة لم يعد متاحًا!" };
    }

    if (isInvoiceApproved(oldInvoice) && currentUser?.role !== 'admin') {
      return { success: false, error: INVOICE_LOCKED_MSG };
    }
    if (!canEditMonth(oldInvoice.invoice_date) || (headerData?.invoice_date && !canEditMonth(headerData.invoice_date))) {
      return { success: false, error: MONTH_LOCKED_MSG };
    }

    // فاتورة لسه قيد الموافقة: التعديل عليها مالوش أي أثر على العهدة (لسه ماتخصمتش)
    if (!isInvoiceApproved(oldInvoice)) {
      const pendingItems = newItems.map((itm) => {
        let accId = itm.account_id;
        if (!accId) {
          const found = custodyAccounts.find(a => a.official_id === oldInvoice.official_id && a.type === itm.payment_method)
            || custodyAccounts.find(a => a.official_id === oldInvoice.official_id);
          accId = found ? found.id : '';
        }
        return { ...itm, account_id: accId };
      });
      const pendingTotal = pendingItems.reduce((sum, item) => sum + item.amount, 0);
      const pendingInvoice: Invoice = {
        ...oldInvoice,
        ...headerData,
        version: oldInvoice.version + 1,
        is_modified: true,
        total_amount: pendingTotal,
        approval_status: 'pending'
      };
      const pendingMapped: InvoiceItem[] = pendingItems.map((itm, index) => ({
        ...itm,
        id: generateId("item_mod"),
        invoice_id: invoiceId,
        car_id: headerData?.car_id || oldInvoice.car_id || '',
        sort_order: index
      }));
      setInvoices(prev => prev.map(inv => inv.id === invoiceId ? pendingInvoice : inv));
      setInvoiceItems(prev => [...prev.filter(itm => itm.invoice_id !== invoiceId), ...pendingMapped]);
      const pendingAudit: InvoiceAuditLog = {
        id: generateId("log"),
        invoice_id: invoiceId,
        invoice_number: oldInvoice.invoice_number,
        timestamp: new Date().toISOString(),
        supervisor_name: supervisorName,
        operation_type: "edit",
        old_value: `القيمة القديمة: ${oldInvoice.total_amount} ج.م (نسخة رقم ${oldInvoice.version}) — قيد الموافقة`,
        new_value: `تعديل القيمة إلى: ${pendingTotal} ج.م (نسخة رقم ${pendingInvoice.version}) — لسه بانتظار موافقة المالية، بدون أثر على العهدة.`
      };
      setAuditLogs(prev => [pendingAudit, ...prev]);
      const sb = getSupabaseClient();
      if (sb && isCloudConnected) {
        Promise.all([
          sb.from('invoices').update(pendingInvoice).eq('id', invoiceId),
          sb.from('invoice_items').delete().eq('invoice_id', invoiceId).then(() => sb.from('invoice_items').insert(pendingMapped)),
          sb.from('invoice_audit_logs').insert([pendingAudit])
        ]).catch(e => console.error("Supabase updateInvoice (pending) error:", e));
      }
      return { success: true };
    }

    // Existing old items
    const oldItems = invoiceItems.filter(itm => itm.invoice_id === invoiceId);

    // Dynamic refunds computation
    const accountRefunds: Record<string, number> = {};
    for (const item of oldItems) {
      let accId = item.account_id || '';
      if (!accId) {
        const match = custodyAccounts.find(a => a.official_id === oldInvoice.official_id && a.type === item.payment_method);
        accId = match ? match.id : '';
      }
      if (accId) {
        accountRefunds[accId] = (accountRefunds[accId] || 0) + item.amount;
      }
    }

    const accountDemands: Record<string, number> = {};
    const itemsWithAcc = newItems.map((itm) => {
      let accId = itm.account_id;
      if (!accId) {
        const found = custodyAccounts.find(a => a.official_id === oldInvoice.official_id && a.type === itm.payment_method);
        found ? (accId = found.id) : (accId = '');
      }
      if (!accId) {
        const found = custodyAccounts.find(a => a.official_id === oldInvoice.official_id);
        found ? (accId = found.id) : (accId = '');
      }

      accountDemands[accId] = (accountDemands[accId] || 0) + itm.amount;

      return {
        ...itm,
        account_id: accId
      };
    });

    // Check budget limit boundary checks
    const deltaPerAccount: Record<string, number> = {};
    for (const [accId, amt] of Object.entries(accountRefunds)) {
      deltaPerAccount[accId] = (deltaPerAccount[accId] || 0) + amt;
    }
    for (const [accId, amt] of Object.entries(accountDemands)) {
      deltaPerAccount[accId] = (deltaPerAccount[accId] || 0) - amt;
    }

    for (const [accId, delta] of Object.entries(deltaPerAccount)) {
      if (delta < 0) {
        const acc = custodyAccounts.find(a => a.id === accId);
        const currentBalance = acc ? acc.balance : 0;
        if (currentBalance + delta < 0) {
          return { success: false, error: `عجز مالي في تعديل الحساب الفرعي (${acc?.name || 'بدون'})! المتوفر: ${currentBalance} ج.م ويمتد سحب إضافي قدره ${Math.abs(delta)} ج.م لتمام المراجعة.` };
        }
      }
    }

    const newCustodyAccounts = custodyAccounts.map(a => {
      const delta = deltaPerAccount[a.id];
      if (delta !== undefined && delta !== 0) {
        return { ...a, balance: a.balance + delta };
      }
      return a;
    });
    const changedCustodyAccounts = newCustodyAccounts.filter(a => {
      const delta = deltaPerAccount[a.id];
      return delta !== undefined && delta !== 0;
    });
    setCustodyAccounts(newCustodyAccounts);

    const oldCashPaid = oldItems.filter(i => {
      const match = custodyAccounts.find(ca => ca.id === i.account_id);
      return match?.type === 'cash';
    }).reduce((sum, item) => sum + item.amount, 0);

    const oldVisaPaid = oldItems.filter(i => {
      const match = custodyAccounts.find(ca => ca.id === i.account_id);
      return match?.type !== 'cash';
    }).reduce((sum, item) => sum + item.amount, 0);

    const newCashRequired = itemsWithAcc.filter(i => {
      const match = custodyAccounts.find(ca => ca.id === i.account_id);
      return match?.type === 'cash';
    }).reduce((sum, item) => sum + item.amount, 0);

    const newVisaRequired = itemsWithAcc.filter(i => {
      const match = custodyAccounts.find(ca => ca.id === i.account_id);
      return match?.type !== 'cash';
    }).reduce((sum, item) => sum + item.amount, 0);

    const cashDelta = oldCashPaid - newCashRequired;
    const visaDelta = oldVisaPaid - newVisaRequired;

    updateCustody(oldInvoice.official_id, cashDelta, visaDelta);

    const updatedVersion = oldInvoice.version + 1;
    const totalNewAmount = newCashRequired + newVisaRequired;

    const modifiedInvoice = {
      ...oldInvoice,
      ...headerData,
      version: updatedVersion,
      is_modified: true,
      total_amount: totalNewAmount
    };

    setInvoices(prev => prev.map(inv => inv.id === invoiceId ? modifiedInvoice : inv));

    let freshlyMappedItems: InvoiceItem[] = [];
    setInvoiceItems(prev => {
      const filtered = prev.filter(itm => itm.invoice_id !== invoiceId);
      freshlyMappedItems = itemsWithAcc.map((itm, index) => ({
        ...itm,
        id: generateId("item_mod"),
        invoice_id: invoiceId,
        car_id: headerData?.car_id || oldInvoice.car_id || '',
        sort_order: index
      }));
      return [...filtered, ...freshlyMappedItems];
    });

    const targetCarNumber = cars.find(c => c.id === oldInvoice.car_id)?.car_number || "غير محدد";
    const adjMovements = Object.entries(deltaPerAccount)
      .filter(([_, delta]) => delta !== 0)
      .map(([accId, delta]) => {
        const acc = custodyAccounts.find(a => a.id === accId);
        return {
          id: generateId("cm"),
          official_id: oldInvoice.official_id,
          to_account_id: delta > 0 ? accId : undefined,
          from_account_id: delta < 0 ? accId : undefined,
          date: new Date().toISOString().split('T')[0],
          description: `تعديل بند ترخيص الفاتورة ${oldInvoice.invoice_number} لمركبة ${targetCarNumber} (${delta > 0 ? 'استرداد مالي قدره' : 'سحب مالي إضافي قدره'} ${Math.abs(delta).toLocaleString()} ج.م من حساب ${acc?.name || 'غير محدد'})`,
          amount: Math.abs(delta),
          type: (delta > 0 ? 'deposit' : 'invoice_charge') as any
        };
      });
    setCustodyMovements(prev => [...adjMovements, ...prev]);

    const auditRecord: InvoiceAuditLog = {
      id: generateId("log"),
      invoice_id: invoiceId,
      invoice_number: oldInvoice.invoice_number,
      timestamp: new Date().toISOString(),
      supervisor_name: supervisorName,
      operation_type: "edit",
      old_value: `القيمة القديمة: ${oldInvoice.total_amount} ج.م (نسخة رقم ${oldInvoice.version})`,
      new_value: `تعديل القيمة إلى: ${totalNewAmount} ج.م (توليد كشّف نسخة معدلة ماليًا رقم ${updatedVersion})`
    };
    setAuditLogs(prev => [auditRecord, ...prev]);

    const supabase = getSupabaseClient();
    if (supabase && isCloudConnected) {
      Promise.all([
        supabase.from('invoices').update(modifiedInvoice).eq('id', invoiceId),
        supabase.from('invoice_items').delete().eq('invoice_id', invoiceId).then(() => {
          return supabase.from('invoice_items').insert(freshlyMappedItems);
        }),
        supabase.from('invoice_audit_logs').insert([auditRecord]),
        supabase.from('custody_movements').insert(adjMovements),
        changedCustodyAccounts.length > 0 ? supabase.from('custody_accounts').upsert(changedCustodyAccounts) : Promise.resolve()
      ]).catch(e => console.error("Supabase updateInvoice operations error:", e));
    }

    return { success: true };
  };

  // Delete invoice
  const deleteInvoice = (invoiceId: string, supervisorName: string) => {
    const invoice = invoices.find(inv => inv.id === invoiceId);
    if (!invoice || invoice.is_deleted) {
      return { success: false, error: "الفاتورة غير موجودة أو تم حذفها مسبقًا!" };
    }
    if (isInvoiceApproved(invoice) && currentUser?.role !== 'admin') {
      return { success: false, error: INVOICE_LOCKED_MSG };
    }
    if (!canEditMonth(invoice.invoice_date)) return { success: false, error: MONTH_LOCKED_MSG };
    // فاتورة قيد الموافقة: إلغاء بدون استرداد لأنها ماتخصمتش أصلًا
    if (!isInvoiceApproved(invoice)) {
      setInvoices(prev => prev.map(inv => inv.id === invoiceId ? { ...inv, is_deleted: true } : inv));
      const pendingDelAudit: InvoiceAuditLog = {
        id: generateId("log"),
        invoice_id: invoiceId,
        invoice_number: invoice.invoice_number,
        timestamp: new Date().toISOString(),
        supervisor_name: supervisorName,
        operation_type: "delete",
        old_value: `إجمالي الفاتورة الملغاة: ${invoice.total_amount} ج.م`,
        new_value: 'تم إلغاء الفاتورة وهي قيد موافقة المالية (بدون أي أثر على العهدة).'
      };
      setAuditLogs(prev => [pendingDelAudit, ...prev]);
      const sb = getSupabaseClient();
      if (sb && isCloudConnected) {
        Promise.all([
          sb.from('invoices').update({ is_deleted: true }).eq('id', invoiceId),
          sb.from('invoice_audit_logs').insert([pendingDelAudit])
        ]).catch(e => console.error("Supabase deleteInvoice (pending) error:", e));
      }
      return { success: true };
    }

    const items = invoiceItems.filter(itm => itm.invoice_id === invoiceId);

    const { refunds, newCustodyAccounts, changedCustodyAccounts, cashRefundSum, visaRefundSum } = planInvoiceRefund({ invoice, items, custodyAccounts });
    setCustodyAccounts(newCustodyAccounts);

    updateCustody(invoice.official_id, cashRefundSum, visaRefundSum);

    // Subtract from car cumulative license total cost
    if (invoice.car_id) {
      setCars(prev => prev.map(c => {
        if (c.id === invoice.car_id) {
          return { ...c, license_total_cost: Math.max(0, (c.license_total_cost || 0) - invoice.total_amount) };
        }
        return c;
      }));
    }

    setInvoices(prev => prev.map(inv => inv.id === invoiceId ? { ...inv, is_deleted: true } : inv));

    const targetCarNumber = cars.find(c => c.id === invoice.car_id)?.car_number || "غير محدد";
    const refundMovements = Object.entries(refunds).map(([accId, amt]) => {
      const acc = custodyAccounts.find(a => a.id === accId);
      return {
        id: generateId("cm"),
        official_id: invoice.official_id,
        to_account_id: accId,
        date: new Date().toISOString().split('T')[0],
        description: `استرداد مستحقات مالية كاملة عقب إلغاء وحذف الفاتورة ${invoice.invoice_number} لمركبة ${targetCarNumber} (إلى حساب ${acc?.name || 'غير محدد'})`,
        amount: amt,
        type: 'deposit' as const
      };
    });
    setCustodyMovements(prev => [...refundMovements, ...prev]);

    const auditRecord: InvoiceAuditLog = {
      id: generateId("log"),
      invoice_id: invoiceId,
      invoice_number: invoice.invoice_number,
      timestamp: new Date().toISOString(),
      supervisor_name: supervisorName,
      operation_type: "delete",
      old_value: `إجمالي الفاتورة الملغاة: ${invoice.total_amount} ج.م`,
      new_value: `تم الحذف مرسلًا كافة المبالغ المستردة للعهد المالية الفرعية التابعة للمسؤول.`
    };
    setAuditLogs(prev => [auditRecord, ...prev]);

    const supabase = getSupabaseClient();
    if (supabase && isCloudConnected) {
      Promise.all([
        supabase.from('invoices').update({ is_deleted: true }).eq('id', invoiceId),
        supabase.from('invoice_audit_logs').insert([auditRecord]),
        supabase.from('custody_movements').insert(refundMovements),
        changedCustodyAccounts.length > 0 ? supabase.from('custody_accounts').upsert(changedCustodyAccounts) : Promise.resolve()
      ]).catch(e => console.error("Supabase deleteInvoice trigger error:", e));
    }

    return { success: true };
  };

  const restoreInvoice = (invoiceId: string, supervisorName: string) => {
    const invoice = invoices.find(inv => inv.id === invoiceId);
    if (!invoice) return { success: false, error: 'لم يتم العثور على الفاتورة!' };
    if (!invoice.is_deleted) return { success: false, error: 'الفاتورة نشطة بالفعل وليست ملغاة!' };
    if (isInvoiceApproved(invoice) && currentUser?.role !== 'admin') {
      return { success: false, error: INVOICE_LOCKED_MSG };
    }
    if (!canEditMonth(invoice.invoice_date)) return { success: false, error: MONTH_LOCKED_MSG };
    // فاتورة قيد الموافقة: استعادة بدون خصم (الخصم بيحصل وقت الاعتماد)
    if (!isInvoiceApproved(invoice)) {
      setInvoices(prev => prev.map(inv => inv.id === invoiceId ? { ...inv, is_deleted: false } : inv));
      const pendingRestoreAudit: InvoiceAuditLog = {
        id: generateId("log"),
        invoice_id: invoiceId,
        invoice_number: invoice.invoice_number,
        timestamp: new Date().toISOString(),
        supervisor_name: supervisorName,
        operation_type: "create",
        old_value: "ملغاة ومحذوفة",
        new_value: 'تمت استعادة الفاتورة وهي بانتظار موافقة المالية (بدون خصم من العهدة).'
      };
      setAuditLogs(prev => [pendingRestoreAudit, ...prev]);
      const sb = getSupabaseClient();
      if (sb && isCloudConnected) {
        Promise.all([
          sb.from('invoices').update({ is_deleted: false }).eq('id', invoiceId),
          sb.from('invoice_audit_logs').insert([pendingRestoreAudit])
        ]).catch(e => console.error("Supabase restoreInvoice (pending) error:", e));
      }
      return { success: true };
    }

    const items = invoiceItems.filter(i => i.invoice_id === invoiceId);

    // Deduct from custody accounts as it was originally
    const deductions: Record<string, number> = {};
    items.forEach(itm => {
      let accId = itm.account_id || '';
      if (!accId) {
        const match = custodyAccounts.find(a => a.official_id === invoice.official_id && a.type === itm.payment_method);
        accId = match ? match.id : '';
      }
      if (accId) {
        deductions[accId] = (deductions[accId] || 0) + itm.amount;
      }
    });

    const newCustodyAccounts = custodyAccounts.map(a => {
      if (deductions[a.id]) {
        return { ...a, balance: a.balance - deductions[a.id] };
      }
      return a;
    });
    const changedCustodyAccounts = newCustodyAccounts.filter(a => deductions[a.id]);
    setCustodyAccounts(newCustodyAccounts);

    const cashChargeSum = items.filter(i => {
      let accId = i.account_id || '';
      if (!accId) {
        const match = custodyAccounts.find(ca => ca.official_id === invoice.official_id && ca.type === i.payment_method);
        accId = match ? match.id : '';
      }
      const match = custodyAccounts.find(ca => ca.id === accId);
      return match?.type === 'cash';
    }).reduce((sum, item) => sum + item.amount, 0);

    const visaChargeSum = items.filter(i => {
      let accId = i.account_id || '';
      if (!accId) {
        const match = custodyAccounts.find(ca => ca.official_id === invoice.official_id && ca.type === i.payment_method);
        accId = match ? match.id : '';
      }
      const match = custodyAccounts.find(ca => ca.id === accId);
      return match?.type !== 'cash';
    }).reduce((sum, item) => sum + item.amount, 0);

    // Update official custody balances (subtract)
    const official = officials.find(o => o.id === invoice.official_id);
    let updatedOfficial: Official | undefined;
    if (official) {
      updatedOfficial = {
        ...official,
        cash_custody: Math.max(0, official.cash_custody - cashChargeSum),
        visa_custody: Math.max(0, official.visa_custody - visaChargeSum)
      };
      setOfficials(prev => prev.map(o => o.id === invoice.official_id ? updatedOfficial! : o));
    }

    // Add back to car cumulative license total cost
    if (invoice.car_id) {
      setCars(prev => prev.map(c => {
        if (c.id === invoice.car_id) {
          return { ...c, license_total_cost: (c.license_total_cost || 0) + invoice.total_amount };
        }
        return c;
      }));
    }

    setInvoices(prev => prev.map(inv => inv.id === invoiceId ? { ...inv, is_deleted: false } : inv));

    const targetCarNumber = cars.find(c => c.id === invoice.car_id)?.car_number || "غير محدد";
    const chargeMovements = Object.entries(deductions).map(([accId, amt]) => {
      const acc = custodyAccounts.find(a => a.id === accId);
      return {
        id: generateId("cm"),
        official_id: invoice.official_id,
        from_account_id: accId,
        date: new Date().toISOString().split('T')[0],
        description: `إعادة تنشيط واستعادة الفاتورة ${invoice.invoice_number} لمركبة ${targetCarNumber} (خصم من حساب ${acc?.name || 'غير محدد'})`,
        amount: amt,
        type: 'invoice_charge' as const
      };
    });
    setCustodyMovements(prev => [...chargeMovements, ...prev]);

    const auditRecord: InvoiceAuditLog = {
      id: generateId("log"),
      invoice_id: invoiceId,
      invoice_number: invoice.invoice_number,
      timestamp: new Date().toISOString(),
      supervisor_name: supervisorName,
      operation_type: "create", // Treat as create restore
      old_value: "ملغاة ومحذوفة",
      new_value: `تم إلغاء الحذف وإعادة تفعيل الفاتورة وترحيل مصروفاتها بقيمة إجمالية ${invoice.total_amount} ج.م واستقطاعها من العهد.`
    };
    setAuditLogs(prev => [auditRecord, ...prev]);

    const supabase = getSupabaseClient();
    if (supabase && isCloudConnected) {
      Promise.all([
        supabase.from('invoices').update({ is_deleted: false }).eq('id', invoiceId),
        supabase.from('invoice_audit_logs').insert([auditRecord]),
        supabase.from('custody_movements').insert(chargeMovements),
        updatedOfficial ? supabase.from('officials').update({
          cash_custody: updatedOfficial.cash_custody,
          visa_custody: updatedOfficial.visa_custody
        }).eq('id', invoice.official_id) : Promise.resolve(),
        changedCustodyAccounts.length > 0 ? supabase.from('custody_accounts').upsert(changedCustodyAccounts) : Promise.resolve()
      ]).catch(e => console.error("Supabase restoreInvoice trigger error:", e));
    }

    return { success: true };
  };

  const purgeInvoice = (invoiceId: string, supervisorName: string): { success: boolean; error?: string } => {
    const invoice = invoices.find(inv => inv.id === invoiceId);
    if (!invoice) return { success: false, error: 'لم يتم العثور على الفاتورة!' };
    if (isInvoiceApproved(invoice) && currentUser?.role !== 'admin') {
      return { success: false, error: INVOICE_LOCKED_MSG };
    }
    if (!canEditMonth(invoice.invoice_date)) return { success: false, error: MONTH_LOCKED_MSG };

    // If the invoice is NOT deleted yet, process refund/balance corrections first
    let changedCustodyAccounts: CustodyAccount[] = [];
    let refundMovements: any[] = [];
    let updatedOfficial: Official | undefined;

    // الفاتورة قيد الموافقة ماتخصمتش من العهدة، فمفيش استرداد ليها
    if (!invoice.is_deleted && isInvoiceApproved(invoice)) {
      const items = invoiceItems.filter(itm => itm.invoice_id === invoiceId);

      const refunds: Record<string, number> = {};
      for (const item of items) {
        let accId = item.account_id || '';
        if (!accId) {
          const match = custodyAccounts.find(a => a.official_id === invoice.official_id && a.type === item.payment_method);
          accId = match ? match.id : '';
        }
        if (accId) {
          refunds[accId] = (refunds[accId] || 0) + item.amount;
        }
      }

      const newCustodyAccounts = custodyAccounts.map(a => {
        const refAmt = refunds[a.id];
        if (refAmt) {
          return { ...a, balance: a.balance + refAmt };
        }
        return a;
      });
      changedCustodyAccounts = newCustodyAccounts.filter(a => refunds[a.id]);
      setCustodyAccounts(newCustodyAccounts);

      const cashRefundSum = items.filter(i => {
        let accId = i.account_id || '';
        if (!accId) {
          const m = custodyAccounts.find(ca => ca.official_id === invoice.official_id && ca.type === i.payment_method);
          accId = m ? m.id : '';
        }
        const match = custodyAccounts.find(ca => ca.id === accId);
        return match?.type === 'cash';
      }).reduce((sum, item) => sum + item.amount, 0);

      const visaRefundSum = items.filter(i => {
        let accId = i.account_id || '';
        if (!accId) {
          const m = custodyAccounts.find(ca => ca.official_id === invoice.official_id && ca.type === i.payment_method);
          accId = m ? m.id : '';
        }
        const match = custodyAccounts.find(ca => ca.id === accId);
        return match?.type !== 'cash';
      }).reduce((sum, item) => sum + item.amount, 0);

      const officialObj = officials.find(o => o.id === invoice.official_id);
      if (officialObj) {
        updatedOfficial = {
          ...officialObj,
          cash_custody: officialObj.cash_custody + cashRefundSum,
          visa_custody: officialObj.visa_custody + visaRefundSum
        };
        setOfficials(prev => prev.map(o => o.id === invoice.official_id ? updatedOfficial! : o));
      }

      // Subtract from car cumulative license total cost
      if (invoice.car_id) {
        setCars(prev => prev.map(c => {
          if (c.id === invoice.car_id) {
            return { ...c, license_total_cost: Math.max(0, (c.license_total_cost || 0) - invoice.total_amount) };
          }
          return c;
        }));
      }

      const targetCarNumber = cars.find(c => c.id === invoice.car_id)?.car_number || "غير محدد";
      refundMovements = Object.entries(refunds).map(([accId, amt]) => {
        const acc = custodyAccounts.find(a => a.id === accId);
        return {
          id: generateId("cm"),
          official_id: invoice.official_id,
          to_account_id: accId,
          date: new Date().toISOString().split('T')[0],
          description: `استرداد مستحقات ماليّة تامة لإلغاء وحذف نهائي للفاتورة ${invoice.invoice_number} لمركبة ${targetCarNumber} (إلى حساب ${acc?.name || 'غير محدد'})`,
          amount: amt,
          type: 'deposit' as const
        };
      });
      setCustodyMovements(prev => [...refundMovements, ...prev]);
    }

    // Now, permanently delete the invoice and its items from state
    setInvoices(prev => prev.filter(inv => inv.id !== invoiceId));
    setInvoiceItems(prev => prev.filter(itm => itm.invoice_id !== invoiceId));

    // Audit Log for permanent deletion
    const auditRecord: InvoiceAuditLog = {
      id: generateId("log"),
      invoice_id: invoiceId,
      invoice_number: invoice.invoice_number,
      timestamp: new Date().toISOString(),
      supervisor_name: supervisorName,
      operation_type: "delete",
      old_value: `رقم الفاتورة: ${invoice.invoice_number}، القيمة: ${invoice.total_amount} ج.م`,
      new_value: `حذف كلي ونهائي وتام للفاتورة وبنودها من النظام نهائياً ولا تراجع فيه.`
    };
    setAuditLogs(prev => [auditRecord, ...prev]);

    const supabase = getSupabaseClient();
    if (supabase && isCloudConnected) {
      Promise.all([
        supabase.from('invoices').delete().eq('id', invoiceId),
        supabase.from('invoice_items').delete().eq('invoice_id', invoiceId),
        supabase.from('invoice_audit_logs').insert([auditRecord]),
        refundMovements.length > 0 ? supabase.from('custody_movements').insert(refundMovements) : Promise.resolve(),
        updatedOfficial ? supabase.from('officials').update({
          cash_custody: updatedOfficial.cash_custody,
          visa_custody: updatedOfficial.visa_custody
        }).eq('id', invoice.official_id) : Promise.resolve(),
        changedCustodyAccounts.length > 0 ? supabase.from('custody_accounts').upsert(changedCustodyAccounts) : Promise.resolve()
      ]).catch(e => console.error("Supabase purgeInvoice trigger error:", e));
    }

    return { success: true };
  };

  const exportLocalBackup = (): string => {
    const backupObj = {
      app: "elbanna_fleet_management",
      version: "1.0",
      timestamp: new Date().toISOString(),
      data: {
        drivers,
        officials,
        cars,
        violations,
        invoices,
        invoiceItems,
        auditLogs,
        movements,
        custodyAccounts,
        custodyMovements
      }
    };
    return JSON.stringify(backupObj, null, 2);
  };

  const importLocalBackup = (jsonData: string): { success: boolean; message: string } => {
    try {
      const parsed = JSON.parse(jsonData);
      if (!parsed || parsed.app !== "elbanna_fleet_management" || !parsed.data) {
        return { success: false, message: "صيغة ملف النسخة الاحتياطية غير صالحة أو غير متوافقة." };
      }

      const {
        drivers: importedDrivers,
        officials: importedOfficials,
        cars: importedCars,
        violations: importedViolations,
        invoices: importedInvoices,
   invoiceItems: importedInvoiceItems,
        auditLogs: importedAuditLogs,
        movements: importedMovements,
        custodyAccounts: importedCustodyAccounts,
        custodyMovements: importedCustodyMovements
      } = parsed.data;

      if (
        !Array.isArray(importedDrivers) ||
        !Array.isArray(importedOfficials) ||
        !Array.isArray(importedCars) ||
        !Array.isArray(importedViolations) ||
        !Array.isArray(importedInvoices)
      ) {
        return { success: false, message: "البيانات داخل ملف النسخة الاحتياطية تالفة أو ناقصة." };
      }

      setDrivers(importedDrivers);
      setOfficials(importedOfficials);
      setCars(importedCars);
      setViolations(importedViolations);
      setInvoices(importedInvoices);
      if (Array.isArray(importedInvoiceItems)) {
        const sorted = [...importedInvoiceItems].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
        setInvoiceItems(sorted);
      }
      if (Array.isArray(importedAuditLogs)) setAuditLogs(importedAuditLogs);
      if (Array.isArray(importedMovements)) setMovements(importedMovements);
      if (Array.isArray(importedCustodyAccounts)) setCustodyAccounts(importedCustodyAccounts);
      if (Array.isArray(importedCustodyMovements)) setCustodyMovements(importedCustodyMovements);

      localStorage.setItem('elbanna_drivers', JSON.stringify(importedDrivers));
      localStorage.setItem('elbanna_officials', JSON.stringify(importedOfficials));
      localStorage.setItem('elbanna_cars', JSON.stringify(importedCars));
      localStorage.setItem('elbanna_violations', JSON.stringify(importedViolations));
      localStorage.setItem('elbanna_invoices', JSON.stringify(importedInvoices));
      if (Array.isArray(importedInvoiceItems)) localStorage.setItem('elbanna_invoice_items', JSON.stringify(importedInvoiceItems));
      if (Array.isArray(importedAuditLogs)) localStorage.setItem('elbanna_audit_logs', JSON.stringify(importedAuditLogs));
      if (Array.isArray(importedMovements)) localStorage.setItem('elbanna_movements', JSON.stringify(importedMovements));
      if (Array.isArray(importedCustodyAccounts)) localStorage.setItem('elbanna_custody_accounts', JSON.stringify(importedCustodyAccounts));
      if (Array.isArray(importedCustodyMovements)) localStorage.setItem('elbanna_custody_movements', JSON.stringify(importedCustodyMovements));

      return { success: true, message: "تم تحميل واستيراد النسخة الاحتياطية بنجاح وتحديث كافة السجلات محلياً!" };
    } catch (e: any) {
      console.error("Backup import error:", e);
      return { success: false, message: `فشل استيراد النسخة الاحتياطية: ${e.message || e}` };
    }
  };

  // استيراد فاتورة قديمة (PDF) بدون خصم من العهدة
  const importOldInvoice = (data: {
    external_invoice_number: string;
    invoice_date: string;
    car_number: string;
    license_location: string;
    license_details: string;
    items: { description: string; amount: number }[];
    total_amount: number;
  }): { success: boolean; error?: string; invoice?: Invoice } => {
    // إيجاد السيارة من رقمها
    const car = cars.find(c => c.car_number.includes(data.car_number) || c.car_number === data.car_number);
    if (!car) {
      return { success: false, error: `لم يتم العثور على سيارة برقم "${data.car_number}"` };
    }

    // إيجاد المسؤول من السيارة
    const official = officials.find(o => o.id === car.license_official_id);
    const officialId = (currentUser?.role === 'supervisor' && currentUser?.officialId)
      ? currentUser.officialId
      : (official?.id || (officials[0]?.id || ''));

    // نظام الفواتير الموحد: رقم وتاريخ الفاتورة التلقائي من السيستم
    const sysDate = new Date().toISOString().split('T')[0];
    const invoiceNum = nextInvoiceNumber('INV-SYS-');

    const newInvoiceId = generateId('inv');
    const enrichedDetails = `${data.license_details || ''} (تفاصيل الاستيراد: فاتورة رقم ${data.external_invoice_number} تاريخ ${data.invoice_date}، نوع السيارة: ${car.car_type || 'غير محدد'})`.trim();

    const newInvoice: Invoice = {
      id: newInvoiceId,
      invoice_number: invoiceNum,
      invoice_date: sysDate,
      official_id: officialId,
      total_amount: data.total_amount,
      version: 1,
      is_modified: false,
      is_deleted: false,
      car_id: car.id,
      license_details: enrichedDetails,
      license_location: data.license_location,
      car_location: data.license_location // مكان السيارة من الفاتورة
    };

    const newItems: InvoiceItem[] = data.items.map((itm, idx) => ({
      id: generateId('item'),
      invoice_id: newInvoiceId,
      car_id: car.id,
      description: itm.description,
      amount: itm.amount,
      payment_method: 'cash' as const,
      account_id: '',
      sort_order: idx
    }));

    setInvoices(prev => [newInvoice, ...prev]);
    setInvoiceItems(prev => [...prev, ...newItems]);

    // تحديث إجمالي مصروف الترخيص على السيارة
    setCars(prev => prev.map(c => {
      if (c.id === car.id) {
        return { ...c, license_total_cost: (c.license_total_cost || 0) + data.total_amount };
      }
      return c;
    }));

    // رفع للسحابة
    const supabase = getSupabaseClient();
    if (supabase && isCloudConnected) {
      Promise.all([
        supabase.from('invoices').insert([newInvoice]),
        supabase.from('invoice_items').insert(newItems)
      ]).catch(e => console.error('importOldInvoice cloud error:', e));
    }

    return { success: true, invoice: newInvoice };
  };

  // حفظ مسودات الفواتير في Supabase (key-value بسيط في جدول مخصص)
  const saveDraftVouchers = async (drafts: any[]): Promise<void> => {
    // حفظ محلياً دائماً
    localStorage.setItem('elbanna_invoice_drafts', JSON.stringify(drafts));
    // حفظ سحابي لو متصل
    const supabase = getSupabaseClient();
    if (supabase && isCloudConnected) {
      try {
        // نستخدم جدول invoice_audit_logs كمخزن مؤقت بـ operation_type = 'draft'
        // أو نحفظ في localStorage فقط لأن Supabase ما عندوش جدول drafts
        // الحل: نحفظ كـ JSON في حقل new_value في سجل خاص
        await supabase.from('invoice_audit_logs').upsert([{
          id: 'draft_autosave_singleton',
          invoice_id: 'drafts',
          invoice_number: 'DRAFTS',
          timestamp: new Date().toISOString(),
          supervisor_name: 'system',
          operation_type: 'create',
          old_value: 'auto_draft',
          new_value: JSON.stringify(drafts)
        }]);
      } catch (e) {
        console.warn('Draft cloud save failed, kept locally:', e);
      }
    }
  };

  const loadDraftVouchers = async (): Promise<any[] | null> => {
    // حاول السحابة أولاً
    const supabase = getSupabaseClient();
    if (supabase && isCloudConnected) {
      try {
        const { data } = await supabase
          .from('invoice_audit_logs')
          .select('new_value')
          .eq('id', 'draft_autosave_singleton')
          .single();
        if (data?.new_value) {
          const parsed = JSON.parse(data.new_value);
          if (Array.isArray(parsed) && parsed.length > 0) return parsed;
        }
      } catch (e) {
        // fall through to local
      }
    }
    // جرب المحلي
    const local = localStorage.getItem('elbanna_invoice_drafts');
    if (local) {
      try { return JSON.parse(local); } catch { return null; }
    }
    return null;
  };

  const exportCloudBackup = async (): Promise<{ success: boolean; data?: string; message: string }> => {
    const supabase = getSupabaseClient();
    if (!supabase) {
      return { success: false, message: "مفاتيح ربط Supabase السحابية غير مهيأة بعد." };
    }

    try {
      const [
        resDrivers,
        resOfficials,
        resCars,
        resViolations,
        resInvoices,
        resItems,
        resLogs,
        resMovements,
        resCustodyAccs,
        resCustodyMovs,
        resTransportRequests,
        resMaintenanceRequests,
        resMaintenanceInvoices
      ] = await Promise.all([
        supabase.from('drivers').select('*'),
        supabase.from('officials').select('*'),
        supabase.from('cars').select('*'),
        supabase.from('violations').select('*').order('violation_date', { ascending: false }),
        supabase.from('invoices').select('*').order('invoice_number', { ascending: false }),
        supabase.from('invoice_items').select('*'),
        supabase.from('invoice_audit_logs').select('*').order('timestamp', { ascending: false }),
        supabase.from('driver_account_movements').select('*').order('date', { ascending: false }),
        supabase.from('custody_accounts').select('*'),
        supabase.from('custody_movements').select('*').order('date', { ascending: false }),
        supabase.from('transport_requests').select('*'),
        supabase.from('maintenance_requests').select('*'),
        supabase.from('maintenance_invoices').select('*')
      ]);

      const errors = [
        resDrivers.error, resOfficials.error, resCars.error, resViolations.error,
        resInvoices.error, resItems.error, resLogs.error, resMovements.error,
        resCustodyAccs.error, resCustodyMovs.error
      ].filter(Boolean);

      if (errors.length > 0) {
        return { success: false, message: `فشل جلب البيانات السحابية للتصدير: ${errors[0]!.message}` };
      }

      const backupObj = {
        app: "elbanna_fleet_management",
        version: "1.0",
        source: "supabase_cloud",
        timestamp: new Date().toISOString(),
        data: {
          drivers: resDrivers.data || [],
          officials: resOfficials.data || [],
          cars: resCars.data || [],
          violations: resViolations.data || [],
          invoices: resInvoices.data || [],
          invoiceItems: resItems.data || [],
          auditLogs: resLogs.data || [],
          movements: resMovements.data || [],
          custodyAccounts: resCustodyAccs.data || [],
          custodyMovements: resCustodyMovs.data || [],
          transportRequests: resTransportRequests.data || [],
          maintenanceRequests: resMaintenanceRequests.data || [],
          maintenanceInvoices: resMaintenanceInvoices.data || []
        }
      };

      return {
        success: true,
        data: JSON.stringify(backupObj, null, 2),
        message: "تم تصدير نسخة احتياطية سحابية كاملة بنجاح!"
      };
    } catch (e: any) {
      console.error("Cloud backup exception:", e);
      return { success: false, message: `فشل الاتصال بالسحابة: ${e.message || e}` };
    }
  };

  // Delete a deduction movement and reverse its effect on driver balance
  const deleteMovement = (id: string) => {
    const target = movements.find(m => m.id === id);
    if (!target || target.type !== 'deduction') return;

    const reversal = Math.abs(target.amount_change);
    setMovements(prev => prev.filter(m => m.id !== id));

    let updatedDriver: Driver | undefined;
    setDrivers(prev => prev.map(drv => {
      if (drv.id === target.driver_id) {
        const nextBalance = Math.max(0, drv.balance - reversal);
        updatedDriver = { ...drv, balance: nextBalance };
        return updatedDriver;
      }
      return drv;
    }));

    const supabase = getSupabaseClient();
    if (supabase && isCloudConnected) {
      Promise.all([
        supabase.from('driver_account_movements').delete().eq('id', id),
        updatedDriver ? supabase.from('drivers').update({ balance: updatedDriver.balance }).eq('id', updatedDriver.id) : Promise.resolve()
      ]).catch(e => console.warn('deleteMovement cloud error:', e));
    }
  };

  // Edit a deduction movement amount, adjust driver balance accordingly
  const editMovementAmount = (id: string, newAmount: number, newDescription: string) => {
    const target = movements.find(m => m.id === id);
    if (!target || target.type !== 'deduction') return;

    const oldAmount = Math.abs(target.amount_change);
    const diff = newAmount - oldAmount;

    let updatedDriver: Driver | undefined;
    setDrivers(prev => prev.map(drv => {
      if (drv.id === target.driver_id) {
        const nextBalance = Math.max(0, drv.balance + diff);
        updatedDriver = { ...drv, balance: nextBalance };
        return updatedDriver;
      }
      return drv;
    }));

    const updatedMovement: DriverAccountMovement = {
      ...target,
      amount_change: -newAmount,
      description: newDescription,
      new_balance: updatedDriver ? updatedDriver.balance : target.new_balance
    };

    setMovements(prev => prev.map(m => m.id === id ? updatedMovement : m));

    const supabase = getSupabaseClient();
    if (supabase && isCloudConnected) {
      Promise.all([
        supabase.from('driver_account_movements').update(updatedMovement).eq('id', id),
        updatedDriver ? supabase.from('drivers').update({ balance: updatedDriver.balance }).eq('id', updatedDriver.id) : Promise.resolve()
      ]).catch(e => console.warn('editMovementAmount cloud error:', e));
    }
  };

  // المسودات مخفية عن كل الشاشات والتقارير الحالية (الأرشيف والاعتماد والتكاليف والعهد) — بتظهر بس في شاشة المسودات
  const visibleInvoices = React.useMemo(() => (invoices || []).filter(i => i.approval_status !== 'draft'), [invoices]);
  const invoiceDrafts = React.useMemo(() => (invoices || []).filter(i => i.approval_status === 'draft' && !i.is_deleted), [invoices]);
  const draftIdSet = React.useMemo(() => new Set(invoiceDrafts.map(i => i.id)), [invoiceDrafts]);
  const visibleInvoiceItems = React.useMemo(() => (invoiceItems || []).filter(it => !draftIdSet.has(it.invoice_id)), [invoiceItems, draftIdSet]);
  const invoiceDraftItems = React.useMemo(() => (invoiceItems || []).filter(it => draftIdSet.has(it.invoice_id)), [invoiceItems, draftIdSet]);

  return (
    <DbContext.Provider
      value={{
        drivers: drivers || [],
        officials: officials || [],
        cars: cars || [],
        violations: violations || [],
        invoices: visibleInvoices,
        invoiceItems: visibleInvoiceItems,
        invoiceDrafts,
        invoiceDraftItems,
        auditLogs: auditLogs || [],
        movements: movements || [],
        custodyAccounts: custodyAccounts || [],
        custodyMovements: custodyMovements || [],
        transportRequests: transportRequests || [],
        farms: farms || [],
        addTransportRequest,
        updateTransportRequest,
        advanceTransportTrip,
        deleteTransportRequest,
        respondTransportRequestWithCar,
        markTransportRequestDelivered,
        maintenanceRequests: maintenanceRequests || [],
        maintenanceInvoices: maintenanceInvoices || [],
        addMaintenanceRequest,
        updateMaintenanceRequest,
        deleteMaintenanceRequest,
        addMaintenancePart,
        deleteMaintenancePart,
        openMaintenanceInvoice,
        updateMaintenanceInvoice,
        addMaintenanceInvoiceItem,
        deleteMaintenanceInvoiceItem,
        getMaintenanceCostForCarDay,
        isRealtimeActive,
        setRealtimeActive,
        latencyMs,
        isCloudConnected,
        isCloudSyncing,
        cloudError,
        setCloudError,
        testCloudConnection,
        uploadLocalDataToCloud,
        validateLocalData,
        getDataIssuesDetail,
        updateViolation,
        remapViolationsCarNumber,
        downloadCloudDataToLocal,
        addDriver,
        updateDriver,
        deleteDriver,
        addCar,
        updateCar,
        deleteCar,
        addOfficial,
        deleteOfficial,
        updateCustody,
        updateOfficialPassword,
        changeOwnPassword,
        provisionSystemUsers,
        updateOfficialName,
        addCustodyAccount,
        addCustodyFunds,
        getOfficialName,
        updateCustodyAccount,
        deleteCustodyAccount,
        transferCustody,
        addViolation,
        deleteViolation,
        applyIndividualDeduction,
        applyGroupDeductionRpc,
        deleteMovement,
        editMovementAmount,
        createInvoice,
        approveInvoice,
        returnInvoice,
        resubmitInvoice,
        getLicenseCostForCarDay,
        updateInvoice,
        deleteInvoice,
        saveInvoiceDraft,
        deleteInvoiceDraft,
        restoreInvoice,
        purgeInvoice,
        importOldInvoice,
        saveDraftVouchers,
        loadDraftVouchers,
        companies,
        hiddenCompanies,
        addCompany,
        deleteCompany,
        rolePermissions,
        updateRolePermissions,
        systemUsers,
        addSystemUser,
        updateSystemUser,
        deleteSystemUser,
        createOfficialForUser,
        systemUsersSyncError,
        defaultGarageLocation,
        updateDefaultGarageLocation,
        costItemTypes,
        addCostItemType,
        deleteCostItemType,
        vehicleFreightRates,
        updateVehicleFreightRate,
        deleteVehicleFreightRate,
        routePriceList,
        addRoutePrice,
        updateRoutePrice,
        deleteRoutePrice,
        transportRequestCosts,
        upsertTransportRequestCost,
        deleteTransportRequestCost,
        carDailyCosts,
        carMonthlyCosts,
        upsertCarMonthlyCost,
        deleteCarMonthlyCost,
        upsertCarMonthlyCostsBatch,
        restoreFromBackup,
        fuelLogs,
        upsertFuelLog,
        deleteFuelLog,
        servicePlans,
        upsertServicePlan,
        deleteServicePlan,
        markServiceDone,
        getCarOdometer,
        lockedMonths,
        isMonthLocked,
        canEditMonth,
        lockMonth,
        unlockMonth,
        upsertCarDailyCost,
        upsertCarDailyCostsBatch,
        deleteCarDailyCost,
        resetToInitial,
        exportLocalBackup,
        importLocalBackup,
        exportCloudBackup,
        currentUser,
        loginAuto,
        hasScreenPermission,
        notifications: myNotifications,
        unreadNotificationCount,
        markNotificationsRead,
        markAllNotificationsRead,
        openNotification,
        pendingNav,
        consumeNav,
        logout,
        officialCustomScreens,
        updateOfficialScreens
      }}
    >
      {children}
    </DbContext.Provider>
  );
};

export const useDb = () => {
  const context = useContext(DbContext);
  if (!context) {
    throw new Error('useDb must be used within a DbProvider');
  }

  // If the logged-in user is a supervisor, recursively filter to ensure no other supervisor's data is visible
  if (context.currentUser?.role === 'supervisor' && context.currentUser.officialId) {
    const supervisorId = context.currentUser.officialId;

    const filteredOfficials = context.officials.filter(o => o.id === supervisorId);
    
    const filteredCustodyAccounts = context.custodyAccounts.filter(ca => ca.official_id === supervisorId);
    const myAccountIds = filteredCustodyAccounts.map(ca => ca.id);

    const filteredCustodyMovements = context.custodyMovements.filter(cm => 
      cm.official_id === supervisorId || 
      (cm.from_account_id && myAccountIds.includes(cm.from_account_id)) ||
      (cm.to_account_id && myAccountIds.includes(cm.to_account_id))
    );

    // Allow supervisors to see invoices, invoice items, and audit logs for all cars in the fleet
    // to track fleet licensing costs, while keeping their custody balances and wallets strictly confidential.
    const filteredInvoices = context.invoices;
    const filteredInvoiceItems = context.invoiceItems;
    const filteredAuditLogs = context.auditLogs;

    return {
      ...context,
      officials: filteredOfficials,
      custodyAccounts: filteredCustodyAccounts,
      custodyMovements: filteredCustodyMovements,
      invoices: filteredInvoices,
      invoiceItems: filteredInvoiceItems,
      auditLogs: filteredAuditLogs
    };
  }

  return context;
};
            
