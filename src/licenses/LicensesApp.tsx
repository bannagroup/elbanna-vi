/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  Car as CarIcon, User as UserIcon, Search, Plus, LogOut, FileText, Upload, Download, Eye, Trash2, ArrowRight,
  Pencil, Loader2, RefreshCw, KeyRound, AlertTriangle, CheckCircle2, ShieldCheck,
} from 'lucide-react';
import { BUCKET, getClient, isConfigured, usernameToEmail } from './supabase';

// تطبيق التراخيص: بحث برقم السيارة (بياناتها + رخصتها وجواب التأمينات) وبحث باسم السائق (بياناته + بطاقته ورخصته).
// الملفات PDF أو صور بتتخزن في Supabase Storage، والتنزيل بيفتح رابط مؤقت (10 دقايق).

type DocType = 'car_license' | 'insurance_letter' | 'driver_id_card' | 'driver_license';
type OwnerType = 'car' | 'driver';

interface CarRow {
  id: string;
  car_number: string;
  car_type: string | null;
  brand: string | null;
  chassis_number: string | null;
  motor_number: string | null;
  owner_company: string | null;
  license_supervisor: string | null;
  license_end_date: string | null;
  car_driver_id: string | null;
  insured_driver_id: string | null;
}
interface DriverRow {
  id: string;
  name: string;
  phone: string | null;
  national_id: string | null;
  notes: string | null;
}
interface DocRow {
  id: string;
  owner_type: OwnerType;
  owner_id: string;
  doc_type: DocType;
  file_path: string;
  file_name: string | null;
  content_type: string | null;
  size_bytes: number | null;
  uploaded_at: string;
}

type View =
  | { name: 'home' }
  | { name: 'car'; id: string }
  | { name: 'driver'; id: string }
  | { name: 'carForm'; id?: string }
  | { name: 'driverForm'; id?: string; linkTo?: { carId: string; field: 'car_driver_id' | 'insured_driver_id' } };

const MAX_BYTES = 15 * 1024 * 1024;
const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';

// بحث متسامح: بيتجاهل المسافات والتشكيل، وبيوحّد الأرقام العربية والهندية وحروف (أ إ آ ا) و(ى ي) و(ة ه)
const normSearch = (s: string | null | undefined): string =>
  String(s || '')
    .replace(/[٠-٩]/g, d => String(AR_DIGITS.indexOf(d)))
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[\s\-_.]/g, '')
    .toLowerCase();

const daysLeft = (d: string | null | undefined): number | null => {
  if (!d) return null;
  const t = new Date(String(d).slice(0, 10) + 'T00:00:00').getTime();
  if (Number.isNaN(t)) return null;
  return Math.ceil((t - Date.now()) / 86400000);
};

const openExternal = (url: string) => {
  const native = !!(window as any).Capacitor?.isNativePlatform?.();
  if (native) window.location.href = url; // كاباسيتور بيفتح الروابط الخارجية في المتصفح/عارض PDF
  else window.open(url, '_blank');
};

const DOC_LABEL: Record<DocType, string> = {
  car_license: 'رخصة السيارة',
  insurance_letter: 'جواب التأمينات',
  driver_id_card: 'بطاقة السائق',
  driver_license: 'رخصة القيادة',
};

const inputCls = 'w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500';
const btnPrimary = 'bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-extrabold rounded-xl px-4 py-2.5 text-sm flex items-center justify-center gap-2 disabled:opacity-50';
const btnGhost = 'bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold rounded-xl px-4 py-2.5 text-sm flex items-center justify-center gap-2 disabled:opacity-50';
const btnDanger = 'bg-rose-950/50 hover:bg-rose-900/60 text-rose-300 border border-rose-500/30 font-bold rounded-xl px-4 py-2.5 text-sm flex items-center justify-center gap-2 disabled:opacity-50';

