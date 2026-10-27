/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState } from 'react';
import { useDb } from '../db/store';
import { FileCheck, Truck, User, CalendarDays, CheckCircle, AlertTriangle, Search, Lock, Wallet, Copy, Trash2 } from 'lucide-react';

// شاشة المالية: أي فاتورة ترخيص جديدة بتظهر هنا كطلب "قيد الموافقة". لحظة الموافقة بيتخصم
// المبلغ من عهدة المسؤول وبيتحمّل على تكلفة السيارة، وبعدها الفاتورة بتتقفل (التعديل لأدمن البرنامج بس)
export function LicenseApprovalsTab() {
  const db = useDb();
  const [tab, setTab] = useState<'pending' | 'approved' | 'returned'>('pending');
  const [search, setSearch] = useState('');
  const [toast, setToast] = useState<{ text: string; ok: boolean } | null>(null);

  const showToast = (text: string, ok: boolean) => {
    setToast({ text, ok });
    setTimeout(() => setToast(null), 4000);
  };

  const statusOf = (inv: { approval_status?: 'draft' | 'pending' | 'approved' | 'returned' }) => inv.approval_status || 'approved';

  // الفاتورة المعتمدة التعديل والحذف عليها لأدمن البرنامج بس (نفس قاعدة النظام الحالية)
  const isAdmin = db.currentUser?.role === 'admin';

  // "نسخ الفاتورة" بيفتح شاشة عهد الصرف، فبنعرضه بس لمن عنده صلاحية الشاشة دي
  const canOpenInvoices = (() => {
    const u = db.currentUser;
    if (!u) return false;
    const live = db.systemUsers?.find(x => x.id === u.systemUserId);
    const screens = live ? live.allowed_screens : (u.allowedScreens || []);
    return screens.includes('custody_licensing');
  })();

  const pending = useMemo(
    () => db.invoices.filter(i => !i.is_deleted && statusOf(i) === 'pending')
      .sort((a, b) => (b.invoice_date || '').localeCompare(a.invoice_date || '')),
    [db.invoices]
  );

  const returned = useMemo(
    () => db.invoices.filter(i => !i.is_deleted && statusOf(i) === 'returned')
      .sort((a, b) => (b.returned_at || '').localeCompare(a.returned_at || '')),
    [db.invoices]
  );

  const approved = useMemo(
    () => db.invoices.filter(i => !i.is_deleted && statusOf(i) === 'approved')
      .sort((a, b) => (b.approved_at || b.invoice_date || '').localeCompare(a.approved_at || a.invoice_date || '')),
    [db.invoices]
  );

  const matches = (inv: { invoice_number: string; car_id?: string; official_id: string }) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    const car = db.cars.find(c => c.id === inv.car_id)?.car_number || '';
    const off = (db.officials.find(o => o.id === inv.official_id) || (db.getOfficialName(inv.official_id) ? ({ id: inv.official_id, name: db.getOfficialName(inv.official_id) + ' (محذوف)' } as any) : undefined))?.name || '';
    return inv.invoice_number.toLowerCase().includes(q) || car.toLowerCase().includes(q) || off.toLowerCase().includes(q);
  };

  const accountNeeds = (invoiceId: string, officialId: string) => {
    const totals: Record<string, number> = {};
    db.invoiceItems.filter(i => i.invoice_id === invoiceId).forEach(item => {
      let accId = item.account_id || '';
      if (!accId) {
        accId = db.custodyAccounts.find(a => a.official_id === officialId && a.type === item.payment_method)?.id || '';
      }
      totals[accId] = (totals[accId] || 0) + item.amount;
    });
    return Object.entries(totals).map(([accId, required]) => {
      const acc = db.custodyAccounts.find(a => a.id === accId);
      return { accId, name: acc?.name || 'حساب غير محدد', balance: acc?.balance ?? 0, required, enough: !!acc && acc.balance >= required };
    });
  };

  const handleApprove = (invoiceId: string, number: string, total: number) => {
    if (!window.confirm(`الموافقة على الفاتورة ${number} وخصم ${total.toLocaleString()} ج.م من العهدة؟ بعد الموافقة مش هيقدر مستخدم التراخيص يعدّل عليها (التعديل لأدمن البرنامج بس).`)) return;
    const res = db.approveInvoice(invoiceId);
    if (res.success) showToast(`تمت الموافقة على الفاتورة ${number} وخصمها من العهدة.`, true);
    else showToast(res.error || 'تعذّرت الموافقة على الفاتورة.', false);
  };

  const handleReturn = (invoiceId: string, number: string) => {
    const reason = (window.prompt(`سبب إرجاع الفاتورة ${number} لمستخدم التراخيص:`) || '').trim();
    if (!reason) return;
    const res = db.returnInvoice(invoiceId, reason);
    if (res.success) showToast(`تم إرجاع الفاتورة ${number} لمستخدم التراخيص بالسبب المكتوب.`, true);
    else showToast(res.error || 'تعذّر إرجاع الفاتورة.', false);
  };

  // حذف فاتورة: قيد الموافقة/مرتجعة بتتلغي بدون أثر مالي، والمعتمدة بيتسترد مبلغها كامل لحسابات العهدة
  // ويتسجّل في كشف العهدة حركة استرداد (بنفس منطق الحذف في أرشيف الفواتير)
  const handleDelete = (invoiceId: string, number: string, total: number, wasApproved: boolean) => {
    const msg = wasApproved
      ? `حذف الفاتورة المعتمدة ${number}؟\nهيتم استرداد ${total.toLocaleString()} ج.م كاملة لحسابات العهدة وتتسجل حركة استرداد في كشف العهدة، وتتشال تكلفة الترخيص من السيارة.`
      : `إلغاء وحذف الفاتورة ${number}؟ (لسه ماتخصمتش من العهدة فمفيش استرداد)`;
    if (!window.confirm(msg)) return;
    const actor = db.currentUser?.name || db.currentUser?.username || 'المالية';
    const res = db.deleteInvoice(invoiceId, actor);
    if (res.success) showToast(wasApproved ? `تم حذف الفاتورة ${number} واسترداد ${total.toLocaleString()} ج.م للعهدة.` : `تم إلغاء الفاتورة ${number}.`, true);
    else showToast(res.error || 'تعذّر حذف الفاتورة.', false);
  };

  // نسخ فاتورة: بنسيب الطلب وبنفتح شاشة عهد الصرف (استمارة جديدة ببنود الفاتورة بس، من غير السيارة)
  const handleClone = (invoiceId: string) => {
    try { sessionStorage.setItem('elbanna_clone_invoice_id', invoiceId); } catch { /* ignore */ }
    window.dispatchEvent(new CustomEvent('elbanna:navigate', { detail: { tab: 'custody_licensing' } }));
  };

  const list = (tab === 'pending' ? pending : tab === 'returned' ? returned : approved).filter(matches);
  const shown = tab === 'approved' ? list.slice(0, 50) : list;

  return (
    <div className="space-y-6" id="license_invoice_approvals_tab_view" style={{ direction: 'rtl' }}>
      <div className="border-b border-slate-200 pb-4">
        <span className="text-xs font-bold text-emerald-600 tracking-wider block uppercase mb-1">المالية</span>
        <h2 className="text-xl md:text-2xl font-black text-slate-800 font-sans tracking-tight flex items-center gap-2"><FileCheck className="w-6 h-6" /> اعتماد فواتير التراخيص</h2>
        <p className="text-xs text-slate-500 mt-1 leading-relaxed">أي فاتورة ترخيص جديدة بتظهر هنا كطلب. الموافقة بتخصم المبلغ من عهدة المسؤول وتحمّله على تكلفة السيارة، وبعدها الفاتورة بتتقفل ومحدش يعدّل عليها غير أدمن البرنامج.</p>
      </div>

      {toast && (
        <div className={`text-xs font-bold px-4 py-3 rounded-xl border ${toast.ok ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-700 border-rose-200'}`}>{toast.text}</div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setTab('pending')} className={`text-xs font-bold px-4 py-2 rounded-lg border ${tab === 'pending' ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-slate-600 border-slate-200'}`}>بانتظار الموافقة ({pending.length})</button>
        <button type="button" onClick={() => setTab('approved')} className={`text-xs font-bold px-4 py-2 rounded-lg border ${tab === 'approved' ? 'bg-slate-700 text-white border-slate-700' : 'bg-white text-slate-600 border-slate-200'}`}>المعتمدة ({approved.length})</button>
        <button type="button" onClick={() => setTab('returned')} className={`text-xs font-bold px-4 py-2 rounded-lg border ${tab === 'returned' ? 'bg-rose-600 text-white border-rose-600' : 'bg-white text-slate-600 border-slate-200'}`}>مرتجعة ({returned.length})</button>
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="بحث برقم الفاتورة أو السيارة أو المسؤول" className="w-full pr-9 pl-3 py-2 rounded-lg border border-slate-200 text-xs focus:outline-none focus:border-emerald-500 bg-white text-slate-800" />
        </div>
      </div>

      <div className="space-y-3">
        {shown.map(inv => {
          const car = db.cars.find(c => c.id === inv.car_id);
          const official = (db.officials.find(o => o.id === inv.official_id) || (db.getOfficialName(inv.official_id) ? ({ id: inv.official_id, name: db.getOfficialName(inv.official_id) + ' (محذوف)' } as any) : undefined));
          const items = db.invoiceItems.filter(i => i.invoice_id === inv.id);
          const needs = tab === 'pending' ? accountNeeds(inv.id, inv.official_id) : [];
          const allEnough = needs.every(n => n.enough);
          return (
            <div key={inv.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-3 flex-wrap text-xs">
                  <span className="font-black text-slate-800 font-mono">{inv.invoice_number}</span>
                  <span className="text-slate-500 flex items-center gap-1"><CalendarDays className="w-3.5 h-3.5" /> {inv.invoice_date}</span>
                  <span className="font-bold text-slate-700 flex items-center gap-1"><Truck className="w-3.5 h-3.5 text-slate-400" /> {car?.car_number || 'سيارة عامة'}</span>
                  <span className="font-bold text-slate-600 flex items-center gap-1"><User className="w-3.5 h-3.5 text-slate-400" /> {official?.name || 'مسؤول تراخيص'}</span>
                </div>
                <span className="font-black text-lg text-indigo-600 font-mono">{inv.total_amount.toLocaleString()} ج.م</span>
              </div>

              {(inv.license_details || inv.license_location) && (
                <p className="text-[11px] text-slate-500">{inv.license_details}{inv.license_location ? ` — ${inv.license_location}` : ''}</p>
              )}

              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs">
                  <thead><tr className="text-slate-400 border-b border-slate-100"><th className="py-1.5 px-2">البند</th><th className="py-1.5 px-2">القيمة</th><th className="py-1.5 px-2">الدفع</th></tr></thead>
                  <tbody>
                    {items.map(item => (
                      <tr key={item.id} className="border-b border-slate-50 text-slate-700">
                        <td className="py-1.5 px-2">{item.description}</td>
                        <td className="py-1.5 px-2 font-mono">{item.amount.toLocaleString()}</td>
                        <td className="py-1.5 px-2">{item.payment_method === 'cash' ? 'كاش' : 'فيزا'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {tab === 'pending' ? (
                <div className="space-y-2 pt-2 border-t border-slate-100">
                  {needs.map(n => (
                    <p key={n.accId} className={`text-[11px] flex items-center gap-1.5 ${n.enough ? 'text-slate-500' : 'text-rose-600 font-bold'}`}>
                      <Wallet className="w-3.5 h-3.5" /> هيتخصم {n.required.toLocaleString()} ج.م من "{n.name}" — الرصيد الحالي {n.balance.toLocaleString()} ج.م{!n.enough && ' (غير كافٍ)'}
                    </p>
                  ))}
                  <div className="flex items-center gap-3">
                    <button type="button" disabled={!allEnough} onClick={() => handleApprove(inv.id, inv.invoice_number, inv.total_amount)} className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold text-xs px-4 py-2 rounded-lg flex items-center gap-1.5">
                      <CheckCircle className="w-3.5 h-3.5" /> موافقة وخصم من العهدة
                    </button>
                    <button type="button" onClick={() => handleReturn(inv.id, inv.invoice_number)} className="bg-white border border-rose-300 text-rose-600 hover:bg-rose-50 font-bold text-xs px-4 py-2 rounded-lg">
                      إرجاع بسبب
                    </button>
                    {!allEnough && <span className="text-[11px] text-rose-600 flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" /> الرصيد لا يكفي — اشحن العهدة الأول.</span>}
                  </div>
                </div>
              ) : tab === 'returned' ? (
                <p className="text-[11px] text-rose-700 pt-2 border-t border-slate-100 leading-relaxed">
                  مرتجعة{inv.returned_by ? ` بواسطة ${inv.returned_by}` : ''}{inv.returned_at ? ` في ${inv.returned_at.split('T')[0]}` : ''}: <b>{inv.return_reason || 'بدون سبب مسجّل'}</b> — مستنية مستخدم التراخيص يعدّلها ويعيد إرسالها.
                </p>
              ) : (
                <p className="text-[11px] text-slate-500 pt-2 border-t border-slate-100 flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5" /> معتمدة{inv.approved_by ? ` بواسطة ${inv.approved_by}` : ''}{inv.approved_at ? ` في ${inv.approved_at.split('T')[0]}` : ''} — مقفولة للتعديل (أدمن البرنامج فقط).
                </p>
              )}

              <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100">
                {canOpenInvoices && (
                  <button type="button" onClick={() => handleClone(inv.id)} className="bg-white border border-indigo-300 text-indigo-600 hover:bg-indigo-50 font-bold text-xs px-4 py-2 rounded-lg flex items-center gap-1.5" title="فتح استمارة جديدة ببنود الفاتورة (من غير السيارة)">
                    <Copy className="w-3.5 h-3.5" /> نسخ الفاتورة
                  </button>
                )}
                {(tab !== 'approved' || isAdmin) ? (
                  <button type="button" onClick={() => handleDelete(inv.id, inv.invoice_number, inv.total_amount, tab === 'approved')} className="bg-white border border-rose-300 text-rose-600 hover:bg-rose-50 font-bold text-xs px-4 py-2 rounded-lg flex items-center gap-1.5">
                    <Trash2 className="w-3.5 h-3.5" /> {tab === 'approved' ? 'حذف واسترداد للعهدة' : 'حذف الفاتورة'}
                  </button>
                ) : (
                  <span className="text-[11px] text-slate-400">حذف الفاتورة المعتمدة (مع استرداد العهدة) لأدمن البرنامج فقط.</span>
                )}
              </div>
            </div>
          );
        })}
        {shown.length === 0 && (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-10 text-center text-slate-400 font-bold">
            {tab === 'pending' ? 'لا توجد فواتير بانتظار الموافقة.' : tab === 'returned' ? 'لا توجد فواتير مرتجعة.' : 'لا توجد فواتير معتمدة مطابقة.'}
          </div>
        )}
        {tab === 'approved' && list.length > 50 && (
          <p className="text-[11px] text-slate-400 text-center">معروض آخر 50 فاتورة — استخدم البحث للوصول لغيرها.</p>
        )}
      </div>
    </div>
  );
}
