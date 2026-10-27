/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { useDb } from '../db/store';
import { Invoice, InvoiceItem, CustodyAccount, CustodyMovement, Official } from '../types';
import { A5PrintPreview } from './A5PrintPreview';
import { PdfInvoiceImport } from './PdfInvoiceImport';
import { SortableTh } from './SortableTh';
import { SuggestInput, rankByFrequency } from './SuggestInput';
import { useSort } from '../hooks/useSort';
import { printA4Report } from '../utils/printA4';
import { buildAccountLedger, buildOfficialLedger, MOVEMENT_TYPE_LABEL } from '../utils/custodyLedger';
import {
  FileText,
  Plus,
  Trash2,
  DollarSign,
  Printer,
  History,
  ShieldCheck,
  CreditCard,
  UserCheck,
  CheckCircle2,
  AlertOctagon,
  ScrollText,
  RotateCcw,
  ArrowRightLeft,
  Layers,
  Sparkles,
  UserPlus,
  ChevronDown,
  BookOpen,
  ArrowUp,
  ArrowDown,
  Lock,
  Key,
  Archive,
  FilePlus2,
  ArrowRight,
  Copy,
  Save
} from 'lucide-react';

interface DraftVoucher {
  id: string;
  savedDraftId?: string; // لو الاستمارة جاية من مسودة محفوظة في قاعدة البيانات
  officialId: string;
  carId: string;
  licenseDetails: string;
  licenseLocation: string;
  carLocation: string;
  invoiceDate: string;
  items: {
    id: string;
    description: string;
    paymentMethod: 'cash' | 'visa';
    accountId: string;
    amount: number;
  }[];
}

interface AdminOfficialPasswordRowProps {
  official: Official;
  linkedUserName?: string;
  onUpdate: (newPass: string) => void;
  onDelete: () => void;
}

const AdminOfficialPasswordRow: React.FC<AdminOfficialPasswordRowProps> = ({ official, linkedUserName, onUpdate, onDelete }) => {
  const [newPasswordVal, setNewPasswordVal] = useState('');

  return (
    <tr className="border-b border-slate-800/60 hover:bg-slate-900/40 text-slate-300">
      <td className="py-2.5 px-3 font-semibold text-right text-slate-100">{official.name}</td>
      <td className="py-2.5 px-3 text-center text-[11px] font-bold">
        {linkedUserName
          ? <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-full">@{linkedUserName}</span>
          : <span className="bg-slate-800 text-slate-400 border border-slate-700 px-2 py-0.5 rounded-full" title="المشرف ده موجود في العهد بس ومالوش مستخدم دخول في شاشة المستخدمين">بدون مستخدم</span>}
      </td>
      <td className="py-2.5 px-3 text-center text-[11px] text-slate-500">محفوظة مشفّرة — مبتتعرضش</td>
      <td className="py-2.5 px-3 text-center">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (newPasswordVal.length >= 8) {
              onUpdate(newPasswordVal);
              setNewPasswordVal('');
            } else {
              alert('كلمة المرور يجب أن تكون 8 أحرف على الأقل!');
            }
          }}
          className="flex items-center justify-center gap-1.5"
        >
          <input
            type="password"
            placeholder="كلمة مرور جديدة..."
            value={newPasswordVal}
            onChange={(e) => setNewPasswordVal(e.target.value)}
            className="p-1 rounded bg-slate-950 border border-slate-800 text-[11px] font-mono w-28 text-center"
          />
          <button
            type="submit"
            className="bg-indigo-900/50 hover:bg-indigo-900 text-indigo-300 font-extrabold px-2.5 py-1 rounded text-[10px] transition-all"
          >
            تحديث
          </button>
        </form>
      </td>
      <td className="py-2.5 px-3 text-center">
        <button
          type="button"
          onClick={onDelete}
          className="bg-rose-900/20 text-rose-400 hover:bg-rose-900/40 p-1.5 rounded transition-all inline-flex items-center gap-1 text-[10px] font-bold"
          title="حذف مشرف الصرف"
        >
          <Trash2 className="w-3.5 h-3.5" /> حذف
        </button>
      </td>
    </tr>
  );
};

interface UserWithoutCustodyRowProps {
  displayName: string;
  username: string;
  onCreate: (cash: number, visa: number) => void;
}

// مستخدم من شاشة المستخدمين ليس له حساب عهدة — الأدمن ينشئ له العهدة يدويًا من هنا (مش تلقائي)
const UserWithoutCustodyRow: React.FC<UserWithoutCustodyRowProps> = ({ displayName, username, onCreate }) => {
  const [cash, setCash] = useState(0);
  const [visa, setVisa] = useState(0);
  return (
    <tr className="border-b border-slate-800/60 hover:bg-slate-900/40 text-slate-300">
      <td className="py-2.5 px-3 font-semibold text-right text-slate-100">{displayName} <span className="font-mono text-slate-500 text-[10px]">@{username}</span></td>
      <td className="py-2.5 px-3 text-center">
        <input type="number" min={0} value={cash || ''} placeholder="0" onChange={(e) => setCash(Number(e.target.value) || 0)} className="p-1 rounded bg-slate-950 border border-slate-800 text-[11px] font-mono w-24 text-center" />
      </td>
      <td className="py-2.5 px-3 text-center">
        <input type="number" min={0} value={visa || ''} placeholder="0" onChange={(e) => setVisa(Number(e.target.value) || 0)} className="p-1 rounded bg-slate-950 border border-slate-800 text-[11px] font-mono w-24 text-center" />
      </td>
      <td className="py-2.5 px-3 text-center">
        <button
          type="button"
          onClick={() => onCreate(cash, visa)}
          className="bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold px-3 py-1.5 rounded text-[10px] transition-all"
        >
          إنشاء عهدة كمشرف صرف
        </button>
      </td>
    </tr>
  );
};