// ---------------------------------------------------------------------------------------------
// تسجيل الدخول
// ---------------------------------------------------------------------------------------------
const LoginScreen: React.FC<{ sb: SupabaseClient }> = ({ sb }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) {
      setError('اكتب اسم المستخدم وكلمة المرور.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const email = await usernameToEmail(username);
      const { error: err } = await sb.auth.signInWithPassword({ email, password });
      if (err) {
        const msg = String(err.message || '');
        setError(/fetch|network/i.test(msg) ? 'مفيش اتصال بالإنترنت.' : 'اسم المستخدم أو كلمة المرور غير صحيحة.');
      }
    } catch {
      setError('تعذّر تسجيل الدخول. جرّب تاني.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-5 bg-slate-950" dir="rtl">
      <form onSubmit={submit} className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4 shadow-2xl">
        <div className="text-center space-y-2">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-emerald-500 flex items-center justify-center shadow-lg">
            <ShieldCheck className="w-8 h-8 text-slate-950" />
          </div>
          <h1 className="font-black text-xl text-slate-100">تراخيص البنا</h1>
          <p className="text-xs text-emerald-400 font-semibold">السيارات والتراخيص وجوابات التأمينات</p>
        </div>
        {error && (
          <div className="bg-rose-950/50 border border-rose-500/40 text-rose-300 rounded-xl p-3 text-xs font-bold flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" /> {error}
          </div>
        )}
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-slate-400">اسم المستخدم</label>
          <input className={inputCls} value={username} onChange={e => setUsername(e.target.value)} autoComplete="username" autoCapitalize="none" />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-slate-400">كلمة المرور</label>
          <input className={inputCls} type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" />
        </div>
        <button type="submit" disabled={busy} className={btnPrimary + ' w-full'}>
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
          تسجيل الدخول
        </button>
      </form>
    </div>
  );
};

// ---------------------------------------------------------------------------------------------
// خانة ملف (رفع / عرض / تنزيل / حذف)
// ---------------------------------------------------------------------------------------------
const DocSlot: React.FC<{
  sb: SupabaseClient;
  ownerType: OwnerType;
  ownerId: string;
  docType: DocType;
  doc?: DocRow;
  onChanged: () => void;
  notify: (msg: string, ok?: boolean) => void;
}> = ({ sb, ownerType, ownerId, docType, doc, onChanged, notify }) => {
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!/^(application\/pdf|image\/)/.test(file.type)) {
      notify('الملف لازم يكون PDF أو صورة.', false);
      return;
    }
    if (file.size > MAX_BYTES) {
      notify('حجم الملف أكبر من 15 ميجا.', false);
      return;
    }
    setBusy(true);
    try {
      const ext = (file.name.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5) || 'bin';
      const path = `${ownerType}/${ownerId}/${docType}-${Date.now()}.${ext}`;
      const up = await sb.storage.from(BUCKET).upload(path, file, { contentType: file.type, upsert: false });
      if (up.error) throw up.error;
      const row = {
        owner_type: ownerType,
        owner_id: ownerId,
        doc_type: docType,
        file_path: path,
        file_name: file.name,
        content_type: file.type,
        size_bytes: file.size,
        uploaded_at: new Date().toISOString(),
      };
      const ins = await sb.from('documents').upsert(row, { onConflict: 'owner_type,owner_id,doc_type' });
      if (ins.error) {
        await sb.storage.from(BUCKET).remove([path]);
        throw ins.error;
      }
      if (doc?.file_path) await sb.storage.from(BUCKET).remove([doc.file_path]); // الملف القديم بيتشال
      notify('تم رفع الملف.');
      onChanged();
    } catch (err: any) {
      notify('تعذّر الرفع: ' + (err?.message || 'خطأ غير معروف'), false);
    } finally {
      setBusy(false);
    }
  };

  const open = async (download: boolean) => {
    if (!doc) return;
    setBusy(true);
    try {
      const { data, error } = await sb.storage
        .from(BUCKET)
        .createSignedUrl(doc.file_path, 600, download ? { download: doc.file_name || true } : undefined);
      if (error || !data?.signedUrl) throw error || new Error('تعذّر إنشاء الرابط');
      openExternal(data.signedUrl);
    } catch (err: any) {
      notify('تعذّر فتح الملف: ' + (err?.message || 'خطأ غير معروف'), false);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!doc) return;
    if (!window.confirm(`حذف ${DOC_LABEL[docType]}؟`)) return;
    setBusy(true);
    try {
      const del = await sb.from('documents').delete().eq('id', doc.id);
      if (del.error) throw del.error;
      await sb.storage.from(BUCKET).remove([doc.file_path]);
      notify('تم حذف الملف.');
      onChanged();
    } catch (err: any) {
      notify('تعذّر الحذف: ' + (err?.message || 'خطأ غير معروف'), false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-slate-950 border border-slate-800 rounded-2xl p-3.5 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <FileText className={`w-5 h-5 shrink-0 ${doc ? 'text-emerald-400' : 'text-slate-600'}`} />
          <div className="min-w-0">
            <p className="font-extrabold text-sm text-slate-100">{DOC_LABEL[docType]}</p>
            <p className="text-[11px] text-slate-500 truncate">
              {doc ? `${doc.file_name || 'ملف'} — ${String(doc.uploaded_at).slice(0, 10)}` : 'لم يتم رفع ملف'}
            </p>
          </div>
        </div>
        {busy && <Loader2 className="w-4 h-4 animate-spin text-slate-400 shrink-0" />}
      </div>
      <input ref={inputRef} type="file" accept="application/pdf,image/*" className="hidden" onChange={onFile} />
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy} onClick={() => inputRef.current?.click()} className={btnPrimary + ' flex-1 min-w-[7rem]'}>
          <Upload className="w-4 h-4" /> {doc ? 'استبدال' : 'رفع'}
        </button>
        {doc && (
          <>
            <button type="button" disabled={busy} onClick={() => open(false)} className={btnGhost}>
              <Eye className="w-4 h-4" /> عرض
            </button>
            <button type="button" disabled={busy} onClick={() => open(true)} className={btnGhost}>
              <Download className="w-4 h-4" /> تنزيل
            </button>
            <button type="button" disabled={busy} onClick={remove} className={btnDanger} aria-label="حذف الملف">
              <Trash2 className="w-4 h-4" />
            </button>
          </>
        )}
      </div>
    </div>
  );
};

