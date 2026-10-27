/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { escapeHtml } from '../utils/escapeHtml';
import React, { useMemo, useState } from 'react';
import { useNavFocus } from '../hooks/useNavFocus';
import { useDb } from '../db/store';
import { TransportRequest, TransportRouteLegSmoke } from '../types';
import { printHtmlDocument } from '../utils/printHtml';
import {
  Search,
  CalendarDays,
  Route,
  Truck,
  User,
  ClipboardList,
  X,
  Save,
  Sparkles,
  CheckCircle,
  Printer,
  Wind,
} from 'lucide-react';

const num = (v: string) => {
  const n = parseFloat(v);
  return isNaN(n) ? 0 : n;
};

// تاريخ التنفيذ هو المعتمد في حساب خطوط السير — لو لسه مفيش تاريخ تنفيذ (الطلب لسه جاري)
// بنستخدم تاريخ الطلب مؤقتًا عشان الشاشة تفضل مفيدة قبل التسليم النهائي
const effectiveDate = (r: TransportRequest) => r.execution_date || r.request_date;

// خط سير الطلب الكامل بالترتيب: المزرعة ← الواجهات
const requestChain = (r: TransportRequest): string[] => [r.farm_name, ...(r.destinations || [])];

export function RouteAccountingTab() {
  const db = useDb();

  const [searchTerm, setSearchTerm] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [editingRequestId, setEditingRequestId] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const showToast = (text: string) => {
    setToastMsg(text);
    setTimeout(() => setToastMsg(null), 3500);
  };

  // فتح نافذة تسجيل دخان الرحلة مباشرة من إشعار انتهاء الرحلة
  useNavFocus('route_accounting', (nav) => {
    if (nav.entityType !== 'transport') return;
    const target = db.transportRequests.find(r => r.id === nav.entityId);
    if (!target || !target.assigned_car_id) { showToast('الطلب ده مش جاهز لحساب خط السير (مفيش سيارة مرتبطة بيه).'); return; }
    setEditingRequestId(target.id);
  });

  const driverNameFor = (driverId?: string) => {
    if (!driverId) return 'بدون سائق';
    return db.drivers.find(d => d.id === driverId)?.name || 'بدون سائق';
  };
  const carFor = (carId?: string) => db.cars.find(c => c.id === carId);
  const costFor = (requestId: string) => db.transportRequestCosts.find(c => c.request_id === requestId);
  const smokeTotalFor = (requestId: string) => {
    const cost = costFor(requestId);
    return cost ? cost.legs.reduce((s, l) => s + (l.smoke_amount || 0), 0) : 0;
  };

  // الطلبات المؤهلة: اترد عليها بسيارة (جارية أو منتهية)
  const eligibleRequests = useMemo(
    () => db.transportRequests.filter(r => !!r.assigned_car_id),
    [db.transportRequests]
  );

  const filteredRequests = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return eligibleRequests.filter(r => {
      const d = effectiveDate(r);
      if (dateFrom && d < dateFrom) return false;
      if (dateTo && d > dateTo) return false;
      if (!term) return true;
      const car = carFor(r.assigned_car_id);
      const driverName = driverNameFor(r.assigned_driver_id).toLowerCase();
      const carNumber = (car?.car_number || '').toLowerCase();
      return driverName.includes(term) || carNumber.includes(term);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eligibleRequests, searchTerm, dateFrom, dateTo, db.cars, db.drivers]);

  // تجميع الطلبات حسب (السيارة + تاريخ التنفيذ) — دي الوحدة المحاسبية الجديدة
  type DayGroup = {
    carId: string;
    date: string;
    requests: TransportRequest[];
  };
  const groups: DayGroup[] = useMemo(() => {
    const map = new Map<string, DayGroup>();
    filteredRequests.forEach(r => {
      const key = `${r.assigned_car_id}__${effectiveDate(r)}`;
      if (!map.has(key)) map.set(key, { carId: r.assigned_car_id!, date: effectiveDate(r), requests: [] });
      map.get(key)!.requests.push(r);
    });
    return Array.from(map.values()).sort((a, b) => (b.date < a.date ? -1 : b.date > a.date ? 1 : 0));
  }, [filteredRequests]);

  const dailyCostFor = (carId: string, date: string) => db.carDailyCosts.find(c => c.car_id === carId && c.date === date);

  const groupTotals = (g: DayGroup) => {
    const smoke = g.requests.reduce((s, r) => s + smokeTotalFor(r.id), 0);
    const daily = dailyCostFor(g.carId, g.date);
    const freight = daily?.freight_amount || 0;
    // تكلفة الصيانة دايمًا حية من فواتير الصيانة الفعلية، بغض النظر عن وجود سجل مصاريف يومية
    // من عدمه — مش معتمدة على حفظ شاشة المصاريف اليومية (مصدر واحد، بدون ازدواج)
    const maintenanceCost = db.getMaintenanceCostForCarDay(g.carId, g.date);
    const others = (daily ? (daily.cards_amount || 0) + (daily.violations_amount || 0) + (daily.tire_wash_amount || 0)
      + (daily.extra_costs || []).reduce((s, i) => s + (i.amount || 0), 0) : 0) + maintenanceCost;
    return { smoke, freight, others, grand: smoke + freight + others, hasDaily: !!daily, distance: daily?.total_distance_km || 0 };
  };

  const overallTotals = useMemo(() => {
    let smoke = 0, freight = 0, others = 0;
    groups.forEach(g => {
      const t = groupTotals(g);
      smoke += t.smoke; freight += t.freight; others += t.others;
    });
    return { smoke, freight, others, grand: smoke + freight + others };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups, db.carDailyCosts, db.transportRequestCosts]);

  const clearFilters = () => { setSearchTerm(''); setDateFrom(''); setDateTo(''); };

  const handlePrintStatement = () => {
    const rows = groups.map(g => {
      const car = carFor(g.carId);
      const drivers = Array.from(new Set(g.requests.map(r => driverNameFor(r.assigned_driver_id)))).join(' / ');
      const t = groupTotals(g);
      return { g, car, drivers, t };
    });
    const grand = rows.reduce((s, x) => s + x.t.grand, 0);
    const filterLabel = [
      searchTerm ? `بحث: ${searchTerm}` : '',
      dateFrom ? `من: ${dateFrom}` : '',
      dateTo ? `إلى: ${dateTo}` : '',
    ].filter(Boolean).join(' — ') || 'كل الطلبات';

    const html = `
      <!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="UTF-8"><title>كشف حساب خطوط السير</title>
      <style>
        body { font-family: 'Calibri','Cairo',Arial,sans-serif; direction: rtl; background:#fff; color:#111; font-size:12px; padding:24px; }
        h1 { font-size:18px; margin:0 0 4px; } .sub { color:#555; font-size:11px; margin-bottom:16px; }
        table { width:100%; border-collapse:collapse; font-size:11px; }
        th,td { border:1px solid #ccc; padding:6px 8px; text-align:center; }
        th { background:#f1f5f9; font-weight:900; } tfoot td { font-weight:900; background:#f8fafc; }
        .route { text-align:right; } @media print { body{padding:0;} }
      </style></head><body>
        <h1>كشف حساب خطوط السير (لكل سيارة/يوم)</h1>
        <div class="sub">${escapeHtml(filterLabel)} — تاريخ الطباعة: ${new Date().toLocaleDateString('ar-EG')} — عدد السجلات: ${rows.length}</div>
        <table><thead><tr>
          <th>التاريخ</th><th>السيارة</th><th>السائق</th><th>المسافة</th><th>دخان</th><th>نولون</th><th>بنود أخرى</th><th>الإجمالي</th>
        </tr></thead><tbody>
          ${rows.map(x => `<tr>
            <td>${escapeHtml(x.g.date)}</td><td>${escapeHtml(x.car?.car_number || '-')}</td><td>${escapeHtml(x.drivers)}</td>
            <td>${x.t.distance.toLocaleString()} كم</td><td>${x.t.smoke.toLocaleString()}</td>
            <td>${x.t.freight.toLocaleString()}</td><td>${x.t.others.toLocaleString()}</td>
            <td>${x.t.grand.toLocaleString()}</td>
          </tr>`).join('')}
        </tbody><tfoot><tr><td colspan="7">الإجمالي الكلي</td><td>${grand.toLocaleString()} ج.م</td></tr></tfoot></table>
      </body></html>
    `;
    printHtmlDocument(html, { title: 'كشف حساب خطوط السير', features: 'width=1100,height=700' });
  };

  return (
    <div className="space-y-6" id="route_accounting_tab_view" style={{ direction: 'rtl' }}>

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <span className="text-xs font-bold text-emerald-600 tracking-wider block uppercase mb-1">الإدارة المالية</span>
          <h2 className="text-xl md:text-2xl font-black text-slate-800 font-sans tracking-tight">حساب خطوط السير</h2>
          <p className="text-xs text-slate-500 mt-1 leading-relaxed">
            مجمّعة حسب السيارة وتاريخ التنفيذ. الدخان بيتسجل لكل طلب من هنا — النولون والمصاريف اليومية (كارتات/مخالفات/غسيل كاوتش/صيانة) بتتسجل من شاشة "تسجيل مصاريف وأرباح السيارات اليومية".
          </p>
        </div>
      </div>

      {toastMsg && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-2xl p-3.5 flex items-center gap-2.5 text-xs font-bold">
          <CheckCircle className="w-4 h-4 shrink-0" /> {toastMsg}
        </div>
      )}

      <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow px-6 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-[1fr,180px,180px,auto,auto] gap-3">
          <div>
            <label className="block text-slate-500 font-bold mb-1 text-xs flex items-center gap-1"><Search className="w-3.5 h-3.5" /> البحث بالسائق أو رقم السيارة</label>
            <input type="text" placeholder="اكتب اسم السائق أو رقم السيارة..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full p-2.5 rounded-lg border border-slate-205 focus:outline-none focus:border-emerald-500 text-slate-800 font-bold bg-white" />
          </div>
          <div>
            <label className="block text-slate-500 font-bold mb-1 text-xs flex items-center gap-1"><CalendarDays className="w-3.5 h-3.5" /> من تاريخ تنفيذ</label>
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-full p-2.5 rounded-lg border border-slate-205 focus:outline-none focus:border-emerald-500 text-slate-800 font-mono bg-white" />
          </div>
          <div>
            <label className="block text-slate-500 font-bold mb-1 text-xs flex items-center gap-1"><CalendarDays className="w-3.5 h-3.5" /> إلى تاريخ تنفيذ</label>
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-full p-2.5 rounded-lg border border-slate-205 focus:outline-none focus:border-emerald-500 text-slate-800 font-mono bg-white" />
          </div>
          <div className="flex items-end">
            <button type="button" onClick={clearFilters} className="w-full md:w-auto bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-xs px-4 py-2.5 rounded-lg flex items-center gap-1.5 justify-center">
              <X className="w-3.5 h-3.5" /> مسح الفلاتر
            </button>
          </div>
          <div className="flex items-end">
            <button type="button" onClick={handlePrintStatement} disabled={groups.length === 0}
              className="w-full md:w-auto bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-200 text-white font-bold text-xs px-4 py-2.5 rounded-lg flex items-center gap-1.5 justify-center">
              <Printer className="w-3.5 h-3.5" /> طباعة كشف
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm text-center">
          <p className="text-[11px] text-slate-500 font-bold">عدد سجلات سيارة/يوم</p>
          <p className="text-lg font-black text-slate-800">{groups.length}</p>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm text-center">
          <p className="text-[11px] text-slate-500 font-bold">إجمالي الدخان</p>
          <p className="text-lg font-black text-amber-600">{overallTotals.smoke.toLocaleString()} ج.م</p>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm text-center">
          <p className="text-[11px] text-slate-500 font-bold">إجمالي النولون</p>
          <p className="text-lg font-black text-indigo-600">{overallTotals.freight.toLocaleString()} ج.م</p>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm text-center">
          <p className="text-[11px] text-slate-500 font-bold">إجمالي كل التكاليف</p>
          <p className="text-lg font-black text-slate-800">{overallTotals.grand.toLocaleString()} ج.م</p>
        </div>
      </div>

      <div className="space-y-3">
        {groups.map(g => {
          const car = carFor(g.carId);
          const drivers = Array.from(new Set(g.requests.map(r => driverNameFor(r.assigned_driver_id)))).join(' / ');
          const t = groupTotals(g);
          const fullChain = ['الجراج', ...g.requests.flatMap(r => requestChain(r)), 'الجراج'];
          return (
            <div key={`${g.carId}__${g.date}`} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="font-mono font-black text-slate-800 text-sm flex items-center gap-1.5"><CalendarDays className="w-4 h-4 text-slate-400" /> {g.date}</span>
                  <span className="font-bold text-slate-700 flex items-center gap-1.5"><Truck className="w-4 h-4 text-slate-400" /> {car?.car_number || '-'} <span className="text-slate-400 font-normal">({car?.car_type || '-'})</span></span>
                  <span className="font-bold text-slate-700 flex items-center gap-1.5"><User className="w-4 h-4 text-slate-400" /> {drivers}</span>
                </div>
                <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full border ${t.hasDaily ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>
                  {t.hasDaily ? 'مصاريف اليوم مسجلة' : 'لسه ماتسجلتش مصاريف اليوم'}
                </span>
              </div>

              <p className="text-[11px] text-slate-500 flex items-start gap-1.5 mb-3">
                <Route className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" /> {fullChain.join(' ← ')}
              </p>

              {/* الطلبات التفصيلية وتسجيل الدخان لكل واحد */}
              <div className="space-y-1.5 mb-3">
                {g.requests.map(r => (
                  <div key={r.id} className="flex items-center justify-between gap-2 bg-slate-50 rounded-lg px-3 py-2 text-[11px]">
                    <span className="font-mono text-slate-500">{r.request_number}</span>
                    <span className="text-slate-600 flex-1 px-2">{requestChain(r).join(' ← ')}</span>
                    <span className="text-amber-600 font-bold flex items-center gap-1"><Wind className="w-3.5 h-3.5" /> {smokeTotalFor(r.id).toLocaleString()} ج.م</span>
                    <button type="button" onClick={() => setEditingRequestId(r.id)} className="bg-amber-500 hover:bg-amber-400 text-white px-2.5 py-1 rounded text-[10px] font-bold">تسجيل الدخان</button>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-center border-t border-slate-100 pt-3">
                <div><p className="text-[10px] text-slate-400 font-bold">المسافة</p><p className="font-bold text-slate-700">{t.distance.toLocaleString()} كم</p></div>
                <div><p className="text-[10px] text-slate-400 font-bold">دخان</p><p className="font-bold text-amber-600">{t.smoke.toLocaleString()} ج.م</p></div>
                <div><p className="text-[10px] text-slate-400 font-bold">نولون</p><p className="font-bold text-indigo-600">{t.freight.toLocaleString()} ج.م</p></div>
                <div><p className="text-[10px] text-slate-400 font-bold">بنود أخرى</p><p className="font-bold text-slate-600">{t.others.toLocaleString()} ج.م</p></div>
                <div><p className="text-[10px] text-slate-400 font-bold">الإجمالي</p><p className="font-black text-slate-800">{t.grand.toLocaleString()} ج.م</p></div>
              </div>
            </div>
          );
        })}
        {groups.length === 0 && (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-10 text-center text-slate-400 font-bold">
            <ClipboardList className="w-8 h-8 mx-auto mb-2 text-slate-300" />
            لا توجد طلبات مطابقة لعوامل البحث أو الفلترة الحالية.
          </div>
        )}
      </div>

      {editingRequestId && (() => {
        const req = db.transportRequests.find(r => r.id === editingRequestId);
        if (!req) return null;
        return (
          <SmokeEditModal
            request={req}
            onClose={() => setEditingRequestId(null)}
            onSaved={() => { setEditingRequestId(null); showToast('تم حفظ دخان الطلب بنجاح.'); }}
          />
        );
      })()}
    </div>
  );
}

// مودال تسجيل الدخان لكل محطة في خط سير طلب معين (من لائحة خطوط السير + تعديل يدوي)
function SmokeEditModal({ request, onClose, onSaved }: { request: TransportRequest; onClose: () => void; onSaved: () => void }) {
  const db = useDb();
  const existing = db.transportRequestCosts.find(c => c.request_id === request.id);
  const chain = requestChain(request);
  const initialLegs: TransportRouteLegSmoke[] = chain.slice(1).map((to, idx) => {
    const from = chain[idx];
    const existingLeg = existing?.legs.find(l => l.from_location === from && l.to_location === to);
    return { from_location: from, to_location: to, smoke_amount: existingLeg?.smoke_amount || 0 };
  });
  const [legs, setLegs] = useState<TransportRouteLegSmoke[]>(initialLegs);

  const matchRoute = (from: string, to: string) => db.routePriceList.find(r => r.from_location.trim() === from.trim() && r.to_location.trim() === to.trim());

  const total = legs.reduce((s, l) => s + (l.smoke_amount || 0), 0);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    db.upsertTransportRequestCost(request.id, { legs });
    onSaved();
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" style={{ direction: 'rtl' }}>
      <div className="bg-white rounded-2xl shadow-2xl max-w-xl w-full border border-slate-200 overflow-hidden text-right max-h-[92vh] flex flex-col">
        <div className="bg-gradient-to-r from-amber-500 to-amber-400 text-white p-4 flex items-center justify-between gap-2.5 shrink-0">
          <div className="flex items-center gap-2.5">
            <Wind className="w-6 h-6" />
            <div>
              <h4 className="font-extrabold text-sm md:text-base">تسجيل دخان الطلب {request.request_number}</h4>
              <p className="text-[10px] text-amber-50">{chain.join(' ← ')}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="text-white/80 hover:text-white"><X className="w-5 h-5" /></button>
        </div>

        <form onSubmit={handleSave} className="p-6 space-y-3 text-xs font-sans overflow-y-auto">
          {legs.map((leg, idx) => {
            const matched = matchRoute(leg.from_location, leg.to_location);
            return (
              <div key={idx} className="bg-slate-50 border border-slate-100 rounded-xl p-3 space-y-2">
                <p className="font-bold text-slate-700 flex items-center gap-1.5"><Route className="w-3.5 h-3.5 text-amber-500" /> {leg.from_location} ← {leg.to_location}</p>
                {matched && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-2 flex items-center justify-between gap-2 text-amber-800 font-bold text-[11px]">
                    <span className="flex items-center gap-1"><Sparkles className="w-3 h-3" /> دخان مقترح من الإعدادات: {matched.smoke_amount} ج.م</span>
                    <button type="button" onClick={() => setLegs(prev => prev.map((l, i) => i === idx ? { ...l, smoke_amount: matched.smoke_amount } : l))} className="bg-amber-500 hover:bg-amber-400 text-white px-2 py-0.5 rounded text-[10px]">تطبيق</button>
                  </div>
                )}
                <input
                  type="number" step="0.01" min="0"
                  value={leg.smoke_amount || ''}
                  onChange={(e) => setLegs(prev => prev.map((l, i) => i === idx ? { ...l, smoke_amount: num(e.target.value) } : l))}
                  placeholder="مبلغ الدخان"
                  className="w-full p-2.5 rounded-lg border border-slate-200 focus:outline-none focus:border-amber-500 text-slate-800 font-mono font-bold"
                />
              </div>
            );
          })}

          <div className="bg-slate-800 text-white rounded-xl p-4 flex items-center justify-between">
            <span className="font-extrabold text-sm">إجمالي دخان الطلب</span>
            <span className="font-black text-xl font-mono">{total.toLocaleString()} ج.م</span>
          </div>

          <div className="pt-1 grid grid-cols-2 gap-3">
            <button type="submit" className="bg-emerald-600 hover:bg-emerald-700 text-white py-3 px-4 rounded-xl font-bold flex items-center justify-center gap-1.5">
              <Save className="w-4 h-4" /> حفظ
            </button>
            <button type="button" onClick={onClose} className="bg-slate-100 hover:bg-slate-200 text-slate-600 py-3 px-4 rounded-xl font-bold">إلغاء</button>
          </div>
        </form>
      </div>
    </div>
  );
}