export const InvoicesTab: React.FC = () => {
  const db = useDb();

  // اقتراحات بنود الصرف: الأكثر استخدامًا الأول (بتظهر 5 بس تحت الحقل أثناء الكتابة)
  const itemDescSuggestions = React.useMemo(
    () => rankByFrequency((db.invoiceItems || []).map(it => it.description)),
    [db.invoiceItems]
  );

  // Active Main Sub Tab: 'invoices', 'custodies', 'pdf_import' or 'change_password'
  const [activeSubTab, setActiveSubTab] = useState<'invoices' | 'custodies' | 'pdf_import' | 'change_password'>('invoices');

  // Personal Password Change state
  const [personalOldPassword, setPersonalOldPassword] = useState('');
  const [personalNewPassword, setPersonalNewPassword] = useState('');
  const [personalConfirmPassword, setPersonalConfirmPassword] = useState('');
  const [personalPasswordError, setPersonalPasswordError] = useState('');
  const [personalPasswordSuccess, setPersonalPasswordSuccess] = useState('');

  // Enforce supervisor pre-selectors and locks
  React.useEffect(() => {
    if (db.currentUser?.role === 'supervisor' && db.currentUser?.officialId) {
      setSelectedOfficialForDetail(db.currentUser.officialId);
    }
  }, [db.currentUser]);

  // شاشة عهد الصرف المفتوحة: الرئيسية (اختيار العملية) / مسودة مصروفات ترخيص / أرشيف الفواتير — الاتنين الأخيرين بحجم الشاشة كاملة
  const [invoiceView, setInvoiceView] = useState<'home' | 'draft' | 'archive' | 'saved_drafts'>('home');
  const [archiveSearchQuery, setArchiveSearchQuery] = useState('');
  const [archiveDateFrom, setArchiveDateFrom] = useState('');
  const [archiveDateTo, setArchiveDateTo] = useState('');
  const [showDeletedInvoices, setShowDeletedInvoices] = useState(false);
  const [selectedLedgerAccountId, setSelectedLedgerAccountId] = useState<string>('all');

  // أرشيف الفواتير: التصفية (نفس منطق البحث القديم) + الفرز بالضغط على العنوان + الطباعة A4
  // الأرشيف مايعرضش أي فواتير غير لما يتكتب بحث (رقم السيارة / رقم الفاتورة / المسؤول) أو يتحدد تاريخ
  const hasArchiveCriteria = archiveSearchQuery.trim() !== '' || archiveDateFrom !== '' || archiveDateTo !== '';
  const archiveFiltered: Invoice[] = !hasArchiveCriteria ? [] : db.invoices.filter(i => {
    const invDate = String(i.invoice_date || '').slice(0, 10);
    if (archiveDateFrom && invDate < archiveDateFrom) return false;
    if (archiveDateTo && invDate > archiveDateTo) return false;
    const q = archiveSearchQuery.toLowerCase().trim();
    const official = (db.officials.find(o => o.id === i.official_id) || (db.getOfficialName(i.official_id) ? ({ id: i.official_id, name: db.getOfficialName(i.official_id) + ' (محذوف)' } as any) : undefined));
    const targetCar = db.cars.find(c => c.id === i.car_id);
    const isMatch = !q ? true : (
      i.invoice_number.toLowerCase().includes(q) ||
      (targetCar?.car_number || '').toLowerCase().includes(q) ||
      (official?.name || '').toLowerCase().includes(q) ||
      (i.license_location || '').toLowerCase().includes(q) ||
      (i.license_details || '').toLowerCase().includes(q)
    );

    if (i.is_deleted) {
      const specificallyTyped = q && (i.invoice_number.toLowerCase() === q || i.invoice_number.toLowerCase().includes(q));
      return showDeletedInvoices || specificallyTyped || (q && isMatch);
    }

    return isMatch;
  });
  const archiveSort = useSort(archiveFiltered, (inv, key) => {
    switch (key) {
      case 'number': return inv.invoice_number;
      case 'date': return inv.invoice_date;
      case 'car': return db.cars.find(c => c.id === inv.car_id)?.car_number || 'سيارة عامة';
      case 'official': return (db.officials.find(o => o.id === inv.official_id) || (db.getOfficialName(inv.official_id) ? ({ id: inv.official_id, name: db.getOfficialName(inv.official_id) + ' (محذوف)' } as any) : undefined))?.name || 'مشرف تراخيص';
      default: return inv.total_amount;
    }
  });
  const printUserName = db.currentUser?.name || db.currentUser?.username || '';

  const handlePrintInvoicesA4 = () => {
    const rows = archiveSort.sorted;
    const activeRows = rows.filter(i => !i.is_deleted);
    const total = activeRows.reduce((s, i) => s + (i.total_amount || 0), 0);
    printA4Report({
      title: 'كشف الفواتير ومصروفات الترخيص',
      subtitle: [
        archiveSearchQuery ? `نتائج البحث: ${archiveSearchQuery}` : '',
        archiveDateFrom ? `من تاريخ: ${archiveDateFrom}` : '',
        archiveDateTo ? `إلى تاريخ: ${archiveDateTo}` : '',
      ].filter(Boolean).join(' — ') + (showDeletedInvoices ? ' (شامل الملغاة)' : ''),
      user: printUserName,
      orientation: 'portrait',
      headers: ['رقم الفاتورة', 'التاريخ', 'السيارة', 'المسؤول عن الصرف', 'الحالة', 'القيمة (ج.م)'],
      rows: rows.map(i => [
        i.invoice_number,
        i.invoice_date,
        db.cars.find(c => c.id === i.car_id)?.car_number || 'سيارة عامة',
        (db.officials.find(o => o.id === i.official_id) || (db.getOfficialName(i.official_id) ? ({ id: i.official_id, name: db.getOfficialName(i.official_id) + ' (محذوف)' } as any) : undefined))?.name || 'مشرف تراخيص',
        i.is_deleted ? 'ملغاة' : (i.approval_status || 'approved') === 'pending' ? 'بانتظار المالية' : i.approval_status === 'returned' ? 'مرتجعة' : 'معتمدة',
        i.total_amount,
      ]),
      totalsRow: ['الإجمالي (غير الملغاة)', '', '', '', `${activeRows.length} فاتورة`, total],
    });
  };

  const handlePrintLedgerA4 = () => {
    const isSup = db.currentUser?.role === 'supervisor' && !!db.currentUser?.officialId;
    const mine = (m: CustodyMovement) => !isSup || m.official_id === db.currentUser?.officialId;
    const accName = (id?: string) => db.custodyAccounts.find(a => a.id === id)?.name || '';
    if (selectedLedgerAccountId === 'all') {
      const rows = buildOfficialLedger(db.custodyMovements.filter(mine));
      printA4Report({
        title: 'كشف حركات العهد والتسويات',
        subtitle: 'كل العهد والحسابات — الرصيد الجاري لكل مسؤول',
        user: printUserName,
        orientation: 'landscape',
        headers: ['التاريخ', 'المسؤول', 'الحساب', 'البيان', 'النوع', 'دائن (عهدة)', 'مدين (فاتورة)', 'الرصيد'],
        rows: rows.map(m => [
          m.date,
          db.officials.find(o => o.id === m.official_id)?.name || '',
          [accName(m.from_account_id), accName(m.to_account_id)].filter(Boolean).join(' ➔ ') || 'عهدة المسؤول',
          m.description,
          MOVEMENT_TYPE_LABEL[m.type] || m.type,
          m.inflow || '-', m.outflow || '-', m.runningBalanceAfter,
        ]),
        totalsRow: ['الإجمالي', '', '', '', '', rows.reduce((s, m) => s + m.inflow, 0), rows.reduce((s, m) => s + m.outflow, 0), ''],
      });
      return;
    }
    const acc = db.custodyAccounts.find(a => a.id === selectedLedgerAccountId);
    const rows = buildAccountLedger(db.custodyMovements.filter(mine), selectedLedgerAccountId);
    printA4Report({
      title: `كشف حساب عهدة: ${acc?.name || ''}`,
      subtitle: `المسؤول: ${db.officials.find(o => o.id === acc?.official_id)?.name || ''} — الرصيد الحالي: ${(acc?.balance ?? 0).toLocaleString()} ج.م`,
      user: printUserName,
      orientation: 'portrait',
      headers: ['التاريخ', 'البيان', 'النوع', 'دائن (عهدة)', 'مدين (فاتورة)', 'الرصيد'],
      rows: rows.map(m => [m.date, m.description, MOVEMENT_TYPE_LABEL[m.type] || m.type, m.inflow || '-', m.outflow || '-', m.running]),
      totalsRow: ['الإجمالي', '', '', rows.reduce((s, m) => s + m.inflow, 0), rows.reduce((s, m) => s + m.outflow, 0), acc?.balance ?? 0],
    });
  };

  // --- STATS & DIAL STATE ---
  const [statusMsg, setStatusMsg] = useState<{ type: 'error' | 'success' | null; text: string }>({ type: null, text: '' });

  const showStatus = (text: string, type: 'success' | 'error') => {
    setStatusMsg({ type, text });
    setTimeout(() => {
      setStatusMsg({ type: null, text: '' });
    }, 5000);
  };

  // --- SUB TAB 1: INVOICES EXPENSES & MULTIPLE OPEN VOUCHERS ---
  const [draftVouchers, setDraftVouchers] = useState<DraftVoucher[]>([
    {
      id: "draft_init",
      officialId: "",
      carId: "",
      licenseDetails: "رسوم تجديد فحص قشرة طفاية وتأمين مروري سنوي",
      licenseLocation: "مرور عبود فرعي الجيزة",
      carLocation: "منيا القمح",
      invoiceDate: new Date().toISOString().split('T')[0],
      items: [
        { id: "init_row_1", description: "رسوم فحص فني وبيئي وتجديد طفايات حريق", paymentMethod: 'cash', accountId: '', amount: 1000 }
      ]
    }
  ]);

  // نص البحث عن السيارة المستهدفة، لكل مسودة صرف على حدة
  const [carSearchInputs, setCarSearchInputs] = useState<Record<string, string>>({});

  // تحميل المسودات عند الفتح (من السحابة أو المحلي)
  React.useEffect(() => {
    db.loadDraftVouchers().then(saved => {
      if (saved && saved.length > 0) {
        // استمارات اتفتحت من مسودة محفوظة أو نسخة فاتورة ماتتمسحش لو التحميل خلص بعدها
        setDraftVouchers(cur => {
          const keep = cur.filter(v => v.savedDraftId || v.id.startsWith('draft_clone_'));
          return [...keep, ...saved.filter((sv: DraftVoucher) => !keep.some(k => k.id === sv.id))];
        });
      }
    });
  }, []);

  // Auto-save المسودات عند أي تغيير (debounce 800ms)
  React.useEffect(() => {
    const timer = setTimeout(() => {
      db.saveDraftVouchers(draftVouchers);
    }, 800);
    return () => clearTimeout(timer);
  }, [draftVouchers]);

  // Enforce logged-in supervisor's officialId on draft vouchers safely after declaration
  React.useEffect(() => {
    if (db.currentUser?.role === 'supervisor' && db.currentUser?.officialId) {
      const supId = db.currentUser.officialId;
      const needsUpdate = draftVouchers.some(v => v.officialId !== supId);
      if (needsUpdate) {
        setDraftVouchers(prev => prev.map(v => v.officialId !== supId ? { ...v, officialId: supId } : v));
      }
    }
  }, [db.currentUser, draftVouchers]);

  // Open multi expense vouchers helper
  const handleAddNewDraftVoucher = () => {
    const nextId = "draft_" + Date.now();
    const isSup = db.currentUser?.role === 'supervisor';
    setDraftVouchers(prev => [
      ...prev,
      {
        id: nextId,
        officialId: isSup ? (db.currentUser?.officialId || "") : "",
        carId: "",
        licenseDetails: "رسوم تجديد فحص دوري",
        licenseLocation: "مرور العباسية الرئيسي",
        carLocation: "منيا القمح",
        invoiceDate: new Date().toISOString().split('T')[0],
        items: [
          { id: "init_item_" + Date.now(), description: "بند تجديد روتيني وطوابع فحص مائي", paymentMethod: 'cash', accountId: '', amount: 500 }
        ]
      }
    ]);
    showStatus("تم فتح استمارة مسودة صرف جديدة لسيارة إضافية بالتراخيص.", "success");
  };

  const handleRemoveDraftVoucher = (draftId: string) => {
    if (draftVouchers.length === 1) {
      alert("يجب إبقاء استمارة واحدة على الأقل بالذاكرة قيد التحضير!");
      return;
    }
    setDraftVouchers(prev => prev.filter(v => v.id !== draftId));
  };

  const handleUpdateDraftHeader = (draftId: string, field: 'officialId' | 'carId' | 'licenseDetails' | 'licenseLocation' | 'carLocation' | 'invoiceDate', val: string) => {
    setDraftVouchers(prev => prev.map(v => {
      if (v.id === draftId) {
        // Automatically default sub-account IDs if official changes
        let updatedItems = [...v.items];
        if (field === 'officialId') {
          updatedItems = v.items.map(itm => {
            const match = db.custodyAccounts.find(ca => ca.official_id === val && ca.type === itm.paymentMethod);
            return {
              ...itm,
              accountId: match ? match.id : ''
            };
          });
        }
        return {
          ...v,
          [field]: val,
          items: updatedItems
        };
      }
      return v;
    }));
  };

  const handleAddRowToDraft = (draftId: string) => {
    setDraftVouchers(prev => prev.map(v => {
      if (v.id === draftId) {
        const rowId = "row_item_" + Date.now();
        // default sub-account
        const match = db.custodyAccounts.find(ca => ca.official_id === v.officialId && ca.type === 'cash');
        return {
          ...v,
          items: [
            ...v.items,
            { id: rowId, description: "", paymentMethod: 'cash', accountId: match ? match.id : '', amount: 0 }
          ]
        };
      }
      return v;
    }));
  };

  const handleRemoveRowFromDraft = (draftId: string, itemId: string) => {
    setDraftVouchers(prev => prev.map(v => {
      if (v.id === draftId) {
        if (v.items.length <= 1) {
          alert("يجب تخصيص بند صرف واحد على الأقل داخل كارت السيارة!");
          return v;
        }
        return {
          ...v,
          items: v.items.filter(i => i.id !== itemId)
        };
      }
      return v;
    }));
  };

  const handleMoveDraftRow = (draftId: string, itemId: string, direction: 'up' | 'down') => {
    setDraftVouchers(prev => prev.map(v => {
      if (v.id === draftId) {
        const index = v.items.findIndex(i => i.id === itemId);
        if (index === -1) return v;
        const newItems = [...v.items];
        if (direction === 'up' && index > 0) {
          const temp = newItems[index];
          newItems[index] = newItems[index - 1];
          newItems[index - 1] = temp;
        } else if (direction === 'down' && index < newItems.length - 1) {
          const temp = newItems[index];
          newItems[index] = newItems[index + 1];
          newItems[index + 1] = temp;
        }
        return {
          ...v,
          items: newItems
        };
      }
      return v;
    }));
  };

  const handleUpdateDraftRow = (draftId: string, itemId: string, field: 'description' | 'paymentMethod' | 'accountId' | 'amount', val: any) => {
    setDraftVouchers(prev => prev.map(v => {
      if (v.id === draftId) {
        const nextItems = v.items.map(itm => {
          if (itm.id === itemId) {
            let updated = { ...itm, [field]: field === 'amount' ? Number(val) : val };
            
            // Auto match compatible account_id when paymentMethod switches
            if (field === 'paymentMethod') {
              const compatible = db.custodyAccounts.find(ca => ca.official_id === v.officialId && ca.type === val);
              updated.accountId = compatible ? compatible.id : '';
            } else if (field === 'accountId') {
              const chosenAcc = db.custodyAccounts.find(ca => ca.id === val);
              if (chosenAcc) {
                updated.paymentMethod = chosenAcc.type === 'cash' ? 'cash' : 'visa';
              }
            }

            return updated;
          }
          return itm;
        });
        return { ...v, items: nextItems };
      }
      return v;
    }));
  };

  // مصدر العهدة اتشال من شاشة البند: الصرف بيتوزع تلقائيًا على حسابات المشرف — الكاش الأول، ولو
  // رصيده مش كفاية بنكمل من باقي حساباته (عشان العهدة تتعامل كرصيد واحد)
  const allocateItemAccounts = <T extends { amount: number; accountId?: string }>(officialId: string, items: T[]): string[] => {
    const accs = db.custodyAccounts
      .filter(ca => ca.official_id === officialId)
      .sort((a, b) => (a.type === 'cash' ? 0 : 1) - (b.type === 'cash' ? 0 : 1));
    const left: Record<string, number> = {};
    accs.forEach(a => { left[a.id] = a.balance; });
    return items.map(it => {
      const pick = accs.find(a => left[a.id] >= it.amount) || accs[0];
      if (!pick) return '';
      left[pick.id] -= it.amount;
      return pick.id;
    });
  };

  // Dispatch Finalized Saved Invoice to persistent database & trigger A5 printable modal
  const handleFinalizeSaveVoucher = (draftId: string) => {
    const voucher = draftVouchers.find(v => v.id === draftId);
    if (!voucher) return;

    if (!voucher.officialId) {
      showStatus("الرجاء تحديد مسؤول تراخيص العهدة لهذه الفاتورة!", "error");
      return;
    }
    if (!voucher.carId) {
      showStatus("الرجاء اختيار المركبة الواحدة المستهدفة بمصروفات هذا المستند!", "error");
      return;
    }
    const emptyRow = voucher.items.some(i => !i.description || i.amount <= 0);
    if (emptyRow) {
      showStatus("الرجاء التأكد من كتابة توصيف كافة البنود وتحديد مبالغ وقيم الخصم بنجاح!", "error");
      return;
    }

    const officialObj = db.officials.find(o => o.id === voucher.officialId);
    if (!officialObj) return;

    const allocated = allocateItemAccounts(voucher.officialId, voucher.items);
    const payloadItems = voucher.items.map((i, idx) => {
      const acc = db.custodyAccounts.find(ca => ca.id === allocated[idx]);
      return {
        description: i.description,
        amount: i.amount,
        payment_method: (acc ? (acc.type === 'cash' ? 'cash' : 'visa') : i.paymentMethod) as 'cash' | 'visa',
        account_id: allocated[idx]
      };
    });

    const totalAmount = payloadItems.reduce((sum, item) => sum + item.amount, 0);

    const res = db.createInvoice({
      invoice_date: voucher.invoiceDate,
      official_id: voucher.officialId,
      car_id: voucher.carId,
      license_details: voucher.licenseDetails,
      license_location: voucher.licenseLocation,
      car_location: voucher.carLocation,
      total_amount: totalAmount
    }, payloadItems);

    if (res.success) {
      showStatus(`تم حفظ وطباعة الفاتورة وإرسالها لموافقة المالية. الخصم من العهدة بيتم بعد الموافقة بس.`, "success");

      // لو الفاتورة طالعة من مسودة محفوظة: المسودة خلاص اتحوّلت لفاتورة فنمسحها
      if (voucher.savedDraftId) db.deleteInvoiceDraft(voucher.savedDraftId);

      // بعد الترحيل والحفظ: تقفل شاشة المسودة وترجع لشاشة عهد الصرف المفتوحة
      setInvoiceView('home');
      
      // Auto reprint
      if (res.invoice) {
        triggerReprint(res.invoice.id);
      }

      // Remove this voucher card from active draft session
      if (draftVouchers.length > 1) {
        setDraftVouchers(prev => prev.filter(v => v.id !== draftId));
      } else {
        // Reset single Card
        setDraftVouchers([
          {
            id: "draft_init_" + Date.now(),
            officialId: "",
            carId: "",
            licenseDetails: "رسوم تجديد فحص قشرة طفاية وتأمين",
            licenseLocation: "مرور عبود",
            carLocation: "منيا القمح",
            invoiceDate: new Date().toISOString().split('T')[0],
            items: [
              { id: "init_row_" + Date.now(), description: "رسوم فحص فني وبيئي وتجديد طفايات حريق", paymentMethod: 'cash', accountId: '', amount: 1000 }
            ]
          }
        ]);
      }
    } else {
      showStatus(res.error || "عجز مالي في رصيد عهدة المسؤول المرتبط!", "error");
    }
  };

  // ---- المسودات المحفوظة (من غير أي خصم من العهدة) + نسخ الفواتير ----
  const makePlaceholderVoucher = (): DraftVoucher => ({
    id: "draft_init_" + Date.now(),
    officialId: db.currentUser?.role === 'supervisor' ? (db.currentUser?.officialId || '') : '',
    carId: "",
    licenseDetails: "رسوم تجديد فحص قشرة طفاية وتأمين",
    licenseLocation: "مرور عبود",
    carLocation: "منيا القمح",
    invoiceDate: new Date().toISOString().split('T')[0],
    items: [
      { id: "init_row_" + Date.now(), description: "رسوم فحص فني وبيئي وتجديد طفايات حريق", paymentMethod: 'cash', accountId: '', amount: 1000 }
    ]
  });

  const removeVoucherFromSession = (voucherId: string) => {
    setDraftVouchers(prev => {
      const next = prev.filter(v => v.id !== voucherId);
      return next.length > 0 ? next : [makePlaceholderVoucher()];
    });
  };

  // زرار "حفظ كمسودة": بيحفظ الاستمارة في قاعدة البيانات من غير خصم ولا إرسال للمالية
  const handleSaveVoucherAsDraft = (voucherId: string) => {
    const voucher = draftVouchers.find(v => v.id === voucherId);
    if (!voucher) return;
    if (!voucher.invoiceDate) {
      showStatus("حدد تاريخ الفاتورة الأول.", "error");
      return;
    }
    const hasContent = !!voucher.carId || voucher.items.some(i => (i.description || '').trim() || i.amount > 0);
    if (!hasContent) {
      showStatus("اكتب بند واحد على الأقل أو اختار السيارة قبل حفظ المسودة.", "error");
      return;
    }
    const res = db.saveInvoiceDraft(
      voucher.savedDraftId || null,
      {
        invoice_date: voucher.invoiceDate,
        official_id: voucher.officialId,
        car_id: voucher.carId || undefined,
        license_details: voucher.licenseDetails,
        license_location: voucher.licenseLocation,
        car_location: voucher.carLocation
      },
      voucher.items.map(i => ({ description: i.description, amount: i.amount, payment_method: i.paymentMethod, account_id: i.accountId }))
    );
    if (!res.success) {
      showStatus(res.error || "تعذّر حفظ المسودة.", "error");
      return;
    }
    removeVoucherFromSession(voucherId);
    setInvoiceView('saved_drafts');
    showStatus("تم حفظ المسودة. مفيش أي خصم من العهدة، وتقدر تفتحها وتعدّلها وتبعتها في أي وقت.", "success");
  };

  // فتح مسودة محفوظة للتعديل (الرأس والبنود) أو للإرسال النهائي
  const handleEditSavedDraft = (inv: Invoice) => {
    if (!draftVouchers.some(v => v.savedDraftId === inv.id)) {
      const its = db.invoiceDraftItems
        .filter(i => i.invoice_id === inv.id)
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
      const voucher: DraftVoucher = {
        id: "draft_saved_" + Date.now(),
        savedDraftId: inv.id,
        officialId: inv.official_id || (db.currentUser?.role === 'supervisor' ? (db.currentUser?.officialId || '') : ''),
        carId: inv.car_id || '',
        licenseDetails: inv.license_details || '',
        licenseLocation: inv.license_location || '',
        carLocation: inv.car_location || '',
        invoiceDate: inv.invoice_date,
        items: its.length > 0
          ? its.map(i => ({ id: i.id, description: i.description, paymentMethod: i.payment_method, accountId: i.account_id || '', amount: i.amount }))
          : [{ id: "init_row_" + Date.now(), description: '', paymentMethod: 'cash' as const, accountId: '', amount: 0 }]
      };
      setDraftVouchers(prev => [voucher, ...prev]);
    }
    setInvoiceView('draft');
  };

  const handleDeleteSavedDraft = (inv: Invoice) => {
    if (!window.confirm(`مسح المسودة نهائيًا؟ (مفيش لها أي أثر على العهدة)`)) return;
    const res = db.deleteInvoiceDraft(inv.id);
    if (!res.success) {
      showStatus(res.error || "تعذّر مسح المسودة.", "error");
      return;
    }
    setDraftVouchers(prev => {
      const next = prev.filter(v => v.savedDraftId !== inv.id);
      return next.length > 0 ? next : [makePlaceholderVoucher()];
    });
    showStatus("تم مسح المسودة.", "success");
  };

  // زرار "نسخ": بيفتح استمارة جديدة ببنود الفاتورة بس (من غير السيارة) عشان تختار سيارة جديدة وتعدّل
  const handleCloneInvoice = (inv: Invoice) => {
    const its = db.invoiceItems
      .filter(i => i.invoice_id === inv.id)
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    if (its.length === 0) {
      showStatus("الفاتورة دي مفيهاش بنود تتنسخ.", "error");
      return;
    }
    const stamp = Date.now();
    const voucher: DraftVoucher = {
      id: "draft_clone_" + stamp,
      officialId: db.currentUser?.role === 'supervisor' ? (db.currentUser?.officialId || '') : '',
      carId: "",
      licenseDetails: "",
      licenseLocation: "",
      carLocation: "",
      invoiceDate: new Date().toISOString().split('T')[0],
      items: its.map((i, idx) => ({ id: "clone_" + stamp + "_" + idx, description: i.description, paymentMethod: i.payment_method, accountId: '', amount: i.amount }))
    };
    setDraftVouchers(prev => [voucher, ...prev]);
    setInvoiceView('draft');
    showStatus(`تم نسخ بنود الفاتورة ${inv.invoice_number}. اختار السيارة والمسؤول وعدّل البنود حسب الحاجة.`, "success");
  };

  // نسخ فاتورة من شاشة اعتماد الفواتير: الشاشة دي بتسيب الطلب في sessionStorage وتفتح هنا
  React.useEffect(() => {
    let cloneId: string | null = null;
    try { cloneId = sessionStorage.getItem('elbanna_clone_invoice_id'); } catch { cloneId = null; }
    if (!cloneId) return;
    const inv = db.invoices.find(i => i.id === cloneId);
    if (!inv) return; // البيانات لسه بتتحمّل: هيحاول تاني لما الفواتير تتغيّر
    try { sessionStorage.removeItem('elbanna_clone_invoice_id'); } catch { /* ignore */ }
    handleCloneInvoice(inv);
  }, [db.invoices]);


  // --- SUB TAB 2: CUSTODY MANAGEMENT & CASH/VISA ACCOUNTS ---
  const [selectedOfficialForDetail, setSelectedOfficialForDetail] = useState<string>('');
  
  // Custom inputs for adding new Licensing Officer (Official) & initial cash
  const [newOfficialName, setNewOfficialName] = useState('');
  const [newOfficialInitialCash, setNewOfficialInitialCash] = useState(0);
  const [newOfficialInitialVisa, setNewOfficialInitialVisa] = useState(0);

  // Custom inputs for adding segment card / sub account
  const [newSubAccName, setNewSubAccName] = useState('');
  const [newSubAccType, setNewSubAccType] = useState<'cash' | 'visa' | 'other_visa'>('visa');
  const [newSubAccBalance, setNewSubAccBalance] = useState(0);

  // Fund balance transfer form state
  const [transferFromId, setTransferFromId] = useState('');
  const [transferToId, setTransferToId] = useState('');
  const [transferAmount, setTransferAmount] = useState(0);
  const [transferDesc, setTransferDesc] = useState('');

  // إضافة عهدة جديدة (دائن) على حساب مشرف — بدل التسوية اليدوية القديمة
  const [fundingAccountId, setFundingAccountId] = useState<string | null>(null);
  const [fundingAmount, setFundingAmount] = useState(0);
  const [fundingNote, setFundingNote] = useState('');

  const handleCreateOfficial = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newOfficialName.trim()) {
      alert("يرجى إدخال اسم مسؤول التراخيص!");
      return;
    }
    const added = db.addOfficial({
      name: newOfficialName,
      cash_custody: newOfficialInitialCash,
      visa_custody: newOfficialInitialVisa
    });
    showStatus(`تم بنجاح تشغيل سجل (Licensing_Officials) المعتمد للمسؤول (${added.name}) وتغذية العهد.`, "success");
    setNewOfficialName('');
    setNewOfficialInitialCash(0);
    setNewOfficialInitialVisa(0);
  };

  // حذف مشرف صرف (أدمن فقط) مع تنبيه لو عليه أرصدة أو فواتير
  const handleDeleteOfficial = (o: Official) => {
    const accs = db.custodyAccounts.filter(a => a.official_id === o.id);
    const totalBal = accs.reduce((sum, a) => sum + (a.balance || 0), 0);
    const invCount = db.invoices.filter(i => i.official_id === o.id).length;
    const linkedUser = db.systemUsers.find(u => u.linked_official_id === o.id);
    let msg = `هل تريد حذف مشرف الصرف "${o.name}" وحسابات عهدته (${accs.length} حساب)؟`;
    if (totalBal !== 0) msg += `\n\n⚠️ رصيد العهدة الحالي: ${totalBal.toLocaleString()} ج.م — هيتحذف مع الحساب.`;
    if (invCount > 0) msg += `\n⚠️ له ${invCount} فاتورة مسجلة — الفواتير هتفضل في الأرشيف لكن هتظهر بدون اسم المشرف.`;
    if (linkedUser) msg += `\n\nالمستخدم المرتبط به (@${linkedUser.username}) هيفضل موجود لكن هيتفك ارتباطه بالعهدة.`;
    if (!window.confirm(msg)) return;
    if ((totalBal !== 0 || invCount > 0) && !window.confirm(`تأكيد أخير: حذف "${o.name}" نهائي ولا يمكن التراجع عنه. متابعة؟`)) return;
    db.deleteOfficial(o.id);
    showStatus(`تم حذف مشرف الصرف "${o.name}".`, 'success');
  };

  const handleCreateOfficialForUser = async (userId: string, displayName: string, cash: number, visa: number) => {
    const res = await db.createOfficialForUser(userId, { cash_custody: cash, visa_custody: visa });
    if (!res.success) {
      showStatus(res.error || 'تعذّر إنشاء العهدة', 'error');
      return;
    }
    showStatus(`تم إنشاء عهدة "${displayName}" كمشرف صرف.${res.cloudSaved ? '' : ' ⚠️ اتحفظت على الجهاز ده بس — تأكد من الإنترنت.'}`, res.cloudSaved ? 'success' : 'error');
  };

  const handleCreateSubAccount = (officialId: string) => {
    if (!newSubAccName.trim() || newSubAccBalance < 0) {
      alert("الرجاء استيفاء بيانات الحساب الفرعي لتجزئة العهدة!");
      return;
    }
    db.addCustodyAccount({
      official_id: officialId,
      name: newSubAccName,
      type: newSubAccType,
      balance: newSubAccBalance
    });
    showStatus("تم تقسيم وتأسيس حساب فرعي جديد للبطاقة بنجاح.", "success");
    setNewSubAccName('');
    setNewSubAccBalance(0);
  };

  const handleApplyTransfer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!transferFromId || !transferToId || transferAmount <= 0) {
      alert("برجاء تحديد حساب الخصم وحساب التغذية وقيمة المبلغ المراد تحويله!");
      return;
    }
    const res = db.transferCustody(transferFromId, transferToId, transferAmount, transferDesc || "تحويل مالي تشغيلي داخلي");
    if (res.success) {
      showStatus(`تم ترحيل وتحويل ${transferAmount.toLocaleString()} ج.م ماليًا بنجاح وتحديث الكروت المصرفية سحابيًا.`, "success");
      setTransferAmount(0);
      setTransferDesc('');
    } else {
      showStatus(res.error || "فشل التحويل المالي!", "error");
    }
  };

  const handleSaveFunding = () => {
    if (fundingAccountId === null) return;
    const res = db.addCustodyFunds(fundingAccountId, fundingAmount, fundingNote);
    if (!res.success) {
      showStatus(res.error || 'تعذر تسجيل العهدة', 'error');
      return;
    }
    showStatus(`تم تسجيل عهدة جديدة ${fundingAmount.toLocaleString()} ج.م (دائن) وإضافتها للرصيد.`, 'success');
    setFundingAccountId(null);
    setFundingAmount(0);
    setFundingNote('');
  };


  // --- INVOICES AMENDMENT (POST-SAVE EDITING) ---
  const [editingInvoiceId, setEditingInvoiceId] = useState<string | null>(null);
  const [editInvoiceTargetCarId, setEditInvoiceTargetCarId] = useState('');
  const [editInvoiceDetails, setEditInvoiceDetails] = useState('');
  const [editInvoiceLocation, setEditInvoiceLocation] = useState('');
  const [editInvoiceCarLocation, setEditInvoiceCarLocation] = useState('');
  const [editInvoiceDate, setEditInvoiceDate] = useState('');
  const [editInvoiceOfficialId, setEditInvoiceOfficialId] = useState('');
  const [editInvoiceItems, setEditInvoiceItems] = useState<{ id: string; description: string; paymentMethod: 'cash' | 'visa'; accountId: string; amount: number }[]>([]);

  const handleOpenEditPreFinalized = (inv: Invoice) => {
    // لوحة التعديل المحاسبي بتظهر في شاشة عهد الصرف المفتوحة، فنقفل الأرشيف ونرجع لها
    setInvoiceView('home');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setEditingInvoiceId(inv.id);
    setEditInvoiceTargetCarId(inv.car_id || '');
    setEditInvoiceDetails(inv.license_details || '');
    setEditInvoiceLocation(inv.license_location || '');
    setEditInvoiceCarLocation(inv.car_location || '');
    setEditInvoiceDate(inv.invoice_date);
    setEditInvoiceOfficialId(inv.official_id);

    // Populate lines
    const activeItems = db.invoiceItems.filter(i => i.invoice_id === inv.id);
    setEditInvoiceItems(activeItems.map((itm, idx) => {
      let accId = itm.account_id || '';
      if (!accId) {
        const match = db.custodyAccounts.find(a => a.official_id === inv.official_id && a.type === itm.payment_method);
        accId = match ? match.id : '';
      }
      if (!accId) {
        const match = db.custodyAccounts.find(a => a.official_id === inv.official_id);
        accId = match ? match.id : '';
      }
      return {
        id: "edit_row_" + idx + "_" + Date.now(),
        description: itm.description,
        paymentMethod: itm.payment_method,
        accountId: accId,
        amount: itm.amount
      };
    }));
  };

  const handleAddRowEditInvoice = () => {
    const match = db.custodyAccounts.find(ca => ca.official_id === editInvoiceOfficialId && ca.type === 'cash');
    setEditInvoiceItems(prev => [
      ...prev,
      { id: "edit_row_new_" + Date.now(), description: "", paymentMethod: 'cash', accountId: match ? match.id : '', amount: 0 }
    ]);
  };

  const handleRemoveRowEditInvoice = (id: string) => {
    if (editInvoiceItems.length <= 1) {
      alert("يجب تخصيص بند مالي واحد على الأقل بالفاتورة!");
      return;
    }
    setEditInvoiceItems(prev => prev.filter(i => i.id !== id));
  };

  const handleMoveEditRow = (itemId: string, direction: 'up' | 'down') => {
    setEditInvoiceItems(prev => {
      const index = prev.findIndex(i => i.id === itemId);
      if (index === -1) return prev;
      const newItems = [...prev];
      if (direction === 'up' && index > 0) {
        const temp = newItems[index];
        newItems[index] = newItems[index - 1];
        newItems[index - 1] = temp;
      } else if (direction === 'down' && index < newItems.length - 1) {
        const temp = newItems[index];
        newItems[index] = newItems[index + 1];
        newItems[index + 1] = temp;
      }
      return newItems;
    });
  };

  const handleUpdateEditItemRow = (id: string, field: 'description' | 'paymentMethod' | 'accountId' | 'amount', val: any) => {
    setEditInvoiceItems(prev => prev.map(itm => {
      if (itm.id === id) {
        let updated = { ...itm, [field]: field === 'amount' ? Number(val) : val };
        
        // Auto match compatible account_id when paymentMethod switches
        if (field === 'paymentMethod') {
          const compatible = db.custodyAccounts.find(ca => ca.official_id === editInvoiceOfficialId && ca.type === val);
          updated.accountId = compatible ? compatible.id : '';
        } else if (field === 'accountId') {
          const chosenAcc = db.custodyAccounts.find(ca => ca.id === val);
          if (chosenAcc) {
            updated.paymentMethod = chosenAcc.type === 'cash' ? 'cash' : 'visa';
          }
        }
        return updated;
      }
      return itm;
    }));
  };

  const handleSaveEditedInvoiceTransaction = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editInvoiceTargetCarId) {
      showStatus("الرجاء اختيار السيارة المرتبطة بالفاتورة السلف!", "error");
      return;
    }
    const emptyRow = editInvoiceItems.some(i => !i.description || i.amount <= 0);
    if (emptyRow) {
      showStatus("الرجاء ملء توصيفات وقيم كافة البنود وتحديد كارت الدفع بدقة مسبقًا!", "error");
      return;
    }

    const official = db.officials.find(o => o.id === editInvoiceOfficialId);
    if (!official) return;

    // Convert payload
    const editAllocated = allocateItemAccounts(editInvoiceOfficialId, editInvoiceItems);
    const formattedItems = editInvoiceItems.map((itm, idx) => {
      const acc = db.custodyAccounts.find(ca => ca.id === editAllocated[idx]);
      return {
        description: itm.description,
        amount: itm.amount,
        payment_method: (acc ? (acc.type === 'cash' ? 'cash' : 'visa') : itm.paymentMethod) as 'cash' | 'visa',
        account_id: editAllocated[idx]
      };
    });

    // Update invoice header properties first
    db.updateCar(editInvoiceTargetCarId, {}); // dummy update to spark react

    // Call PostgreSQL transactional model reconciliation
    const res = db.updateInvoice(editingInvoiceId!, official.name, formattedItems, {
      car_id: editInvoiceTargetCarId,
      license_details: editInvoiceDetails,
      license_location: editInvoiceLocation,
      car_location: editInvoiceCarLocation,
      invoice_date: editInvoiceDate
    });
    if (res.success) {
      // Manually match headers
      const targetInv = db.invoices.find(v => v.id === editingInvoiceId);
      if (targetInv) {
        targetInv.car_id = editInvoiceTargetCarId;
        targetInv.license_details = editInvoiceDetails;
        targetInv.license_location = editInvoiceLocation;
        targetInv.car_location = editInvoiceCarLocation;
        targetInv.invoice_date = editInvoiceDate;
      }
      
      showStatus(`قامت عملية الموازنة والتسوية للمعاملة بتأكيد مراجعة حركات الفاتورة بنجاح.`, "success");
      setEditingInvoiceId(null);
      // Auto reprint
      triggerReprint(editingInvoiceId!);
    } else {
      showStatus(res.error || "حدث خطأ مالي في تسوية أرصدة بطاقات المسؤول القائم للصرف!", "error");
    }
  };


  // --- REPRINT & PRINT ARCHIVE POPUP ---
  const [activeInvoiceForPrint, setActiveInvoiceForPrint] = useState<{
    invoice: Invoice;
    items: InvoiceItem[];
    officialName: string;
    carsMap: Record<string, string>;
    carsObjMap?: Record<string, any>;
  } | null>(null);

  const [activeCustodyPrint, setActiveCustodyPrint] = useState<{
    accountId?: string;
    official: any;
    accountName: string;
    balance: number;
    movements: any[];
  } | null>(null);

  const triggerReprint = (invoiceId: string) => {
    const targetInvoice = db.invoices.find(inv => inv.id === invoiceId);
    if (!targetInvoice) return;

    const targetItems = db.invoiceItems.filter(i => i.invoice_id === invoiceId);
    const officialObj = db.officials.find(o => o.id === targetInvoice.official_id);
    
    const carsMap: Record<string, string> = {};
    const carsObjMap: Record<string, any> = {};
    db.cars.forEach(c => {
      carsMap[c.id] = c.car_number;
      carsObjMap[c.id] = c;
    });

    setActiveInvoiceForPrint({
      invoice: targetInvoice,
      items: targetItems,
      officialName: officialObj ? officialObj.name : "مسئول تراخيص عام",
      carsMap,
      carsObjMap
    });
  };

  const handlePrintCustodyStatement = (accId: string) => {
    const acc = db.custodyAccounts.find(a => a.id === accId);
    if (!acc) return;
    const officialObj = db.officials.find(o => o.id === acc.official_id);
    const subMovs = db.custodyMovements.filter(m => m.from_account_id === accId || m.to_account_id === accId);

    setActiveCustodyPrint({
      accountId: accId,
      official: officialObj || { name: "غير معروف" },
      accountName: acc.name,
      balance: acc.balance,
      movements: subMovs
    });
  };

  const handleDeleteInvoiceClick = (inv: Invoice) => {
    const sup = (db.officials.find(o => o.id === inv.official_id) || (db.getOfficialName(inv.official_id) ? ({ id: inv.official_id, name: db.getOfficialName(inv.official_id) + ' (محذوف)' } as any) : undefined));
    const supName = sup ? sup.name : "مشرف تراخيص";

    if (confirm(`تحذير محاسبي: ستقوم تصفية الفاتورة ${inv.invoice_number} برد مبالغ الصرف بالكامل إلى العهد الفرعية والبطاقات البنكية التي تم سحب المعاملة منها مسبقًا وتصحيح الموازنة ماليًا. هل تريد المتابعة؟`)) {
      const res = db.deleteInvoice(inv.id, supName);
      if (res.success) {
        showStatus("تم حذف وإلغاء قيود الفاتورة وإلغاء كافة معاملات الصارف من الخزن والبطاقات بنجاح.", "success");
      } else {
        showStatus(res.error || "فشل إلغاء المعاملة ماليًا.", "error");
      }
    }
  };

  const handleRestoreInvoiceClick = (inv: Invoice) => {
    const sup = (db.officials.find(o => o.id === inv.official_id) || (db.getOfficialName(inv.official_id) ? ({ id: inv.official_id, name: db.getOfficialName(inv.official_id) + ' (محذوف)' } as any) : undefined));
    const supName = sup ? sup.name : "مشرف تراخيص";

    if (confirm(`محاسبة: هل تود إعادة تفعيل الفاتورة الملغاة ${inv.invoice_number}؟ سيقوم هذا الإجراء بإعادة خصم قيمتها من أرصدة العهد الفرعية والبطاقات كما كانت في حالتها الأصلية.`)) {
      const res = db.restoreInvoice(inv.id, supName);
      if (res.success) {
        showStatus("تمت إعادة تفعيل الفاتورة واستعادة موازنتها وخصم البنود من العهد بنجاح.", "success");
      } else {
        showStatus(res.error || "فشل تنشيط المعاملة ماليًا.", "error");
      }
    }
  };

  // الفاتورة المعتمدة من المالية مقفولة: التعديل/الحذف لأدمن البرنامج بس
  const canModifyInvoice = (inv: Invoice) => (inv.approval_status || 'approved') !== 'approved' || db.currentUser?.role === 'admin';

  const handlePurgeInvoiceClick = (inv: Invoice) => {
    const sup = (db.officials.find(o => o.id === inv.official_id) || (db.getOfficialName(inv.official_id) ? ({ id: inv.official_id, name: db.getOfficialName(inv.official_id) + ' (محذوف)' } as any) : undefined));
    const supName = sup ? sup.name : "مشرف تراخيص";

    if (confirm(`⚠️ خطر جسيم: ستقوم حالاً بالحذف النهائي والمطلق للفاتورة رقم ${inv.invoice_number} وبنودها التفصيلية بالكامل من خوادم النظام وقاعدة البيانات بشكل تدميري كامل ولا يمكن التراجع أو الاسترجاع بعدها أبداً!\n\nفي حال لم تكن الفاتورة ملغاة مسبقاً، سيقوم النظام تلقائياً أولاً بتعديل العهد ورد المبالغ ماليّاً لتطبيق تسوية الموازنة قبل حذف الفاتورة ومصروفاتها.\n\nهل تود تأكيد الحذف النهائي والتام بلا عودة؟`)) {
      if (db.purgeInvoice) {
        const res = db.purgeInvoice(inv.id, supName);
        if (res.success) {
          showStatus("تم التصفية الكاملة وحذف الفاتورة وبنودها بشكل نهائي ومطلق من خوادم النظام وقاعدة البيانات بنجاح.", "success");
        } else {
          showStatus(res.error || "فشل قيد الحذف النهائي للفاتورة.", "error");
        }
      }
    }
  };


  // المسودات المحفوظة: مستخدم التراخيص يشوف مسوداته بس، وباقي المستخدمين يشوفوا الكل
  const visibleSavedDrafts = db.invoiceDrafts
    .filter(d => db.currentUser?.role !== 'supervisor' || !d.official_id || d.official_id === db.currentUser?.officialId)
    .sort((a, b) => (b.invoice_date || '').localeCompare(a.invoice_date || ''));

  const statusBanner = statusMsg.text ? (
    <div className={`p-4 rounded-xl border flex items-center gap-3 text-xs md:text-sm ${statusMsg.type === 'success' ? 'bg-emerald-900/10 border-emerald-500/20 text-emerald-400' : 'bg-rose-900/10 border-rose-500/20 text-rose-400'}`}>
      {statusMsg.type === 'success' ? (
        <ShieldCheck className="w-5 h-5 flex-shrink-0 text-emerald-400" />
      ) : (
        <AlertOctagon className="w-5 h-5 flex-shrink-0 text-rose-400" />
      )}
      <span className="font-extrabold">{statusMsg.text}</span>
    </div>
  ) : null;

  return (
    <div className="space-y-6" id="unified_custody_system" style={{ direction: 'rtl' }}>
      
      {/* 1. Modal for A5 Print Layout */}
      {activeInvoiceForPrint && (
        <A5PrintPreview
          type="invoice"
          invoiceData={activeInvoiceForPrint}
          onClose={() => setActiveInvoiceForPrint(null)}
        />
      )}

      {/* 2. Modal for Custody Statement A5 Print */}
      {activeCustodyPrint && (
        <A5PrintPreview
          type="custody_statement"
          custodyData={activeCustodyPrint}
          onClose={() => setActiveCustodyPrint(null)}
        />
      )}

      {/* Corporate Notification Banners */}
      {statusMsg.text && !(activeSubTab === 'invoices' && invoiceView !== 'home') && (
        <div className={`p-4 rounded-xl border flex items-center gap-3 text-xs md:text-sm animate-pulse ${statusMsg.type === 'success' ? 'bg-emerald-900/10 border-emerald-520/20 text-emerald-400' : 'bg-rose-900/10 border-rose-520/20 text-rose-400'}`}>
          {statusMsg.type === 'success' ? (
            <ShieldCheck className="w-5 h-5 flex-shrink-0 text-emerald-400" />
          ) : (
            <AlertOctagon className="w-5 h-5 flex-shrink-0 text-rose-400" />
          )}
          <span className="font-extrabold">{statusMsg.text}</span>
        </div>
      )}

      {/* لوحة ترحيب مشرف عهد الصرف والأرصدة المتاحة الميدانية فور الدخول */}
      {db.currentUser?.role === 'supervisor' && (() => {
        const supId = db.currentUser.officialId;
        const subAccounts = db.custodyAccounts.filter(ca => ca.official_id === supId);
        const totalBalance = subAccounts.reduce((sum, ca) => sum + ca.balance, 0);
        return (
          <div className="bg-slate-900 border border-emerald-500/20 p-5 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4 no-print shadow-xl animate-fade-in">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <div>
                <span className="text-[10px] font-bold text-emerald-400 tracking-wider block uppercase">بوابة الصرف المباشر</span>
                <h4 className="font-black text-slate-100 text-sm md:text-base">مرحباً بك، {db.currentUser.name || 'مشرف الفواتير المعتمد'}</h4>
                <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">تكامل حى مع الخزائن والبطاقات المصرفية للصرف وتسوية فواتير سيارات البنا جروب.</p>
              </div>
            </div>
            
            <div className="flex flex-wrap gap-2.5 items-center">
              {subAccounts.map(acc => (
                <div key={acc.id} className="bg-slate-950 px-3.5 py-2 rounded-xl border border-slate-850 flex items-center gap-2">
                  <span className="text-slate-400 text-xs font-bold">{acc.name}:</span>
                  <span className="font-mono text-xs font-black text-yellow-500">{(acc.balance ?? 0).toLocaleString()} ج.م</span>
                </div>
              ))}
              <div className="bg-slate-950 px-4.5 py-2.5 rounded-xl border border-emerald-500/25 shadow-inner flex items-center gap-3">
                <span className="text-slate-300 text-xs font-black">الرصيد الإجمالي المتاح للاستخدام:</span>
                <span className="font-mono text-base md:text-lg font-black text-emerald-400">{(totalBalance ?? 0).toLocaleString()} ج.م</span>
              </div>
            </div>
          </div>
        );
      })()}

      {/* SUB TABS NAVIGATION BAR */}
      <div className="flex border-b border-slate-800 gap-1 pb-px no-print">
        <button
          onClick={() => setActiveSubTab('invoices')}
          type="button"
          className={`flex items-center gap-2 px-5 py-3 text-xs md:text-sm font-bold border-b-2 transition-all ${activeSubTab === 'invoices' ? 'border-emerald-500 text-emerald-400 bg-emerald-500/5' : 'border-transparent text-slate-400 hover:text-slate-200'}`}
        >
          <Layers className="w-4 h-4 text-emerald-500" />
          <span>شاشة عهد الصرف المفتوحة وتسوية فواتير السيارات المباشرة (A5)</span>
        </button>
        <button
          onClick={() => setActiveSubTab('custodies')}
          type="button"
          className={`flex items-center gap-2 px-5 py-3 text-xs md:text-sm font-bold border-b-2 transition-all ${activeSubTab === 'custodies' ? 'border-indigo-500 text-indigo-400 bg-indigo-505/5' : 'border-transparent text-slate-400 hover:text-slate-200'}`}
        >
          <ArrowRightLeft className="w-4 h-4 text-indigo-400" />
          <span>شاشة كشف الحساب والتحويلات وإدارة الخزن والبطاقات بالتراخيص (Visa)</span>
        </button>
        <button
          onClick={() => setActiveSubTab('pdf_import')}
          type="button"
          className={`flex items-center gap-2 px-5 py-3 text-xs md:text-sm font-bold border-b-2 transition-all ${activeSubTab === 'pdf_import' ? 'border-amber-500 text-amber-400 bg-amber-500/5' : 'border-transparent text-slate-400 hover:text-slate-200'}`}
        >
          <BookOpen className="w-4 h-4 text-amber-400" />
          <span>استيراد فواتير PDF القديمة</span>
        </button>
        {db.currentUser?.role === 'supervisor' && (
          <button
            onClick={() => { setActiveSubTab('change_password'); setPersonalPasswordError(''); setPersonalPasswordSuccess(''); }}
            type="button"
            className={`flex items-center gap-2 px-5 py-3 text-xs md:text-sm font-bold border-b-2 transition-all ${activeSubTab === 'change_password' ? 'border-rose-500 text-rose-450 bg-rose-500/5 font-black' : 'border-transparent text-slate-400 hover:text-slate-200'}`}
          >
            <Lock className="w-4 h-4 text-rose-400 animate-pulse" />
            <span>تغيير كلمة المرور الخاصة بك</span>
          </button>
        )}
      </div>

      {/* --- RENDER TAB 1: INVOICES EXPENSES & VOUCHERS --- */}
      {activeSubTab === 'invoices' && (
        <div className="space-y-6">
          
          {/* TOP SECTION: ACTIVE POST-SAVE AMENDMENT MODAL PANEL */}
          {editingInvoiceId && (
            <div className="bg-slate-900 border border-amber-500 p-5 rounded-2xl space-y-4 shadow-xl">
              <div className="flex justify-between items-center border-b border-slate-800 pb-2">
                <div>
                  <h3 className="font-black text-amber-400 text-sm flex items-center gap-2">
                    <History className="w-5 h-5" />
                    المراجعة والتعديل المحاسبي المتأخر للفاتورة: ({db.invoices.find(i=>i.id===editingInvoiceId)?.invoice_number})
                  </h3>
                  <p className="text-[11px] text-slate-400 mt-0.5">مراجعة التراخيص لسيارة واحدة فقط وتحديث الخزن والمصارف ماليًا بالتاريخ المقر.</p>
                </div>
                <button
                  onClick={() => setEditingInvoiceId(null)}
                  type="button"
                  className="bg-slate-800 hover:bg-slate-750 text-slate-300 font-semibold text-xs px-3 py-1.5 rounded-lg"
                >
                  إلغاء التعديل والدخول للمسودات
                </button>
              </div>

              <form onSubmit={handleSaveEditedInvoiceTransaction} className="space-y-4 text-xs font-sans">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div>
                    <label className="block text-slate-400 font-bold mb-1">المركبة المستهدفة بالفاتورة</label>
                    <select
                      required
                      className="w-full p-2.5 rounded-lg border border-slate-800 bg-slate-950 text-slate-100 font-bold"
                      value={editInvoiceTargetCarId}
                      onChange={(e) => setEditInvoiceTargetCarId(e.target.value)}
                    >
                      <option value="">-- اختر السيارة --</option>
                      {db.cars.map(c => (
                        <option key={c.id} value={c.id}>{c.car_number} ({c.owner_company.split(' ')[0]})</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-slate-400 font-bold mb-1">بيان الترخيص ومستندات الصرف</label>
                    <input
                      type="text"
                      required
                      placeholder="بيان الترخيص بالفاتورة..."
                      className="w-full p-2.5 rounded-lg border border-slate-800 bg-slate-950 text-slate-100"
                      value={editInvoiceDetails}
                      onChange={(e) => setEditInvoiceDetails(e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="block text-slate-400 font-bold mb-1">مكان وتوكيل مكتب الترخيص</label>
                    <input
                      type="text"
                      required
                      placeholder="مكان الترخيص بالفاتورة..."
                      className="w-full p-2.5 rounded-lg border border-slate-800 bg-slate-950 text-slate-100"
                      value={editInvoiceLocation}
                      onChange={(e) => setEditInvoiceLocation(e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="block text-slate-400 font-bold mb-1">مكان السيارة الحالي (يدوي)</label>
                    <input
                      type="text"
                      required
                      placeholder="مكان تواجد السيارة..."
                      className="w-full p-2.5 rounded-lg border border-slate-800 bg-slate-950 text-slate-100"
                      value={editInvoiceCarLocation}
                      onChange={(e) => setEditInvoiceCarLocation(e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="block text-slate-400 font-bold mb-1">تاريخ اليوم/القيد</label>
                    <input
                      type="date"
                      required
                      className="w-full p-2.5 rounded-lg border border-slate-800 bg-slate-950 text-slate-100 font-mono"
                      value={editInvoiceDate}
                      onChange={(e) => setEditInvoiceDate(e.target.value)}
                    />
                  </div>
                </div>

                {/* Sub items inside editing invoice */}
                <div className="space-y-3 pt-2">
                  <div className="flex justify-between items-center text-slate-300 font-bold">
                    <span>البنود المالية المعدلة بالفاتورة للسيارة:</span>
                    <button
                      type="button"
                      onClick={handleAddRowEditInvoice}
                      className="bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-1 rounded border border-slate-700 flex items-center gap-1"
                    >
                      <Plus className="w-3.5 h-3.5 text-amber-400" />
                      إضافة بند مصروف إضافي
                    </button>
                  </div>

                  <div className="space-y-2">
                    {editInvoiceItems.map((itm, itmIdx) => {
                      const officialAccounts = db.custodyAccounts.filter(ca => ca.official_id === editInvoiceOfficialId);
                      return (
                        <div key={itm.id} className="grid grid-cols-1 md:grid-cols-12 gap-3 bg-slate-950 p-3 rounded-xl border border-slate-800 items-end">
                          <div className="md:col-span-2 flex items-center justify-between bg-slate-900 px-2 py-1.5 rounded border border-slate-800/40 pb-2 text-right self-stretch">
                            <span className="font-mono text-[10px] text-slate-400 font-bold self-center">بند {itmIdx + 1}</span>
                            <div className="flex gap-1 self-center">
                              <button
                                type="button"
                                disabled={itmIdx === 0}
                                onClick={() => handleMoveEditRow(itm.id, 'up')}
                                className={`p-1 rounded bg-slate-950 border border-slate-800 text-slate-400 hover:text-amber-400 hover:border-amber-500/30 transition-all ${itmIdx === 0 ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer'}`}
                                title="ترتيب لأعلى"
                              >
                                <ArrowUp className="w-2.5 h-2.5" />
                              </button>
                              <button
                                type="button"
                                disabled={itmIdx === editInvoiceItems.length - 1}
                                onClick={() => handleMoveEditRow(itm.id, 'down')}
                                className={`p-1 rounded bg-slate-950 border border-slate-800 text-slate-400 hover:text-amber-400 hover:border-amber-500/30 transition-all ${itmIdx === editInvoiceItems.length - 1 ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer'}`}
                                title="ترتيب لأسفل"
                              >
                                <ArrowDown className="w-2.5 h-2.5" />
                              </button>
                            </div>
                          </div>

                          <div className="md:col-span-7 text-right">
                            <label className="block text-slate-500 mb-0.5 text-[10px]">البند</label>
                            <input
                              type="text"
                              required
                              className="w-full p-2 rounded border border-slate-800 bg-slate-900 text-white text-xs"
                              value={itm.description}
                              onChange={(e) => handleUpdateEditItemRow(itm.id, 'description', e.target.value)}
                            />
                          </div>

                          <div className="md:col-span-2 text-right">
                            <label className="block text-slate-500 mb-0.5 text-[10px]">القيمة المالية للبند ج.م</label>
                            <input
                              type="number"
                              required
                              min={1}
                              className="w-full p-2 rounded border border-slate-800 bg-slate-900 text-yellow-400 font-mono font-black text-xs"
                              value={itm.amount || ''}
                              onChange={(e) => handleUpdateEditItemRow(itm.id, 'amount', e.target.value)}
                            />
                          </div>

                          <div className="md:col-span-1 flex justify-center pb-0.5">
                            <button
                              type="button"
                              onClick={() => handleRemoveRowEditInvoice(itm.id)}
                              className="bg-rose-900/20 text-rose-400 hover:bg-rose-900/40 p-2 rounded transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="flex justify-end gap-3 pt-3 border-t border-slate-800">
                  <div className="text-slate-200 flex items-center font-mono text-xs gap-3 ml-auto">
                    <span>نقدي: <strong className="text-emerald-400 font-bold">{editInvoiceItems.filter(i=>i.paymentMethod==='cash').reduce((sum,i)=>sum+i.amount,0).toLocaleString()} ج.م</strong></span>
                    <span>|</span>
                    <span>فيزا: <strong className="text-sky-450 font-bold">{editInvoiceItems.filter(i=>i.paymentMethod==='visa').reduce((sum,i)=>sum+i.amount,0).toLocaleString()} ج.م</strong></span>
                    <span>|</span>
                    <span>الإجمالي الكلي: <strong className="text-amber-400 font-black">{(editInvoiceItems.reduce((sum,i)=>sum+i.amount,0)).toLocaleString()} ج.م</strong></span>
                  </div>
                  <button
                    type="submit"
                    className="bg-amber-500 hover:bg-amber-450 text-slate-950 font-black px-6 py-2 rounded-lg transition-all"
                  >
                    💾 حفظ تسويات الفاتورة الفورية وإعادة الطباعة
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* شاشة عهد الصرف المفتوحة: اختيار العملية (مصروف ترخيص / أرشيف الفواتير) */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 no-print">
            <button
              type="button"
              onClick={() => setInvoiceView('draft')}
              className="group text-right bg-slate-900 hover:bg-emerald-500/5 border border-emerald-500/30 hover:border-emerald-500 rounded-2xl p-6 transition-all shadow-lg flex items-start gap-4"
              id="open_license_expense_btn"
            >
              <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
                <FilePlus2 className="w-7 h-7" />
              </div>
              <div className="space-y-1">
                <h3 className="font-black text-slate-100 text-base md:text-lg flex items-center gap-2">
                  فتح مصروف ترخيص
                  {draftVouchers.some(v => v.carId) && (
                    <span className="text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/30 px-2 py-0.5 rounded-full font-bold">
                      {draftVouchers.filter(v => v.carId).length} مسودة محفوظة
                    </span>
                  )}
                </h3>
                <p className="text-[11px] md:text-xs text-slate-400 leading-relaxed">
                  يفتح شاشة "مسودة مصروفات ترخيص" بالحجم الكامل لتجهيز بنود الصرف للسيارة، وبعد "ترحيل وحفظ" تقفل الشاشة وترجع هنا.
                </p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setInvoiceView('saved_drafts')}
              className="group text-right bg-slate-900 hover:bg-amber-500/5 border border-amber-500/30 hover:border-amber-500 rounded-2xl p-6 transition-all shadow-lg flex items-start gap-4"
              id="open_saved_drafts_btn"
            >
              <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
                <Save className="w-7 h-7" />
              </div>
              <div className="space-y-1">
                <h3 className="font-black text-slate-100 text-base md:text-lg flex items-center gap-2">
                  المسودات
                  {visibleSavedDrafts.length > 0 && (
                    <span className="text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/30 px-2 py-0.5 rounded-full font-bold">{visibleSavedDrafts.length}</span>
                  )}
                </h3>
                <p className="text-[11px] md:text-xs text-slate-400 leading-relaxed">
                  فواتير محفوظة كمسودة من غير خصم من العهدة — افتحها وعدّل الرأس والبنود وابعتها للمالية وقت ما تحب.
                </p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setInvoiceView('archive')}
              className="group text-right bg-slate-900 hover:bg-indigo-500/5 border border-indigo-500/30 hover:border-indigo-500 rounded-2xl p-6 transition-all shadow-lg flex items-start gap-4"
              id="open_invoices_archive_btn"
            >
              <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shrink-0">
                <Archive className="w-7 h-7" />
              </div>
              <div className="space-y-1">
                <h3 className="font-black text-slate-100 text-base md:text-lg">أرشيف الفواتير</h3>
                <p className="text-[11px] md:text-xs text-slate-400 leading-relaxed">
                  يفتح أرشيف الفواتير بالحجم الكامل — ابحث برقم السيارة أو بالتاريخ لعرض الفواتير وتسويتها وطباعتها.
                </p>
              </div>
            </button>
          </div>

          {/* شاشة مسودة مصروفات ترخيص — بالحجم الكامل */}
          {invoiceView === 'draft' && (
            <div className="fixed inset-0 z-[45] bg-slate-950 overflow-auto mobile-fit no-print" style={{ direction: 'rtl' }} id="license_draft_fullscreen">
              <div className="sticky top-0 z-10 bg-slate-900/95 backdrop-blur border-b border-slate-800 px-4 md:px-8 py-3 flex items-center justify-between gap-3">
                <h2 className="font-black text-slate-100 text-base md:text-xl flex items-center gap-2.5">
                  <FilePlus2 className="w-6 h-6 text-emerald-400" />
                  مسودة مصروفات ترخيص
                </h2>
                <button
                  type="button"
                  onClick={() => setInvoiceView('home')}
                  className="bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs px-4 py-2 rounded-lg flex items-center gap-1.5"
                  title="المسودة بتتحفظ تلقائيًا"
                >
                  <ArrowRight className="w-4 h-4" />
                  رجوع لشاشة عهد الصرف المفتوحة
                </button>
              </div>
              <div className="p-4 md:p-8 space-y-4 max-w-[1900px] mx-auto">
                {statusBanner}
          <div className="space-y-4">
            <div className="flex flex-wrap justify-between items-center gap-3 bg-slate-900 p-4 rounded-xl border border-slate-800">
              <div className="min-w-0 flex-1 basis-56">
                <h3 className="font-extrabold text-slate-100 text-sm flex items-center gap-1.5">
                  <Sparkles className="w-5 h-5 text-emerald-400" />
                  استمارات ومسودات مصروفات السيارات والترخيص قيد التحضير المفتوحة بالنا جروب
                </h3>
                <p className="text-[11px] text-slate-400">يمكنك تشغيل وتحضير أكثر من مصروف ومعالجة الفواتير الفردية في آنٍ واحد بأمان تام.</p>
              </div>
              <button
                onClick={handleAddNewDraftVoucher}
                type="button"
                className="bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs px-4 py-2.5 rounded-lg flex items-center gap-1.5 transition-all shadow-md shadow-emerald-500/10"
              >
                <Plus className="w-4 h-4" />
                فتح مصروف إضافي لسيارة / تصفية أخرى
              </button>
            </div>

            {/* قائمة بحث موحّدة لأرقام السيارات — تُستخدم لتسهيل اختيار السيارة المستهدفة بالصرف */}
            <datalist id="draft-vouchers-cars-datalist">
              {db.cars.map(c => <option key={c.id} value={c.car_number} />)}
            </datalist>

            {/* List draft vouchers side by side or vertical bento stack */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              {draftVouchers.map((v, index) => {
                const voucherTotal = v.items.reduce((sum, i) => sum + i.amount, 0);
                const officialIdToUse = v.officialId || (db.currentUser?.role === 'supervisor' ? db.currentUser?.officialId : '');
                const targetedOfficialAccounts = db.custodyAccounts.filter(ca => ca.official_id === officialIdToUse);

                return (
                  <div key={v.id} className="bg-slate-900 p-5 rounded-2xl border border-slate-800 shadow-lg space-y-4 relative overflow-hidden">
                    {/* Ribbon */}
                    <div className="absolute top-0 right-0 left-0 h-1 bg-gradient-to-r from-emerald-500 to-teal-500"></div>
                    
                    <div className="flex flex-wrap justify-between items-center gap-2 border-b border-white/5 pb-2.5">
                      <div className="flex items-center gap-2">
                        <span className="w-5 h-5 rounded bg-emerald-500 text-slate-950 flex items-center justify-center font-bold text-xs">{index + 1}</span>
                        <h4 className="font-bold text-slate-100 text-xs md:text-sm">مسودة مصروفات ترخيص السيارة المستهدفة الفردية</h4>
                      </div>
                      <button
                        onClick={() => handleRemoveDraftVoucher(v.id)}
                        type="button"
                        className="text-[10px] text-rose-400 hover:text-rose-300 font-bold border border-rose-500/10 hover:bg-rose-500/5 px-2.5 py-1 rounded"
                        title="إلغاء وحذف مسودة الصرف تمامًا"
                      >
                        إلغاء المسودة [X]
                      </button>
                    </div>

                    {/* Form Layout */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                      <div>
                        <label className="block text-slate-400 font-bold mb-1">المسؤول عن الصرف (رابط العهد)</label>
                        <select
                          required
                          disabled={db.currentUser?.role === 'supervisor'}
                          className="w-full p-2 rounded-lg border border-slate-800 bg-slate-950 text-slate-100 font-bold disabled:opacity-75 disabled:cursor-not-allowed"
                          value={v.officialId}
                          onChange={(e) => handleUpdateDraftHeader(v.id, 'officialId', e.target.value)}
                        >
                          <option value="">-- اختر مشرف الصرف --</option>
                          {db.officials.map(o => (
                            <option key={o.id} value={o.id}>
                              {o.name} (💴 {o.cash_custody} | 💳 {o.visa_custody})
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-slate-400 font-bold mb-1">السيارة الواحدة المستهدفة للطباعة والصرف</label>
                        {(() => {
                          const selectedCar = db.cars.find(c => c.id === v.carId);
                          const searchVal = carSearchInputs[v.id] !== undefined ? carSearchInputs[v.id] : (selectedCar?.car_number || '');
                          const cleanedSearch = searchVal.replace(/\s/g, '');
                          const exactMatch = cleanedSearch ? db.cars.find(c => c.car_number.replace(/\s/g, '') === cleanedSearch) : undefined;
                          return (
                            <>
                              <input
                                type="text"
                                required
                                placeholder="اكتب رقم السيارة للبحث..."
                                list="draft-vouchers-cars-datalist"
                                autoComplete="off"
                                className="w-full p-2 rounded-lg border border-slate-800 bg-slate-950 text-slate-100 font-bold"
                                value={searchVal}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setCarSearchInputs(prev => ({ ...prev, [v.id]: val }));
                                  const cleaned = val.replace(/\s/g, '');
                                  const matched = cleaned ? db.cars.find(c => c.car_number.replace(/\s/g, '') === cleaned) : undefined;
                                  handleUpdateDraftHeader(v.id, 'carId', matched ? matched.id : '');
                                  // إحضار مكان الترخيص / إدارة المرور تلقائيًا من بيانات السيارة المسجلة عند اختيارها
                                  if (matched && matched.traffic_office) {
                                    handleUpdateDraftHeader(v.id, 'licenseLocation', matched.traffic_office);
                                  }
                                }}
                              />
                              {searchVal && (
                                <p className={`mt-1 text-[10px] font-bold ${exactMatch ? 'text-emerald-400' : 'text-red-400'}`}>
                                  {exactMatch ? `✅ ${exactMatch.car_number} (${exactMatch.owner_company.split(' ')[0]})` : '❌ لا توجد سيارة بهذا الرقم في النظام'}
                                </p>
                              )}
                            </>
                          );
                        })()}
                      </div>

                      <div>
                        <label className="block text-slate-400 font-bold mb-1">بيان وتفاصيل الترخيص (رأس الفاتورة)</label>
                        <input
                          type="text"
                          className="w-full p-2 rounded-lg border border-slate-800 bg-slate-950 text-slate-100 font-bold placeholder-slate-650"
                          placeholder="مثال: رسوم فحص وتجديد روتيني طفايات"
                          value={v.licenseDetails}
                          onChange={(e) => handleUpdateDraftHeader(v.id, 'licenseDetails', e.target.value)}
                        />
                      </div>

                      <div>
                        <label className="block text-slate-400 font-bold mb-1">مكان الترخيص / إدارة المرور (رأس الفاتورة)</label>
                        <input
                          type="text"
                          className="w-full p-2 rounded-lg border border-slate-800 bg-slate-950 text-slate-100 font-bold placeholder-slate-650"
                          placeholder="مثال: مرور العجمي بالإسكندرية"
                          value={v.licenseLocation}
                          onChange={(e) => handleUpdateDraftHeader(v.id, 'licenseLocation', e.target.value)}
                        />
                      </div>

                      <div>
                        <label className="block text-slate-400 font-bold mb-1">مكان السيارة الحالي (يدوي)</label>
                        <input
                          type="text"
                          className="w-full p-2 rounded-lg border border-slate-800 bg-slate-950 text-slate-100 font-bold placeholder-slate-650"
                          placeholder="مثال: جراج طره / موقع التجمع"
                          value={v.carLocation}
                          onChange={(e) => handleUpdateDraftHeader(v.id, 'carLocation', e.target.value)}
                        />
                      </div>
                    </div>

                    {/* Items table in the draft card */}
                    <div className="space-y-2.5 pt-2 border-t border-slate-800">
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-slate-300 font-extrabold flex items-center gap-1">
                          <BookOpen className="w-3.5 h-3.5 text-emerald-400" />
                          بنود وجداول الصرف المضمنة بالسيارة (وسط الفاتورة)
                        </span>
                        <button
                          type="button"
                          onClick={() => handleAddRowToDraft(v.id)}
                          className="bg-slate-950 hover:bg-slate-800 border border-slate-800 text-[10px] text-slate-200 px-2 py-1 rounded font-bold"
                        >
                          ＋ إضافة بند صرف
                        </button>
                      </div>

                      <div className="space-y-2 max-h-[45vh] overflow-y-auto scrollbar-thin">
                        {v.items.map((row_item, rIdx) => (
                          <div key={row_item.id} className="grid grid-cols-1 sm:grid-cols-12 gap-2 bg-slate-950/40 p-2 rounded-xl border border-slate-800 items-center">
                            <div className="sm:col-span-2 flex items-center justify-between bg-slate-900/60 px-2 py-1 rounded border border-slate-800/40">
                              <span className="font-mono text-[10px] text-slate-400 font-bold">بند {rIdx + 1}</span>
                              <div className="flex gap-1">
                                <button
                                  type="button"
                                  disabled={rIdx === 0}
                                  onClick={() => handleMoveDraftRow(v.id, row_item.id, 'up')}
                                  className={`p-1 rounded bg-slate-950 border border-slate-800 text-slate-400 hover:text-emerald-400 hover:border-emerald-500/30 transition-all ${rIdx === 0 ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer'}`}
                                  title="ترتيب لأعلى"
                                >
                                  <ArrowUp className="w-2.5 h-2.5" />
                                </button>
                                <button
                                  type="button"
                                  disabled={rIdx === v.items.length - 1}
                                  onClick={() => handleMoveDraftRow(v.id, row_item.id, 'down')}
                                  className={`p-1 rounded bg-slate-950 border border-slate-800 text-slate-400 hover:text-emerald-400 hover:border-emerald-500/30 transition-all ${rIdx === v.items.length - 1 ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer'}`}
                                  title="ترتيب لأسفل"
                                >
                                  <ArrowDown className="w-2.5 h-2.5" />
                                </button>
                              </div>
                            </div>
                            
                            <div className="sm:col-span-7">
                              {/* مقترحات البنود المخزّنة: قائمة صغيرة تحت الحقل (5 كحد أقصى) بدل قائمة المتصفح اللي بتغطي الشاشة */}
                              <SuggestInput
                                required
                                suggestions={itemDescSuggestions}
                                className="w-full p-1.5 rounded border border-slate-850 bg-slate-950 text-[11px]"
                                placeholder="اكتب البند: فحص طفايات / تأمين / طابع..."
                                value={row_item.description}
                                onChange={(val) => handleUpdateDraftRow(v.id, row_item.id, 'description', val)}
                              />
                            </div>

                            <div className="sm:col-span-2">
                              <input
                                type="number"
                                required
                                min={1}
                                className="w-full p-1.5 rounded border border-slate-850 bg-slate-950 font-mono font-black text-yellow-400 text-center text-[11px]"
                                placeholder="المبلغ"
                                value={row_item.amount || ''}
                                onChange={(e) => handleUpdateDraftRow(v.id, row_item.id, 'amount', e.target.value)}
                              />
                            </div>

                            <div className="sm:col-span-1 flex justify-center">
                              <button
                                type="button"
                                onClick={() => handleRemoveRowFromDraft(v.id, row_item.id)}
                                className="text-rose-500 hover:text-rose-400 hover:bg-rose-500/5 p-1 rounded"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Action footer within single card */}
                    <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 flex justify-between items-center flex-wrap gap-2 text-xs">
                      <div className="font-mono text-slate-330">
                        مجموع قيمة الكارت: <span className="font-black text-emerald-400">{voucherTotal.toLocaleString()} ج.م</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          onClick={() => handleSaveVoucherAsDraft(v.id)}
                          type="button"
                          className="bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/40 font-extrabold px-4 py-2 rounded-lg transition-all flex items-center gap-1.5"
                          title="حفظ من غير خصم من العهدة وبدون إرسال للمالية — تقدر تعدّلها بعدين"
                        >
                          <Save className="w-4 h-4" />
                          حفظ كمسودة
                        </button>
                        <button
                          onClick={() => handleFinalizeSaveVoucher(v.id)}
                          type="button"
                          className="bg-emerald-600 hover:bg-emerald-500 text-slate-950 hover:text-white font-extrabold px-5 py-2 rounded-lg transition-all shadow"
                        >
                          💾 حفظ وإرسال (ترحيل وطباعة A5)
                        </button>
                      </div>
                    </div>

                  </div>
                );
              })}
            </div>
          </div>

              </div>
            </div>
          )}

          {/* شاشة المسودات المحفوظة — بالحجم الكامل */}
          {invoiceView === 'saved_drafts' && (
            <div className="fixed inset-0 z-[45] bg-slate-950 overflow-auto mobile-fit no-print" style={{ direction: 'rtl' }} id="saved_drafts_fullscreen">
              <div className="sticky top-0 z-10 bg-slate-900/95 backdrop-blur border-b border-slate-800 px-4 md:px-8 py-3 flex items-center justify-between gap-3">
                <h2 className="font-black text-slate-100 text-base md:text-xl flex items-center gap-2.5">
                  <Save className="w-6 h-6 text-amber-400" />
                  المسودات ({visibleSavedDrafts.length})
                </h2>
                <button
                  type="button"
                  onClick={() => setInvoiceView('home')}
                  className="bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs px-4 py-2 rounded-lg flex items-center gap-1.5"
                >
                  <ArrowRight className="w-4 h-4" />
                  رجوع لشاشة عهد الصرف المفتوحة
                </button>
              </div>
              <div className="p-4 md:p-8 space-y-4 max-w-[1200px] mx-auto">
                {statusBanner}
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  المسودة مش بتخصم من العهدة ومش بتظهر للمالية ولا في التقارير. افتحها وعدّل أي حاجة، وبعدين اضغط "حفظ وإرسال" وقت ما تكون جاهزة.
                </p>
                {visibleSavedDrafts.length === 0 && (
                  <div className="bg-slate-900 border border-slate-800 rounded-2xl p-10 text-center text-slate-400 font-bold text-sm">
                    مفيش مسودات محفوظة. من استمارة "فتح مصروف ترخيص" اضغط "حفظ كمسودة".
                  </div>
                )}
                {visibleSavedDrafts.map(d => {
                  const dItems = db.invoiceDraftItems.filter(i => i.invoice_id === d.id);
                  const dCar = db.cars.find(c => c.id === d.car_id);
                  const dOfficial = db.officials.find(o => o.id === d.official_id);
                  return (
                    <div key={d.id} className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-3 text-xs">
                          <span className="font-black text-amber-300">مسودة</span>
                          <span className="text-slate-400 font-mono">{String(d.invoice_date || '').slice(0, 10)}</span>
                          <span className="font-bold text-emerald-400">{dCar ? dCar.car_number : 'لم تُحدد سيارة'}</span>
                          <span className="font-semibold text-slate-300">{dOfficial ? dOfficial.name : 'لم يُحدد مسؤول'}</span>
                        </div>
                        <span className="font-black font-mono text-yellow-400">{d.total_amount.toLocaleString()} ج.م</span>
                      </div>
                      {(d.license_details || d.license_location) && (
                        <p className="text-[11px] text-slate-400">{d.license_details}{d.license_location ? ` — ${d.license_location}` : ''}</p>
                      )}
                      <ul className="text-[11px] text-slate-300 space-y-0.5">
                        {dItems.map(i => (
                          <li key={i.id} className="flex justify-between gap-3">
                            <span className="min-w-0 break-words">{i.description || 'بند بدون وصف'}</span>
                            <span className="font-mono shrink-0">{i.amount.toLocaleString()}</span>
                          </li>
                        ))}
                        {dItems.length === 0 && <li className="text-slate-500">لا توجد بنود بعد.</li>}
                      </ul>
                      <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-800">
                        <button
                          type="button"
                          onClick={() => handleEditSavedDraft(d)}
                          className="bg-emerald-600 hover:bg-emerald-500 text-slate-950 hover:text-white font-extrabold text-xs px-4 py-2 rounded-lg"
                        >
                          فتح وتعديل / إرسال
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteSavedDraft(d)}
                          className="bg-rose-950/40 hover:bg-rose-900/50 text-rose-300 border border-rose-500/30 font-bold text-xs px-4 py-2 rounded-lg flex items-center gap-1.5"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          مسح المسودة
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* شاشة أرشيف الفواتير — بالحجم الكامل */}
          {invoiceView === 'archive' && (
            <div className="fixed inset-0 z-[45] bg-slate-950 overflow-auto mobile-fit no-print" style={{ direction: 'rtl' }} id="invoices_archive_fullscreen">
              <div className="sticky top-0 z-10 bg-slate-900/95 backdrop-blur border-b border-slate-800 px-4 md:px-8 py-3 flex items-center justify-between gap-3">
                <h2 className="font-black text-slate-100 text-base md:text-xl flex items-center gap-2.5">
                  <Archive className="w-6 h-6 text-indigo-400" />
                  أرشيف الفواتير
                </h2>
                <button
                  type="button"
                  onClick={() => setInvoiceView('home')}
                  className="bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs px-4 py-2 rounded-lg flex items-center gap-1.5"
                >
                  <ArrowRight className="w-4 h-4" />
                  رجوع لشاشة عهد الصرف المفتوحة
                </button>
              </div>
              <div className="p-4 md:p-8 space-y-4 max-w-[1900px] mx-auto">
                {statusBanner}
            <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800 space-y-4">
              <div className="border-b border-slate-800 pb-2.5">
                <h3 className="font-bold text-slate-100 text-sm">أرشيف الفواتير ومصروفات ترخيص السيارات المعتمدة</h3>
                <p className="text-[11px] text-slate-400">سجل المدفوعات الموثق - يدعم التعديل اللاحق (التسوية)، التعطيل المالي والطباعة الفورية على قياس A5 المعتمد. لا تظهر الفواتير إلا بعد كتابة رقم السيارة في البحث أو تحديد تاريخ.</p>
              </div>

              {/* Universal Search Box & Toggle */}
              <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
                <div className="relative flex-1">
                  <input
                    type="text"
                    placeholder="اكتب رقم السيارة للبحث (أو رقم الفاتورة / اسم المسؤول)..."
                    className="w-full text-xs p-2.5 pl-8 pr-3 rounded-lg border border-slate-800 bg-slate-950 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                    value={archiveSearchQuery}
                    onChange={(e) => setArchiveSearchQuery(e.target.value)}
                  />
                  {archiveSearchQuery && (
                    <button
                      type="button"
                      onClick={() => setArchiveSearchQuery('')}
                      className="absolute left-2.5 top-2.5 text-slate-400 hover:text-slate-200 text-xs"
                    >
                      ✕
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-1.5 text-[11px] text-slate-400 font-bold whitespace-nowrap">
                  <span>من تاريخ</span>
                  <input
                    type="date"
                    className="text-xs p-2 rounded-lg border border-slate-800 bg-slate-950 text-slate-100 font-mono focus:outline-none focus:border-emerald-500"
                    value={archiveDateFrom}
                    onChange={(e) => setArchiveDateFrom(e.target.value)}
                  />
                  <span>إلى</span>
                  <input
                    type="date"
                    className="text-xs p-2 rounded-lg border border-slate-800 bg-slate-950 text-slate-100 font-mono focus:outline-none focus:border-emerald-500"
                    value={archiveDateTo}
                    onChange={(e) => setArchiveDateTo(e.target.value)}
                  />
                  {(archiveDateFrom || archiveDateTo) && (
                    <button type="button" onClick={() => { setArchiveDateFrom(''); setArchiveDateTo(''); }} className="text-slate-400 hover:text-slate-200 px-1" title="مسح التاريخ">✕</button>
                  )}
                </div>
                <label className="flex items-center gap-1.5 cursor-pointer text-slate-300 select-none font-semibold hover:text-slate-100 text-[11px] whitespace-nowrap bg-slate-950/40 px-2.5 py-2.5 rounded-lg border border-slate-800">
                  <input
                    type="checkbox"
                    className="rounded text-emerald-500 focus:ring-emerald-500 h-3.5 w-3.5 bg-slate-950 border-slate-800"
                    checked={showDeletedInvoices}
                    onChange={(e) => setShowDeletedInvoices(e.target.checked)}
                  />
                  <span>عرض الفواتير الملغاة</span>
                </label>
                <button
                  type="button"
                  onClick={handlePrintInvoicesA4}
                  disabled={archiveSort.sorted.length === 0}
                  className="bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 text-white font-bold text-[11px] px-3 py-2.5 rounded-lg flex items-center gap-1.5 whitespace-nowrap"
                  title="طباعة الكشف على A4 بالترتيب الحالي (برأس وتذييل فيهم التاريخ واسم المستخدم)"
                >
                  <Printer className="w-3.5 h-3.5" /> طباعة كشف A4
                </button>
              </div>

              <div className="xl-wrap text-[11px]" style={{ maxHeight: 'calc(100vh - 300px)' }}>
                <table className="xl-table xl-plain w-full text-right">
                  <thead>
                    <tr className="bg-slate-950 text-slate-400 font-medium">
                      <SortableTh label="رقم الفاتورة" sortKey="number" sort={archiveSort.sort} onToggle={archiveSort.toggle} sticky />
                      <SortableTh label="التاريخ" sortKey="date" sort={archiveSort.sort} onToggle={archiveSort.toggle} />
                      <SortableTh label="السيارة" sortKey="car" sort={archiveSort.sort} onToggle={archiveSort.toggle} />
                      <SortableTh label="المسؤول عن الصرف" sortKey="official" sort={archiveSort.sort} onToggle={archiveSort.toggle} />
                      <SortableTh label="قيمة الفاتورة ج.م" sortKey="amount" sort={archiveSort.sort} onToggle={archiveSort.toggle} />
                      <th className="xl-th">تسوية وعمليات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      const filtered = archiveSort.sorted;

                      if (filtered.length === 0) {
                        return (
                          <tr>
                            <td colSpan={6} className="py-16 text-center text-slate-500">
                              {hasArchiveCriteria
                                ? 'لا توجد نتائج تطابق القيمة المبحوث عنها.'
                                : '🔎 اكتب رقم السيارة في خانة البحث أو اختر تاريخًا لعرض الفواتير.'}
                            </td>
                          </tr>
                        );
                      }

                      return filtered.map(inv => {
                        const official = (db.officials.find(o => o.id === inv.official_id) || (db.getOfficialName(inv.official_id) ? ({ id: inv.official_id, name: db.getOfficialName(inv.official_id) + ' (محذوف)' } as any) : undefined));
                        const targetCar = db.cars.find(c => c.id === inv.car_id);
                        return (
                          <tr key={inv.id} className={`border-b border-white/5 hover:bg-white/[0.02] ${inv.is_deleted ? 'opacity-50 bg-rose-950/5' : ''}`}>
                            <td className="xl-sticky-col py-3 px-2 font-mono font-bold text-slate-100">
                              <div className="flex flex-wrap items-center gap-1.5">
                              <span className={inv.is_deleted ? 'line-through text-rose-450/80' : ''}>
                                {inv.invoice_number}
                              </span>
                              {inv.is_modified && (
                                <span className="text-[8px] bg-amber-950 text-amber-400 border border-amber-500/20 px-1 rounded inline-block" title={`نسخة معدلة رقم ${inv.version}`}>
                                  معدلة ({inv.version})
                                </span>
                              )}
                              {!inv.is_deleted && inv.approval_status === 'returned' && (
                                <span className="text-[8px] bg-rose-950 text-rose-300 border border-rose-500/30 px-1 rounded inline-block max-w-[180px] whitespace-normal leading-snug" title={inv.return_reason || ''}>
                                  مرتجعة من المالية: {inv.return_reason || 'بدون سبب'}
                                </span>
                              )}
                              {!inv.is_deleted && (inv.approval_status || 'approved') === 'pending' && (
                                <span className="text-[8px] bg-amber-950 text-amber-400 border border-amber-500/20 px-1 rounded inline-block" title="لسه بانتظار موافقة المالية — مفيش خصم من العهدة">
                                  قيد موافقة المالية
                                </span>
                              )}
                              {!inv.is_deleted && (inv.approval_status || 'approved') === 'approved' && inv.approved_at && (
                                <span className="text-[8px] bg-emerald-950 text-emerald-400 border border-emerald-500/20 px-1 rounded inline-block" title={`اعتمدها ${inv.approved_by || ''}`}>
                                  معتمدة
                                </span>
                              )}
                              {inv.is_deleted && (
                                <span className="text-[8px] bg-rose-950 text-rose-400 border border-rose-500/20 px-1 rounded inline-block">
                                  ملغاة ومحذوفة (مسترد)
                                </span>
                              )}
                              </div>
                            </td>
                            <td className="py-3 px-2 font-mono text-slate-300 whitespace-nowrap">{String(inv.invoice_date || '').slice(0, 10)}</td>
                            <td className={`py-3 px-2 font-black ${inv.is_deleted ? 'text-slate-500 line-through' : 'text-emerald-400'}`}>{targetCar ? targetCar.car_number : "سيارة عامة"}</td>
                            <td className={`py-3 px-2 text-center font-semibold ${inv.is_deleted ? 'text-slate-500' : 'text-slate-300'}`}>{official?.name || "مشرف تراخيص"}</td>
                            <td className={`py-3 px-2 text-left font-mono font-black ${inv.is_deleted ? 'text-rose-400 line-through' : 'text-yellow-400'}`}>{inv.total_amount.toLocaleString()} ج.م</td>
                            <td className="py-3 px-2 text-left space-x-1.5 space-x-reverse whitespace-nowrap">
                              <button
                                onClick={() => triggerReprint(inv.id)}
                                type="button"
                                className="bg-emerald-900/20 text-emerald-400 hover:bg-emerald-900/40 p-1.5 rounded transition-all"
                                title="طباعة مستند A5 معتمد"
                              >
                                <Printer className="w-3.5 h-3.5" />
                              </button>
                              {!inv.is_deleted && (
                                <button
                                  onClick={() => handleCloneInvoice(inv)}
                                  type="button"
                                  className="bg-indigo-900/20 text-indigo-300 hover:bg-indigo-900/40 p-1.5 rounded transition-all"
                                  title="نسخ بنود الفاتورة في استمارة جديدة (بدون السيارة)"
                                >
                                  <Copy className="w-3.5 h-3.5" />
                                </button>
                              )}
                              {!inv.is_deleted && inv.approval_status === 'returned' && (db.currentUser?.role !== 'supervisor' || inv.official_id === db.currentUser.officialId) && (
                                <button
                                  onClick={() => {
                                    const res = db.resubmitInvoice(inv.id);
                                    if (res.success) showStatus('تم إعادة إرسال الفاتورة لموافقة المالية.', 'success');
                                    else showStatus(res.error || 'تعذّرت إعادة الإرسال.', 'error');
                                  }}
                                  className="bg-amber-500 hover:bg-amber-400 text-white font-bold text-[10px] px-2 py-1 rounded"
                                  title="إعادة إرسال الفاتورة للمالية بدون تعديل"
                                  type="button"
                                >
                                  إعادة إرسال
                                </button>
                              )}
                              {!inv.is_deleted && canModifyInvoice(inv) && (db.currentUser?.role !== 'supervisor' || inv.official_id === db.currentUser.officialId) && (
                                <button
                                  onClick={() => handleOpenEditPreFinalized(inv)}
                                  type="button"
                                  className="bg-slate-850 text-slate-300 hover:bg-slate-750 p-1.5 rounded transition-all"
                                  title="تعديل محاسبي وتسوية لاحقة للفاتورة"
                                >
                                  <History className="w-3.5 h-3.5" />
                                </button>
                              )}
                              {!canModifyInvoice(inv) && (
                                <span className="bg-slate-800 text-slate-400 p-1.5 rounded inline-flex" title="معتمدة من المالية — التعديل والحذف لأدمن البرنامج فقط">
                                  <Lock className="w-3.5 h-3.5" />
                                </span>
                              )}
                              {canModifyInvoice(inv) && (inv.is_deleted ? (
                                (db.currentUser?.role !== 'supervisor' || inv.official_id === db.currentUser.officialId) && (
                                  <button
                                    onClick={() => handleRestoreInvoiceClick(inv)}
                                    type="button"
                                    className="bg-amber-900/20 text-text-amber-400 hover:bg-amber-900/40 p-1.5 rounded transition-all"
                                    title="إعادة تنشيط واستعادة الفاتورة خصمًا من العهد"
                                  >
                                    <RotateCcw className="w-3.5 h-3.5 text-amber-405" />
                                  </button>
                                )
                              ) : (
                                (db.currentUser?.role !== 'supervisor' || inv.official_id === db.currentUser.officialId) && (
                                  <button
                                    onClick={() => handleDeleteInvoiceClick(inv)}
                                    type="button"
                                    className="bg-rose-900/20 text-rose-400 hover:bg-rose-900/40 p-1.5 rounded transition-all"
                                    title="إلغاء المعاملة واسترداد الأرصدة إلى الخزائن"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                )
                              ))}
                              {db.currentUser?.role !== 'supervisor' && canModifyInvoice(inv) && (
                                <button
                                  onClick={() => handlePurgeInvoiceClick(inv)}
                                  type="button"
                                  className="bg-rose-600 text-white hover:bg-rose-700 p-1.5 rounded transition-all"
                                  title="حذف نهائي كلي للفاتورة ومصروفاتها تماماً من خوادم النظام"
                                >
                                  <AlertOctagon className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      });
                    })()}
                  </tbody>
                </table>
              </div>
            </div>
              </div>
            </div>
          )}

          {/* سجل المحاسبة وتدقيق الحركات */}
          <div className="pt-2">
            <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800 space-y-4">
              <div className="border-b border-slate-800 pb-2.5 flex items-center gap-1.5">
                <ScrollText className="w-4 h-4 text-emerald-450" />
                <div>
                  <h3 className="font-bold text-slate-100 text-sm">سجل المحاسبة وتدقيق الحركات المركزي بالبنا جروب</h3>
                  <p className="text-[11px] text-slate-400">سجلات (Invoice_Audit_Logs) - المراجعة وحظر التلاعب بالمللي ثانية</p>
                </div>
              </div>

              <div className="overflow-y-auto text-[10px] space-y-2.5 max-h-[250px] pr-1 scrollbar-thin">
                {db.auditLogs.map((log) => (
                  <div key={log.id} className="p-3 bg-slate-950 rounded-xl border border-slate-850 space-y-1">
                    <div className="flex items-center justify-between text-[9px] font-mono">
                      <div className="flex items-center gap-1">
                        {log.operation_type === 'create' && <span className="text-[8px] bg-emerald-950 text-emerald-400 font-bold px-1 rounded border border-emerald-500/20">تأسيس</span>}
                        {log.operation_type === 'edit' && <span className="text-[8px] bg-amber-950 text-amber-400 font-bold px-1 rounded border border-amber-500/20">تعديل محاسبي</span>}
                        {log.operation_type === 'delete' && <span className="text-[8px] bg-rose-950 text-rose-400 font-bold px-1 rounded border border-rose-500/20">إلغاء واسترداد</span>}
                        <span className="font-bold text-slate-200">{log.invoice_number}</span>
                      </div>
                      <span className="text-slate-500">{new Date(log.timestamp).toLocaleString('ar-EG')}</span>
                    </div>
                    <p className="text-slate-300 font-semibold">• المسؤول القائم بالحركة: <span className="font-extrabold text-indigo-400">{log.supervisor_name}</span></p>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-1 bg-slate-900 p-2 rounded border border-slate-800 text-[9px] leading-relaxed">
                      <div><span className="text-slate-500">تفاصيل القيد السلف:</span> <p className="text-rose-400">{log.old_value}</p></div>
                      <div><span className="text-slate-500">البيان الحالي المعتمد:</span> <span className="text-emerald-400 font-semibold">{log.new_value}</span></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

          </div>

        </div>
      )}


      {/* --- RENDER TAB 2: CUSTODIES ACCOUNTS & TRANSFER --- */}
      {activeSubTab === 'custodies' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          {/* RIGHT PANELS: CONFIGURE/ADD LICENSING OFFICERS & SPLIT (DIVIDE) CUSTODIES */}
          <div className="lg:col-span-8 space-y-6">
            
            {/* 1. SECTION: REGISTER LICENSING OFFICER (مسؤول تراخيص جديد مع عهدة رئيسية) */}
            {db.currentUser?.role !== 'supervisor' && (
              <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800 space-y-4">
                <h3 className="font-black text-slate-100 text-xs md:text-sm flex items-center gap-2 border-b border-slate-800 pb-2.5">
                  <UserCheck className="w-5 h-5 text-indigo-400" />
                  <span>إضافة وتوثيق مسؤول تراخيص جديد للعهد المالية (مجموعة البنا)</span>
                </h3>
                
                <form onSubmit={handleCreateOfficial} className="grid grid-cols-1 sm:grid-cols-4 gap-4 items-end text-xs font-sans">
                  <div className="sm:col-span-2">
                    <label className="block text-slate-400 font-bold mb-1">اسم مسؤول التراخيص القائم بلجنة الترخيص</label>
                    <input
                      type="text"
                      required
                      placeholder="كتب الاسم الثلاثي والمقر..."
                      className="w-full p-2.5 rounded-lg border border-slate-800 bg-slate-950 text-slate-100"
                      value={newOfficialName}
                      onChange={(e) => setNewOfficialName(e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="block text-slate-400 font-bold mb-1">قيمة العهدة الكاش ج.م</label>
                    <input
                      type="number"
                      min={0}
                      placeholder="0"
                      className="w-full p-2.5 rounded-lg border border-slate-800 bg-slate-950 text-slate-100 font-mono font-bold"
                      value={newOfficialInitialCash || ''}
                      onChange={(e) => setNewOfficialInitialCash(Number(e.target.value))}
                    />
                  </div>

                  <div>
                    <label className="block text-slate-400 font-bold mb-1">قيمة عهدة الفيزا ج.م</label>
                    <input
                      type="number"
                      min={0}
                      placeholder="0"
                      className="w-full p-2.5 rounded-lg border border-slate-800 bg-slate-950 text-slate-100 font-mono font-bold"
                      value={newOfficialInitialVisa || ''}
                      onChange={(e) => setNewOfficialInitialVisa(Number(e.target.value))}
                    />
                  </div>

                  <div className="sm:col-span-4 flex justify-end">
                    <button
                      type="submit"
                      className="bg-indigo-600 hover:bg-indigo-505 text-white font-extrabold px-6 py-2.5 rounded-lg transition-all"
                    >
                      💾 توثيق مسؤول التراخيص وحفظ العهدة المركزية
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* 1.5. SECTION: MANAGE PASSWORD FOR ALL OFFICIALS */}
            {db.currentUser?.role !== 'supervisor' && (
              <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800 space-y-4">
                <h3 className="font-black text-slate-100 text-xs md:text-sm flex items-center gap-2 border-b border-slate-800 pb-2.5">
                  <Lock className="w-5 h-5 text-rose-450 animate-pulse" />
                  <span>🔐 إدارة كلمات مرور مسؤولي الصرف (المشرفين)</span>
                </h3>

                <p className="text-[11px] text-slate-400">
                  تستطيع من هنا معرفة كلمة المرور الحالية لجميع المشرفين والمسؤولين، أو تحديث وتعيين كلمات مرور جديدة لتمكينهم من تسجيل الدخول، أو حذف أي مشرف صرف، أو إنشاء عهدة (يدويًا) لمستخدم موجود.
                </p>

                <div className="overflow-x-auto">
                  <table className="w-full text-xs font-sans text-right">
                    <thead>
                      <tr className="border-b border-slate-800 text-slate-400">
                        <th className="py-2.5 px-3 font-bold text-right">اسم مسؤول الصرف</th>
                        <th className="py-2.5 px-3 font-bold text-center">مستخدم الدخول</th>
                        <th className="py-2.5 px-3 font-bold text-center">كلمة السر</th>
                        <th className="py-2.5 px-3 font-bold text-center">تعيين كلمة سر جديدة</th>
                        <th className="py-2.5 px-3 font-bold text-center">حذف</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-850">
                      {db.officials.map(o => {
                        return (
                          <AdminOfficialPasswordRow 
                            key={o.id} 
                            official={o} 
                            linkedUserName={db.systemUsers.find(u => u.linked_official_id === o.id)?.username}
                            onUpdate={async (newP) => {
                              const r = await db.updateOfficialPassword(o.id, newP);
                              if (r.success) showStatus(`تم تحديث كلمة المرور للمسؤول (${o.name}).`, "success");
                              else showStatus(r.error || 'تعذّر تحديث كلمة المرور', "error");
                            }}
                            onDelete={() => handleDeleteOfficial(o)}
                          />
                        );
                      })}
                      {db.officials.length === 0 && (
                        <tr><td colSpan={5} className="py-6 text-center text-slate-500">لا يوجد مشرفو صرف.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {/* إنشاء العهدة يدويًا للمستخدمين اللي ملهمش حساب عهدة (مش تلقائي عند إنشاء المستخدم) */}
                {(() => {
                  const usersNoCustody = db.systemUsers.filter(u => !u.linked_official_id || !db.officials.some(o => o.id === u.linked_official_id));
                  if (usersNoCustody.length === 0) return null;
                  return (
                    <div className="space-y-2 pt-3 border-t border-slate-800">
                      <h4 className="font-black text-slate-200 text-xs flex items-center gap-1.5">
                        <UserPlus className="w-4 h-4 text-emerald-400" />
                        إنشاء عهدة لمستخدم كمشرف صرف
                      </h4>
                      <p className="text-[11px] text-slate-400">
                        المستخدمين دول مالهمش حساب عهدة. اختر المستخدم واكتب الرصيد الابتدائي (اختياري) واضغط إنشاء — العهدة بتتنشأ بس لما تضغط، مش تلقائي.
                      </p>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs font-sans text-right">
                          <thead>
                            <tr className="border-b border-slate-800 text-slate-400">
                              <th className="py-2 px-3 font-bold text-right">المستخدم</th>
                              <th className="py-2 px-3 font-bold text-center">عهدة كاش ج.م</th>
                              <th className="py-2 px-3 font-bold text-center">عهدة فيزا ج.م</th>
                              <th className="py-2 px-3 font-bold text-center">إجراء</th>
                            </tr>
                          </thead>
                          <tbody>
                            {usersNoCustody.map(u => (
                              <UserWithoutCustodyRow
                                key={u.id}
                                displayName={u.display_name}
                                username={u.username}
                                onCreate={(cash, visa) => handleCreateOfficialForUser(u.id, u.display_name, cash, visa)}
                              />
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}

            {/* 2. SUB REGION: SPLIT THE MAIN CUSTODY (تقسيم العهد كاش وفيزا وبطاقات أخرى) */}
            <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800 space-y-4">
              <h3 className="font-black text-slate-100 text-xs md:text-sm flex items-center gap-2 border-b border-slate-800 pb-2.5">
                <Layers className="w-5 h-5 text-emerald-400" />
                <span>شاشة تقسيم العهدة الرئيسية (خزينة كاش / بنوك وبطاقات فيزا)</span>
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {/* Official selector to load their split sub-accounts */}
                <div className="sm:col-span-3">
                  <label className="block text-slate-400 font-bold mb-1">يرجى اختيار مسؤول التراخيص للتقسيم وإدارة حساباته الفرعية</label>
                  <select
                    disabled={db.currentUser?.role === 'supervisor'}
                    className="w-full p-2.5 rounded-lg border border-slate-800 bg-slate-950 text-slate-100 font-bold text-xs disabled:opacity-75 disabled:cursor-not-allowed"
                    value={selectedOfficialForDetail}
                    onChange={(e) => {
                      if (db.currentUser?.role !== 'supervisor') {
                        setSelectedOfficialForDetail(e.target.value);
                      }
                    }}
                  >
                    {db.currentUser?.role !== 'supervisor' && <option value="">-- اختر مسؤول العهدة المالية لقيد الكروت وحساباتها --</option>}
                    {db.officials.map(o => (
                      <option key={o.id} value={o.id}>{o.name}</option>
                    ))}
                  </select>
                </div>

                {selectedOfficialForDetail && (
                  <>
                    {/* رصيد العهدة الرئيسية الإجمالي (مجموع العهد الفرعية) */}
                    {(() => {
                      const subAccounts = db.custodyAccounts.filter(ca => ca.official_id === selectedOfficialForDetail);
                      const totalBalance = subAccounts.reduce((sum, ca) => sum + ca.balance, 0);
                      const targetOfficial = db.officials.find(o => o.id === selectedOfficialForDetail);
                      
                      return (
                        <div className="sm:col-span-3 bg-emerald-950/20 border border-emerald-500/25 p-4 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                          <div>
                            <span className="text-xs text-slate-300 font-bold block mb-1">
                              💎 رصيد العهدة الرئيسية للمشرف ({targetOfficial?.name}):
                            </span>
                            <span className="text-slate-400 text-[10px] block">
                              يمثل هذا المبلغ الرصيد التراكمي الموحّد الفعلي لكافة الخزائن الفرعية وبطاقات الفيزا البنكية المسجلة للمسؤول.
                            </span>
                          </div>
                          <div className="text-left whitespace-nowrap bg-slate-950 px-4 py-2.5 rounded-lg border border-slate-800">
                            <span className="font-mono text-base md:text-lg font-black text-yellow-500">
                              {totalBalance.toLocaleString()} ج.م
                            </span>
                          </div>
                        </div>
                      );
                    })()}

                    {/* Add new Dynamic Card/Sub account Form */}
                    <div className="bg-slate-950/40 p-4 rounded-xl border border-slate-850 space-y-3 sm:col-span-3">
                      <span className="text-slate-300 font-extrabold text-[12px] block">تأسيس بطاقة فيزا أو خزنة نقود فرعية جديدة:</span>
                      
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                        <div>
                          <label className="block text-slate-500 text-[10px] mb-0.5">اسم الحساب الفرعي (رقم البطاقة/الفيزا)</label>
                          <input
                            type="text"
                            placeholder="مثال: فيزا فوري (114) أو كاش طوارئ"
                            className="w-full p-2 rounded bg-slate-950 border border-slate-800 text-[11px]"
                            value={newSubAccName}
                            onChange={(e) => setNewSubAccName(e.target.value)}
                          />
                        </div>

                        <div>
                          <label className="block text-slate-500 text-[10px] mb-0.5">نوع الكود المصرفي</label>
                          <select
                            className="w-full p-2 rounded bg-slate-950 border border-slate-800 text-[11px]"
                            value={newSubAccType}
                            onChange={(e) => setNewSubAccType(e.target.value as any)}
                          >
                            <option value="cash">💵 نقدي كاش فرعي</option>
                            <option value="visa">💳 كارت فيزا بنك مصر</option>
                            <option value="other_visa">💳 كارت فيزا البنك الأهلي / آخرى</option>
                          </select>
                        </div>

                        <div>
                          <label className="block text-slate-500 text-[10px] mb-0.5">مبلغ تغذية البدء لعهد هذا الحساب ج.م</label>
                          <input
                            type="number"
                            min={0}
                            className="w-full p-2 rounded bg-slate-950 border border-slate-800 font-mono font-bold text-yellow-400 text-[11px]"
                            value={newSubAccBalance || ''}
                            onChange={(e) => setNewSubAccBalance(Number(e.target.value))}
                          />
                        </div>

                        <div className="sm:col-span-3 flex justify-end">
                          <button
                            type="button"
                            onClick={() => handleCreateSubAccount(selectedOfficialForDetail)}
                            className="bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-black px-4 py-1.5 rounded text-xs transition-all flex items-center gap-1"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            تأصيل وتجزئة العهد الفرعية
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* RENDERING SUB ACCOUNTS FOR THE SELECTED OFFICIAL */}
                    <div className="sm:col-span-3">
                      <span className="text-slate-400 font-bold text-xs mb-2 block">الكروت المصرفية والخزائن المرصودة ماليًا للمشرف:</span>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {db.custodyAccounts.filter(ca => ca.official_id === selectedOfficialForDetail).map(acc => {
                          const isEditingThis = fundingAccountId === acc.id;

                          return (
                            <div key={acc.id} className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3 relative overflow-hidden flex flex-col justify-between">
                              <div className="flex justify-between items-start">
                                <div>
                                  <span className="text-[10px] bg-slate-900 border border-slate-805 text-slate-400 font-bold px-2 py-0.5 rounded px-2">
                                    {acc.type === 'cash' ? '💵 كاش' : acc.type === 'visa' ? '💳 بطاقة فيزا 1' : '💳 بطاقة فيزا 2'}
                                  </span>
                                  <h5 className="font-extrabold text-slate-100 text-xs mt-2">{acc.name}</h5>
                                </div>

                                <button
                                  onClick={() => db.deleteCustodyAccount(acc.id)}
                                  type="button"
                                  className="text-[9px] bg-rose-950 text-rose-400 border border-rose-950 px-1.5 py-0.5 rounded hover:bg-rose-900/30"
                                  title="حذف وإلغاء حساب العهدة والبطاقة بنجاح"
                                >
                                  حذف [X]
                                </button>
                              </div>

                              <div className="bg-slate-900 p-2 rounded border border-slate-850 flex items-center justify-between">
                                <span className="text-[10px] text-slate-500 font-bold">الرصيد الحالي:</span>
                                <span className="font-mono text-xs font-black text-emerald-400">{acc.balance.toLocaleString()} ج.م</span>
                              </div>

                              {isEditingThis && (
                                <div className="space-y-1.5 bg-slate-900/60 p-2 rounded border border-emerald-900/30">
                                  <input
                                    type="number"
                                    min={1}
                                    placeholder="مبلغ العهدة الجديدة ج.م"
                                    className="w-full p-1.5 rounded bg-slate-950 border border-slate-700 text-yellow-400 font-mono font-extrabold text-[11px]"
                                    value={fundingAmount || ''}
                                    onChange={(e) => setFundingAmount(Number(e.target.value))}
                                  />
                                  <input
                                    type="text"
                                    placeholder="بيان (اختياري)"
                                    className="w-full p-1.5 rounded bg-slate-950 border border-slate-700 text-[11px]"
                                    value={fundingNote}
                                    onChange={(e) => setFundingNote(e.target.value)}
                                  />
                                </div>
                              )}

                              <div className="flex justify-end gap-1.5 text-[10px] pt-1">
                                {isEditingThis ? (
                                  <>
                                    <button
                                      type="button"
                                      onClick={handleSaveFunding}
                                      className="bg-emerald-600 text-white font-bold px-2.5 py-1 rounded hover:bg-emerald-550"
                                    >
                                      تسجيل العهدة (دائن)
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setFundingAccountId(null)}
                                      className="bg-slate-800 text-slate-400 px-2 py-1 rounded"
                                    >
                                      إلغاء
                                    </button>
                                  </>
                                ) : (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => { setFundingAccountId(acc.id); setFundingAmount(0); setFundingNote(''); }}
                                      className="bg-emerald-950/50 text-emerald-400 border border-emerald-900/30 px-2.5 py-1 rounded hover:bg-emerald-950/80"
                                    >
                                      + إضافة عهدة جديدة
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handlePrintCustodyStatement(acc.id)}
                                      className="bg-indigo-950/50 text-indigo-400 border border-indigo-900/20 px-2 rounded-md hover:bg-indigo-950/85"
                                    >
                                      كشف حركات الكارت
                                    </button>
                                  </>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* 3. DATABASE TABLE: HISTORIC CUSTODY MOVEMENT ACTIONS LEDGER */}
            <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800 space-y-4">
              <div className="border-b border-slate-800 pb-2.5 flex flex-col sm:flex-row gap-3 sm:items-center justify-between">
                <div>
                  <h3 className="font-bold text-slate-100 text-sm">كشف حساب العهدة: حركة (دائن / مدين) ثم الرصيد</h3>
                  <p className="text-[11px] text-slate-400">كل عهدة جديدة بتتسجل دائن، وكل فاتورة معتمدة بتتخصم مدين، والرصيد بيتحسب بعد كل حركة.</p>
                </div>
                <div className="flex items-center gap-1.5 min-w-[200px]">
                  <span className="text-slate-400 text-[10px] whitespace-nowrap font-bold">تصفية العهدة:</span>
                  <select
                    className="w-full text-[10px] bg-slate-950 text-slate-100 border border-slate-800 rounded px-2.5 py-1.5 font-bold focus:outline-none focus:border-emerald-500"
                    value={selectedLedgerAccountId}
                    onChange={(e) => setSelectedLedgerAccountId(e.target.value)}
                  >
                    <option value="all">📁 جميع العهد والحسابات</option>
                    {db.officials.filter(o => db.currentUser?.role !== 'supervisor' || o.id === db.currentUser.officialId).map(o => {
                      const accounts = db.custodyAccounts.filter(ca => ca.official_id === o.id);
                      if (accounts.length === 0) return null;
                      return (
                        <optgroup key={o.id} label={o.name}>
                          {accounts.map(ca => (
                            <option key={ca.id} value={ca.id}>
                              {ca.type === 'cash' ? '💵' : '💳'} {ca.name} (الرصيد: {ca.balance.toLocaleString()} ج.م)
                            </option>
                          ))}
                        </optgroup>
                      );
                    })}
                  </select>
                  <button
                    type="button"
                    onClick={handlePrintLedgerA4}
                    className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-[10px] px-2.5 py-1.5 rounded flex items-center gap-1 whitespace-nowrap"
                    title="طباعة الكشف على A4"
                  >
                    <Printer className="w-3 h-3" /> A4
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto text-[11px]">
                {selectedLedgerAccountId === 'all' ? (
                  <table className="w-full text-right border-collapse">
                    <thead>
                      <tr className="bg-slate-950 text-slate-400">
                        <th className="py-2 px-2.5">التاريخ</th>
                        <th className="py-2 px-2.5">الحساب الفرعي</th>
                        <th className="py-2 px-2.5">البيان وقيد الحركة</th>
                        <th className="py-2 px-2.5 text-left">دائن (عهدة جديدة)</th>
                        <th className="py-2 px-2.5 text-left">مدين (فاتورة)</th>
                        <th className="py-2 px-2.5 text-left bg-emerald-950/10 text-emerald-300 font-extrabold">الرصيد</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(() => {
                        const newestFirst = buildOfficialLedger(db.custodyMovements);
                        
                        if (newestFirst.length === 0) {
                          return (
                            <tr>
                              <td colSpan={6} className="py-8 text-center text-slate-500">لا توجد حركات صادرة أو واردة مسجلة بعد.</td>
                            </tr>
                          );
                        }

                        return newestFirst.map((cm) => {
                          const fromAcc = db.custodyAccounts.find(ca => ca.id === cm.from_account_id);
                          const toAcc = db.custodyAccounts.find(ca => ca.id === cm.to_account_id);
                          const official = db.officials.find(o => o.id === cm.official_id);

                          let accLabel = "";
                          if (fromAcc && toAcc) {
                            accLabel = `${fromAcc.name} ➔ ${toAcc.name}`;
                          } else if (fromAcc) {
                            accLabel = `${fromAcc.name}`;
                          } else if (toAcc) {
                            accLabel = `${toAcc.name}`;
                          } else {
                            accLabel = official ? `عهدة ${official.name}` : "عام";
                          }

                          return (
                            <tr key={cm.id} className="border-b border-white/5 hover:bg-white/[0.01]">
                              <td className="py-2.5 px-2.5 font-mono text-slate-500 text-[10px]">{cm.date}</td>
                              <td className="py-2.5 px-2.5 font-bold text-slate-300">{accLabel}</td>
                              <td className="py-2.5 px-2.5 text-slate-200">
                                <span className="font-semibold block">{cm.description}</span>
                                <div className="text-[9px] text-slate-500 mt-0.5">
                                  {cm.type === 'deposit' && 'إيداع وتغذية'}
                                  {cm.type === 'withdrawal' && 'سحب ومصروف'}
                                  {cm.type === 'transfer' && 'تحويل نقود'}
                                  {cm.type === 'settlement' && 'تسوية'}
                                  {cm.type === 'invoice_charge' && 'خصم مصروفات'}
                                </div>
                              </td>
                              <td className="py-2.5 px-2.5 text-left font-mono font-bold text-emerald-400">
                                {cm.inflow > 0 ? `${cm.inflow.toLocaleString()} ج.م` : '-'}
                              </td>
                              <td className="py-2.5 px-2.5 text-left font-mono font-bold text-rose-450">
                                {cm.outflow > 0 ? `${cm.outflow.toLocaleString()} ج.م` : '-'}
                              </td>
                              <td className="py-2.5 px-2.5 text-left font-mono font-black text-emerald-450 bg-emerald-950/20 rounded">
                                {cm.runningBalanceAfter.toLocaleString()} ج.م
                              </td>
                            </tr>
                          );
                        });
                      })()}
                    </tbody>
                  </table>
                ) : (
                  <table className="w-full text-right border-collapse">
                    <thead>
                      <tr className="bg-slate-950 text-slate-400">
                        <th className="py-2 px-2.5">التاريخ</th>
                        <th className="py-2 px-2.5">البيان والحركة</th>
                        <th className="py-2 px-2.5 text-left">دائن (عهدة جديدة)</th>
                        <th className="py-2 px-2.5 text-left">مدين (فاتورة)</th>
                        <th className="py-2 px-2.5 text-left bg-emerald-950/10 text-emerald-300 font-extrabold">الرصيد</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(() => {
                        const accId = selectedLedgerAccountId;
                        const newestFirst = buildAccountLedger(db.custodyMovements, accId);

                        if (newestFirst.length === 0) {
                          return (
                            <tr>
                              <td colSpan={5} className="py-8 text-center text-slate-500">لا توجد حركات صادرة أو واردة مسجلة على هذه العهدة الفرعية بعد.</td>
                            </tr>
                          );
                        }

                        return newestFirst.map((m) => (
                          <tr key={m.id} className="border-b border-white/5 hover:bg-white/[0.01]">
                            <td className="py-2.5 px-2.5 font-mono text-slate-500">{m.date}</td>
                            <td className="py-2.5 px-2.5 text-slate-200 font-medium">
                              {m.description}
                              <div className="text-[9px] text-slate-500 mt-0.5">
                                {m.type === 'deposit' && 'إيداع وتغذية'}
                                {m.type === 'withdrawal' && 'سحب ومصروف'}
                                {m.type === 'transfer' && 'تحويل نقود'}
                                {m.type === 'settlement' && 'تسوية'}
                                {m.type === 'invoice_charge' && 'خصم مصروفات'}
                              </div>
                            </td>
                            <td className="py-2.5 px-2.5 text-left font-mono font-bold text-emerald-400">
                              {m.inflow > 0 ? `${m.inflow.toLocaleString()} ج.م` : '-'}
                            </td>
                            <td className="py-2.5 px-2.5 text-left font-mono font-bold text-rose-450">
                              {m.outflow > 0 ? `${m.outflow.toLocaleString()} ج.م` : '-'}
                            </td>
                            <td className="py-2.5 px-2.5 text-left font-mono font-black text-emerald-450 bg-emerald-950/20 rounded-md">
                              {m.running.toLocaleString()} ج.م
                            </td>
                          </tr>
                        ));
                      })()}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

          </div>

          {/* LEFT AREA: INTER-CUSTODY TRANSFER FORMS (التحويلات المالية الآمنة للفيزا بالمرور) */}
          <div className="lg:col-span-4 space-y-6">
            
            <div className="bg-gradient-to-br from-indigo-950 to-slate-900 border border-indigo-700/30 p-5 rounded-2xl space-y-4 shadow-xl">
              <h4 className="font-extrabold text-indigo-400 text-xs md:text-sm border-b border-white/10 pb-2.5 flex items-center gap-1.5">
                <ArrowRightLeft className="w-5 h-5 text-indigo-400" />
                <span>بوابة التحويلات المالية الداخلية للعهدة</span>
              </h4>

              <p className="text-[11px] text-slate-350 leading-relaxed">
                تمنحك هذه البوابة تحويل السيولة النقدية أو كوت الفيزا البنكية بين كافة حسابات مسؤولي الحركة والمشرفين بالشركة محاسبياً وتحديث كشوفاتهم تلقائيًا بالمللي ثانية.
              </p>

              <form onSubmit={handleApplyTransfer} className="space-y-4 text-xs">
                <div>
                  <label className="block text-slate-400 font-bold mb-1">من حساب عهدة (السحب الخصم)</label>
                  <select
                    required
                    className="w-full p-2.5 rounded-lg border border-slate-800 bg-slate-950 text-slate-100 font-bold"
                    value={transferFromId}
                    onChange={(e) => setTransferFromId(e.target.value)}
                  >
                    <option value="">-- اختر كاش / فيزا المرسل --</option>
                    {db.officials.map(o => (
                      <optgroup key={o.id} label={`مسؤول: ${o.name}`}>
                        {db.custodyAccounts.filter(ca => ca.official_id === o.id).map(ca => (
                          <option key={ca.id} value={ca.id}>
                            {o.name} - {ca.name} (رصيد متاح: {ca.balance} ج.م)
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-400 font-bold mb-1">إلى حساب عهدة (الإيداع المستلم)</label>
                  <select
                    required
                    className="w-full p-2.5 rounded-lg border border-slate-800 bg-slate-950 text-slate-100 font-bold"
                    value={transferToId}
                    onChange={(e) => setTransferToId(e.target.value)}
                  >
                    <option value="">-- اختر كاش / فيزا المستلم --</option>
                    {db.officials.map(o => (
                      <optgroup key={o.id} label={`مسؤول: ${o.name}`}>
                        {db.custodyAccounts.filter(ca => ca.official_id === o.id).map(ca => (
                          <option key={ca.id} value={ca.id}>
                            {o.name} - {ca.name} (رصيد حالي: {ca.balance} ج.م)
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-400 font-bold mb-1">المبلغ المراد تحويله ج.م</label>
                  <input
                    type="number"
                    required
                    min={1}
                    placeholder="كتب قيمة المبلغ..."
                    className="w-full p-2.5 rounded-lg border border-slate-800 bg-slate-950 font-mono font-bold text-yellow-400 text-center"
                    value={transferAmount || ''}
                    onChange={(e) => setTransferAmount(Number(e.target.value))}
                  />
                </div>

                <div>
                  <label className="block text-slate-400 font-bold mb-1">بيان وسبب التحويل الداخلي</label>
                  <input
                    type="text"
                    required
                    placeholder="مثال: سداد نقدية مستحقة أو قسط غلاف..."
                    className="w-full p-2.5 rounded-lg border border-slate-800 bg-slate-950 text-slate-100"
                    value={transferDesc}
                    onChange={(e) => setTransferDesc(e.target.value)}
                  />
                </div>

                <button
                  type="submit"
                  className="w-full bg-indigo-600 hover:bg-indigo-505 text-white font-black py-3 rounded-lg transition-all shadow-md flex items-center justify-center gap-1.5"
                >
                  <ArrowRightLeft className="w-4 h-4" />
                  <span>تأكيد وتنفيذ التحويل المالي الآمن ✔</span>
                </button>
              </form>
            </div>

            {/* QUICK MONITOR CARD */}
            <div className="bg-slate-900 text-slate-100 p-4 rounded-xl border border-slate-800 space-y-2 text-xs">
              <span className="text-slate-400 font-semibold block border-b border-white/5 pb-1 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                بروتوكول حماية العهد المالية
              </span>
              <p className="text-[10px] text-slate-500 leading-relaxed text-right">
                يعمل محرك قواعد بيانات شركة البنا جروب بمبدأ (PostgreSQL RLS) والحظر المطلق للتجاوزات المصرفية. تنعكس قيم بطاقات الفيزا الفرعية آليًا على لوحة التحكم ومجاميع كشف عهد المشرفين ومجموعات الترخيص بالتزامن.
              </p>
            </div>

          </div>

        </div>
      )}

      {/* --- RENDER TAB 3: PDF INVOICE IMPORT --- */}
      {activeSubTab === 'pdf_import' && (
        <div className="p-2">
          <PdfInvoiceImport />
        </div>
      )}

      {/* --- RENDER TAB 4: CHANGE PASSWORD --- */}
      {activeSubTab === 'change_password' && db.currentUser?.role === 'supervisor' && (
        <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800 max-w-xl mx-auto mt-6 space-y-6">
          <div className="border-b border-slate-800 pb-3 flex items-center gap-2">
            <Key className="w-5 h-5 text-rose-450 animate-pulse" />
            <div>
              <h3 className="font-extrabold text-slate-100 text-sm">تغيير كلمة المرور الشخصية</h3>
              <p className="text-[11px] text-slate-400">تستطيع هنا تحديث كلمة السر التي تدخل بها إلى حسابك الخاص كمشرف صرف بالبنا جروب.</p>
            </div>
          </div>

          {personalPasswordError && (
            <div className="p-3 rounded-lg bg-rose-950/40 border border-rose-550 text-rose-400 font-bold text-xs">
              ⚠️ {personalPasswordError}
            </div>
          )}

          {personalPasswordSuccess && (
            <div className="p-3 rounded-lg bg-emerald-950/40 border border-emerald-555 text-emerald-400 font-bold text-xs">
              ✔️ {personalPasswordSuccess}
            </div>
          )}

          <form onSubmit={async (e) => {
            e.preventDefault();
            setPersonalPasswordError('');
            setPersonalPasswordSuccess('');

            if (personalNewPassword.length < 8) {
              setPersonalPasswordError('يجب أن تكون كلمة المرور الجديدة 8 أحرف على الأقل!');
              return;
            }

            if (personalNewPassword !== personalConfirmPassword) {
              setPersonalPasswordError('كلمة المرور الجديدة وتأكيدها غير متطابقتين!');
              return;
            }

            const r = await db.changeOwnPassword(personalOldPassword, personalNewPassword);
            if (!r.success) {
              setPersonalPasswordError(r.error || 'تعذّر تغيير كلمة المرور');
              return;
            }
            setPersonalPasswordSuccess('تم تحديث كلمة المرور بنجاح!');
            setPersonalOldPassword('');
            setPersonalNewPassword('');
            setPersonalConfirmPassword('');
          }} className="space-y-4 text-xs font-sans">
            <div>
              <label className="block text-slate-400 font-bold mb-1">كلمة المرور الحالية</label>
              <input
                type="password"
                required
                className="w-full p-2.5 rounded-lg border border-slate-800 bg-slate-950 text-slate-100"
                value={personalOldPassword}
                onChange={(e) => setPersonalOldPassword(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-slate-400 font-bold mb-1">كلمة المرور الجديدة</label>
              <input
                type="password"
                required
                className="w-full p-2.5 rounded-lg border border-slate-800 bg-slate-950 text-slate-100"
                value={personalNewPassword}
                onChange={(e) => setPersonalNewPassword(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-slate-400 font-bold mb-1">تأكيد كلمة المرور الجديدة</label>
              <input
                type="password"
                required
                className="w-full p-2.5 rounded-lg border border-slate-800 bg-slate-950 text-slate-100"
                value={personalConfirmPassword}
                onChange={(e) => setPersonalConfirmPassword(e.target.value)}
              />
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="submit"
                className="bg-indigo-650 hover:bg-indigo-600 text-white font-extrabold px-6 py-2.5 rounded-lg transition-all"
              >
                💾 حفظ كلمة المرور الجديدة
              </button>
            </div>
          </form>
        </div>
      )}

    </div>
  );
};