const Field: React.FC<{ label: string; value?: string | null }> = ({ label, value }) => (
  <div className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2">
    <p className="text-[10px] font-bold text-slate-500">{label}</p>
    <p className="text-sm font-bold text-slate-100 break-words">{value && String(value).trim() ? value : '—'}</p>
  </div>
);

const ExpiryBadge: React.FC<{ date: string | null }> = ({ date }) => {
  const d = daysLeft(date);
  if (d === null) return <span className="text-[10px] font-bold text-slate-500">بدون تاريخ</span>;
  const cls = d < 0 ? 'bg-rose-500/15 text-rose-300 border-rose-500/40' : d <= 30 ? 'bg-amber-500/15 text-amber-300 border-amber-500/40' : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40';
  const text = d < 0 ? `منتهية من ${Math.abs(d)} يوم` : d === 0 ? 'تنتهي النهارده' : `باقي ${d} يوم`;
  return <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full border ${cls}`}>{text}</span>;
};

// ---------------------------------------------------------------------------------------------
// الشاشة الرئيسية (بعد الدخول)
// ---------------------------------------------------------------------------------------------
const MainApp: React.FC<{ sb: SupabaseClient }> = ({ sb }) => {
  const [cars, setCars] = useState<CarRow[]>([]);
  const [drivers, setDrivers] = useState<DriverRow[]>([]);
  const [docs, setDocs] = useState<DocRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [view, setView] = useState<View>({ name: 'home' });
  const [tab, setTab] = useState<'car' | 'driver'>('car');
  const [query, setQuery] = useState('');
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  const notify = useCallback((msg: string, ok: boolean = true) => {
    setToast({ msg, ok });
    window.setTimeout(() => setToast(t => (t && t.msg === msg ? null : t)), 4500);
  }, []);

  const reload = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [c, d, f] = await Promise.all([
        sb.from('cars').select('*').order('car_number'),
        sb.from('drivers').select('*').order('name'),
        sb.from('documents').select('*'),
      ]);
      if (c.error) throw c.error;
      if (d.error) throw d.error;
      if (f.error) throw f.error;
      setCars((c.data || []) as CarRow[]);
      setDrivers((d.data || []) as DriverRow[]);
      setDocs((f.data || []) as DocRow[]);
    } catch (err: any) {
      setLoadError(err?.message || 'تعذّر تحميل البيانات');
    } finally {
      setLoading(false);
    }
  }, [sb]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const docOf = (ownerType: OwnerType, ownerId: string, docType: DocType) =>
    docs.find(x => x.owner_type === ownerType && x.owner_id === ownerId && x.doc_type === docType);
  const driverById = (id: string | null) => (id ? drivers.find(d => d.id === id) : undefined);

  const carResults = useMemo(() => {
    const q = normSearch(query);
    if (!q) return cars;
    return cars.filter(c => normSearch(c.car_number).includes(q));
  }, [cars, query]);

  const driverResults = useMemo(() => {
    const q = normSearch(query);
    if (!q) return drivers;
    return drivers.filter(d => normSearch(d.name).includes(q));
  }, [drivers, query]);

  const goHome = () => setView({ name: 'home' });

  // ---- حفظ وحذف ----
  const saveCar = async (id: string | undefined, form: Partial<CarRow>): Promise<boolean> => {
    const payload = {
      car_number: (form.car_number || '').trim(),
      car_type: (form.car_type || '').trim() || null,
      brand: (form.brand || '').trim() || null,
      chassis_number: (form.chassis_number || '').trim() || null,
      motor_number: (form.motor_number || '').trim() || null,
      owner_company: (form.owner_company || '').trim() || null,
      license_supervisor: (form.license_supervisor || '').trim() || null,
      license_end_date: form.license_end_date || null,
    };
    if (!payload.car_number) {
      notify('رقم السيارة مطلوب.', false);
      return false;
    }
    const res = id ? await sb.from('cars').update(payload).eq('id', id) : await sb.from('cars').insert(payload);
    if (res.error) {
      notify(res.error.code === '23505' ? 'رقم السيارة ده موجود قبل كده.' : 'تعذّر الحفظ: ' + res.error.message, false);
      return false;
    }
    notify('تم حفظ السيارة.');
    await reload();
    return true;
  };

  const patchCar = async (id: string, patch: Partial<CarRow>) => {
    const res = await sb.from('cars').update(patch).eq('id', id);
    if (res.error) notify('تعذّر الحفظ: ' + res.error.message, false);
    else await reload();
  };

  const removeOwnerDocs = async (ownerType: OwnerType, ownerId: string) => {
    const mine = docs.filter(x => x.owner_type === ownerType && x.owner_id === ownerId);
    if (mine.length === 0) return;
    await sb.storage.from(BUCKET).remove(mine.map(x => x.file_path));
    await sb.from('documents').delete().eq('owner_type', ownerType).eq('owner_id', ownerId);
  };

  const deleteCar = async (car: CarRow) => {
    if (!window.confirm(`حذف السيارة ${car.car_number} وكل ملفاتها نهائيًا؟`)) return;
    await removeOwnerDocs('car', car.id);
    const res = await sb.from('cars').delete().eq('id', car.id);
    if (res.error) {
      notify('تعذّر الحذف: ' + res.error.message, false);
      return;
    }
    notify('تم حذف السيارة.');
    await reload();
    goHome();
  };

  const saveDriver = async (
    id: string | undefined,
    form: Partial<DriverRow>,
    linkTo?: { carId: string; field: 'car_driver_id' | 'insured_driver_id' }
  ): Promise<string | null> => {
    const payload = {
      name: (form.name || '').trim(),
      phone: (form.phone || '').trim() || null,
      national_id: (form.national_id || '').trim() || null,
      notes: (form.notes || '').trim() || null,
    };
    if (!payload.name) {
      notify('اسم السائق مطلوب.', false);
      return null;
    }
    let driverId = id || '';
    if (id) {
      const res = await sb.from('drivers').update(payload).eq('id', id);
      if (res.error) {
        notify('تعذّر الحفظ: ' + res.error.message, false);
        return null;
      }
    } else {
      const res = await sb.from('drivers').insert(payload).select('id').single();
      if (res.error || !res.data) {
        notify('تعذّر الحفظ: ' + (res.error?.message || ''), false);
        return null;
      }
      driverId = (res.data as { id: string }).id;
    }
    if (linkTo) {
      const link = await sb.from('cars').update({ [linkTo.field]: driverId }).eq('id', linkTo.carId);
      if (link.error) notify('اتحفظ السائق بس تعذّر ربطه بالسيارة.', false);
    }
    notify('تم حفظ السائق.');
    await reload();
    return driverId;
  };

  const deleteDriver = async (driver: DriverRow) => {
    if (!window.confirm(`حذف السائق ${driver.name} وكل ملفاته نهائيًا؟`)) return;
    await removeOwnerDocs('driver', driver.id);
    const res = await sb.from('drivers').delete().eq('id', driver.id);
    if (res.error) {
      notify('تعذّر الحذف: ' + res.error.message, false);
      return;
    }
    notify('تم حذف السائق.');
    await reload();
    goHome();
  };

  // ---- الشاشات ----
  const header = (title: string, back?: () => void) => (
    <div className="sticky top-0 z-10 bg-slate-900/95 backdrop-blur border-b border-slate-800 px-4 py-3 flex items-center justify-between gap-2">
      <div className="flex items-center gap-2 min-w-0">
        {back && (
          <button type="button" onClick={back} className="bg-slate-800 hover:bg-slate-700 p-2 rounded-lg shrink-0" aria-label="رجوع">
            <ArrowRight className="w-4 h-4" />
          </button>
        )}
        <h1 className="font-black text-base text-slate-100 truncate">{title}</h1>
      </div>
      {!back && (
        <div className="flex items-center gap-2 shrink-0">
          <button type="button" onClick={() => void reload()} className="bg-slate-800 hover:bg-slate-700 p-2 rounded-lg" aria-label="تحديث">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button type="button" onClick={() => void sb.auth.signOut()} className="bg-slate-800 hover:bg-slate-700 p-2 rounded-lg" aria-label="تسجيل الخروج">
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );

  const renderHome = () => (
    <>
      {header('تراخيص البنا')}
      <div className="p-4 space-y-4 max-w-3xl mx-auto">
        <div className="grid grid-cols-2 gap-2 bg-slate-900 border border-slate-800 rounded-2xl p-1.5">
          <button
            type="button"
            onClick={() => { setTab('car'); setQuery(''); }}
            className={`rounded-xl py-2.5 text-sm font-extrabold flex items-center justify-center gap-2 ${tab === 'car' ? 'bg-emerald-600 text-slate-950' : 'text-slate-300'}`}
          >
            <CarIcon className="w-4 h-4" /> بحث بالسيارة
          </button>
          <button
            type="button"
            onClick={() => { setTab('driver'); setQuery(''); }}
            className={`rounded-xl py-2.5 text-sm font-extrabold flex items-center justify-center gap-2 ${tab === 'driver' ? 'bg-emerald-600 text-slate-950' : 'text-slate-300'}`}
          >
            <UserIcon className="w-4 h-4" /> بحث بالسائق
          </button>
        </div>

        <div className="relative">
          <Search className="w-4 h-4 text-slate-500 absolute right-3 top-1/2 -translate-y-1/2" />
          <input
            className={inputCls + ' pr-9'}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder={tab === 'car' ? 'اكتب رقم السيارة (أو جزء منه)...' : 'اكتب اسم السائق...'}
          />
        </div>

        <div className="flex items-center justify-between">
          <p className="text-[11px] text-slate-500 font-bold">
            {tab === 'car' ? `${carResults.length} من ${cars.length} سيارة` : `${driverResults.length} من ${drivers.length} سائق`}
          </p>
          <button
            type="button"
            onClick={() => setView(tab === 'car' ? { name: 'carForm' } : { name: 'driverForm' })}
            className={btnGhost + ' py-1.5! px-3! text-xs'}
          >
            <Plus className="w-3.5 h-3.5" /> {tab === 'car' ? 'إضافة سيارة' : 'إضافة سائق'}
          </button>
        </div>

        {loadError && (
          <div className="bg-rose-950/50 border border-rose-500/40 text-rose-300 rounded-xl p-3 text-xs font-bold">{loadError}</div>
        )}
        {loading && cars.length === 0 && drivers.length === 0 && (
          <div className="text-center text-slate-500 py-8"><Loader2 className="w-5 h-5 animate-spin inline" /></div>
        )}

        {tab === 'car' ? (
          <div className="space-y-2">
            {carResults.map(c => {
              const drv = driverById(c.car_driver_id);
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setView({ name: 'car', id: c.id })}
                  className="w-full text-right bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-2xl p-3.5 space-y-1.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-black text-base text-slate-100">{c.car_number}</span>
                    <ExpiryBadge date={c.license_end_date} />
                  </div>
                  <p className="text-xs text-slate-400">
                    {[c.car_type, c.owner_company].filter(Boolean).join(' — ') || '—'}
                  </p>
                  <div className="flex items-center gap-3 text-[11px] text-slate-500">
                    <span className={docOf('car', c.id, 'car_license') ? 'text-emerald-400' : ''}>رخصة {docOf('car', c.id, 'car_license') ? '✓' : '✗'}</span>
                    <span className={docOf('car', c.id, 'insurance_letter') ? 'text-emerald-400' : ''}>تأمينات {docOf('car', c.id, 'insurance_letter') ? '✓' : '✗'}</span>
                    {drv && <span className="truncate">السائق: {drv.name}</span>}
                  </div>
                </button>
              );
            })}
            {!loading && carResults.length === 0 && (
              <div className="text-center text-slate-500 text-sm py-10 font-bold">مفيش سيارة بالرقم ده.</div>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {driverResults.map(d => {
              const n = cars.filter(c => c.car_driver_id === d.id || c.insured_driver_id === d.id).length;
              return (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => setView({ name: 'driver', id: d.id })}
                  className="w-full text-right bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-2xl p-3.5 space-y-1.5"
                >
                  <p className="font-black text-base text-slate-100">{d.name}</p>
                  {d.national_id && <p className="text-[11px] text-slate-500 font-mono">{d.national_id}</p>}
                  <div className="flex items-center gap-3 text-[11px] text-slate-500">
                    <span className={docOf('driver', d.id, 'driver_id_card') ? 'text-emerald-400' : ''}>بطاقة {docOf('driver', d.id, 'driver_id_card') ? '✓' : '✗'}</span>
                    <span className={docOf('driver', d.id, 'driver_license') ? 'text-emerald-400' : ''}>رخصة {docOf('driver', d.id, 'driver_license') ? '✓' : '✗'}</span>
                    <span>{n} سيارة</span>
                  </div>
                </button>
              );
            })}
            {!loading && driverResults.length === 0 && (
              <div className="text-center text-slate-500 text-sm py-10 font-bold">مفيش سائق بالاسم ده.</div>
            )}
          </div>
        )}
      </div>
    </>
  );

  const renderCar = (id: string) => {
    const car = cars.find(c => c.id === id);
    if (!car) return <>{header('السيارة', goHome)}<p className="p-6 text-center text-slate-400">السيارة مش موجودة.</p></>;
    return (
      <>
        {header(car.car_number, goHome)}
        <div className="p-4 space-y-4 max-w-3xl mx-auto">
          <div className="flex items-center justify-between gap-2">
            <ExpiryBadge date={car.license_end_date} />
            <div className="flex gap-2">
              <button type="button" onClick={() => setView({ name: 'carForm', id: car.id })} className={btnGhost + ' py-1.5! px-3! text-xs'}>
                <Pencil className="w-3.5 h-3.5" /> تعديل
              </button>
              <button type="button" onClick={() => void deleteCar(car)} className={btnDanger + ' py-1.5! px-3! text-xs'}>
                <Trash2 className="w-3.5 h-3.5" /> حذف
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Field label="رقم السيارة" value={car.car_number} />
            <Field label="النوع" value={car.car_type} />
            <Field label="الشاسيه" value={car.chassis_number} />
            <Field label="رقم الموتور" value={car.motor_number} />
            <Field label="الشركة المالكة" value={car.owner_company} />
            <Field label="مشرف الترخيص" value={car.license_supervisor} />
            <Field label="تاريخ الانتهاء" value={car.license_end_date ? String(car.license_end_date).slice(0, 10) : null} />
            {car.brand && <Field label="الماركة" value={car.brand} />}
          </div>

          <div className="space-y-3">
            {(['car_driver_id', 'insured_driver_id'] as const).map(field => (
              <div key={field} className="bg-slate-900 border border-slate-800 rounded-2xl p-3.5 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <label className="text-xs font-extrabold text-slate-300">{field === 'car_driver_id' ? 'سائق السيارة' : 'السائق المؤمن عليه'}</label>
                  <button type="button" onClick={() => setView({ name: 'driverForm', linkTo: { carId: car.id, field } })} className="text-[11px] font-bold text-emerald-400 flex items-center gap-1">
                    <Plus className="w-3 h-3" /> سائق جديد
                  </button>
                </div>
                <select
                  className={inputCls}
                  value={car[field] || ''}
                  onChange={e => void patchCar(car.id, { [field]: e.target.value || null } as Partial<CarRow>)}
                >
                  <option value="">غير محدد</option>
                  {drivers.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
                {car[field] && (
                  <button type="button" onClick={() => setView({ name: 'driver', id: car[field] as string })} className="text-[11px] font-bold text-slate-400 underline">
                    فتح بيانات السائق
                  </button>
                )}
              </div>
            ))}
          </div>

          <div className="space-y-3">
            <h2 className="font-black text-sm text-slate-300">الملفات</h2>
            <DocSlot sb={sb} ownerType="car" ownerId={car.id} docType="car_license" doc={docOf('car', car.id, 'car_license')} onChanged={() => void reload()} notify={notify} />
            <DocSlot sb={sb} ownerType="car" ownerId={car.id} docType="insurance_letter" doc={docOf('car', car.id, 'insurance_letter')} onChanged={() => void reload()} notify={notify} />
          </div>
        </div>
      </>
    );
  };

  const renderDriver = (id: string) => {
    const d = drivers.find(x => x.id === id);
    if (!d) return <>{header('السائق', goHome)}<p className="p-6 text-center text-slate-400">السائق مش موجود.</p></>;
    const driving = cars.filter(c => c.car_driver_id === d.id);
    const insured = cars.filter(c => c.insured_driver_id === d.id);
    const carBtn = (c: CarRow) => (
      <button key={c.id} type="button" onClick={() => setView({ name: 'car', id: c.id })} className="w-full text-right bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm font-bold text-slate-100 flex items-center justify-between">
        <span>{c.car_number}</span>
        <ExpiryBadge date={c.license_end_date} />
      </button>
    );
    return (
      <>
        {header(d.name, goHome)}
        <div className="p-4 space-y-4 max-w-3xl mx-auto">
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setView({ name: 'driverForm', id: d.id })} className={btnGhost + ' py-1.5! px-3! text-xs'}>
              <Pencil className="w-3.5 h-3.5" /> تعديل
            </button>
            <button type="button" onClick={() => void deleteDriver(d)} className={btnDanger + ' py-1.5! px-3! text-xs'}>
              <Trash2 className="w-3.5 h-3.5" /> حذف
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="الاسم" value={d.name} />
            <Field label="التليفون" value={d.phone} />
            <Field label="الرقم القومي" value={d.national_id} />
            <Field label="ملاحظات" value={d.notes} />
          </div>
          {driving.length > 0 && (
            <div className="space-y-2">
              <h2 className="font-black text-sm text-slate-300">سائق على السيارات</h2>
              {driving.map(carBtn)}
            </div>
          )}
          {insured.length > 0 && (
            <div className="space-y-2">
              <h2 className="font-black text-sm text-slate-300">مؤمن عليه على السيارات</h2>
              {insured.map(carBtn)}
            </div>
          )}
          <div className="space-y-3">
            <h2 className="font-black text-sm text-slate-300">الملفات</h2>
            <DocSlot sb={sb} ownerType="driver" ownerId={d.id} docType="driver_id_card" doc={docOf('driver', d.id, 'driver_id_card')} onChanged={() => void reload()} notify={notify} />
            <DocSlot sb={sb} ownerType="driver" ownerId={d.id} docType="driver_license" doc={docOf('driver', d.id, 'driver_license')} onChanged={() => void reload()} notify={notify} />
          </div>
        </div>
      </>
    );
  };

  const renderCarForm = (id?: string) => {
    const existing = id ? cars.find(c => c.id === id) : undefined;
    return (
      <CarForm
        key={id || 'new'}
        initial={existing}
        header={header(existing ? 'تعديل سيارة' : 'إضافة سيارة', () => setView(existing ? { name: 'car', id: existing.id } : { name: 'home' }))}
        onSave={async form => {
          const ok = await saveCar(id, form);
          if (ok) setView(existing ? { name: 'car', id: existing.id } : { name: 'home' });
        }}
      />
    );
  };

  const renderDriverForm = (v: Extract<View, { name: 'driverForm' }>) => {
    const existing = v.id ? drivers.find(d => d.id === v.id) : undefined;
    const back = () => setView(v.linkTo ? { name: 'car', id: v.linkTo.carId } : existing ? { name: 'driver', id: existing.id } : { name: 'home' });
    return (
      <DriverForm
        key={v.id || 'new'}
        initial={existing}
        header={header(existing ? 'تعديل سائق' : 'إضافة سائق', back)}
        onSave={async form => {
          const savedId = await saveDriver(v.id, form, v.linkTo);
          if (savedId) setView(v.linkTo ? { name: 'car', id: v.linkTo.carId } : { name: 'driver', id: savedId });
        }}
      />
    );
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100" dir="rtl">
      {view.name === 'home' && renderHome()}
      {view.name === 'car' && renderCar(view.id)}
      {view.name === 'driver' && renderDriver(view.id)}
      {view.name === 'carForm' && renderCarForm(view.id)}
      {view.name === 'driverForm' && renderDriverForm(view)}
      {toast && (
        <div className={`fixed bottom-5 left-4 right-4 z-50 max-w-md mx-auto rounded-2xl px-4 py-3 text-sm font-bold flex items-center gap-2 shadow-2xl border ${toast.ok ? 'bg-emerald-950 border-emerald-500/50 text-emerald-200' : 'bg-rose-950 border-rose-500/50 text-rose-200'}`}>
          {toast.ok ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertTriangle className="w-4 h-4 shrink-0" />}
          {toast.msg}
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------------------------
// نماذج الإضافة والتعديل
// ---------------------------------------------------------------------------------------------
const FormRow: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="space-y-1.5">
    <label className="text-xs font-bold text-slate-400">{label}</label>
    {children}
  </div>
);

const CarForm: React.FC<{ initial?: CarRow; header: React.ReactNode; onSave: (form: Partial<CarRow>) => Promise<void> }> = ({ initial, header, onSave }) => {
  const [f, setF] = useState<Partial<CarRow>>(initial || {});
  const [busy, setBusy] = useState(false);
  const set = (k: keyof CarRow, v: string) => setF(prev => ({ ...prev, [k]: v }));
  return (
    <>
      {header}
      <div className="p-4 space-y-3 max-w-3xl mx-auto">
        <FormRow label="رقم السيارة *"><input className={inputCls} value={f.car_number || ''} onChange={e => set('car_number', e.target.value)} /></FormRow>
        <FormRow label="النوع"><input className={inputCls} value={f.car_type || ''} onChange={e => set('car_type', e.target.value)} placeholder="ملاكي / جامبو / أتوبيس..." /></FormRow>
        <FormRow label="الشاسيه"><input className={inputCls} value={f.chassis_number || ''} onChange={e => set('chassis_number', e.target.value)} /></FormRow>
        <FormRow label="رقم الموتور"><input className={inputCls} value={f.motor_number || ''} onChange={e => set('motor_number', e.target.value)} /></FormRow>
        <FormRow label="الشركة المالكة"><input className={inputCls} value={f.owner_company || ''} onChange={e => set('owner_company', e.target.value)} /></FormRow>
        <FormRow label="مشرف الترخيص"><input className={inputCls} value={f.license_supervisor || ''} onChange={e => set('license_supervisor', e.target.value)} /></FormRow>
        <FormRow label="تاريخ الانتهاء"><input className={inputCls} type="date" value={f.license_end_date ? String(f.license_end_date).slice(0, 10) : ''} onChange={e => set('license_end_date', e.target.value)} /></FormRow>
        <button
          type="button"
          disabled={busy}
          onClick={async () => { setBusy(true); try { await onSave(f); } finally { setBusy(false); } }}
          className={btnPrimary + ' w-full'}
        >
          {busy && <Loader2 className="w-4 h-4 animate-spin" />} حفظ
        </button>
      </div>
    </>
  );
};

const DriverForm: React.FC<{ initial?: DriverRow; header: React.ReactNode; onSave: (form: Partial<DriverRow>) => Promise<void> }> = ({ initial, header, onSave }) => {
  const [f, setF] = useState<Partial<DriverRow>>(initial || {});
  const [busy, setBusy] = useState(false);
  const set = (k: keyof DriverRow, v: string) => setF(prev => ({ ...prev, [k]: v }));
  return (
    <>
      {header}
      <div className="p-4 space-y-3 max-w-3xl mx-auto">
        <FormRow label="اسم السائق *"><input className={inputCls} value={f.name || ''} onChange={e => set('name', e.target.value)} /></FormRow>
        <FormRow label="التليفون"><input className={inputCls} inputMode="tel" value={f.phone || ''} onChange={e => set('phone', e.target.value)} /></FormRow>
        <FormRow label="الرقم القومي"><input className={inputCls} inputMode="numeric" value={f.national_id || ''} onChange={e => set('national_id', e.target.value)} /></FormRow>
        <FormRow label="ملاحظات"><input className={inputCls} value={f.notes || ''} onChange={e => set('notes', e.target.value)} /></FormRow>
        <button
          type="button"
          disabled={busy}
          onClick={async () => { setBusy(true); try { await onSave(f); } finally { setBusy(false); } }}
          className={btnPrimary + ' w-full'}
        >
          {busy && <Loader2 className="w-4 h-4 animate-spin" />} حفظ
        </button>
      </div>
    </>
  );
};

// ---------------------------------------------------------------------------------------------
// الجذر: حالة الدخول
// ---------------------------------------------------------------------------------------------
export default function LicensesApp() {
  const sb = getClient();
  const [ready, setReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    if (!sb) return;
    let alive = true;
    sb.auth.getSession().then(({ data }) => {
      if (!alive) return;
      setSignedIn(!!data.session);
      setReady(true);
    });
    const { data: sub } = sb.auth.onAuthStateChange((_event, session) => setSignedIn(!!session));
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, [sb]);

  if (!isConfigured || !sb) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-slate-950 text-slate-200 text-center" dir="rtl">
        <p className="font-bold text-sm leading-relaxed">التطبيق مش مربوط بقاعدة البيانات.<br />لازم يتضبط VITE_LICENSES_SUPABASE_URL و VITE_LICENSES_SUPABASE_KEY وقت البناء.</p>
      </div>
    );
  }
  if (!ready) {
    return <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-500"><Loader2 className="w-6 h-6 animate-spin" /></div>;
  }
  return signedIn ? <MainApp sb={sb} /> : <LoginScreen sb={sb} />;
}
