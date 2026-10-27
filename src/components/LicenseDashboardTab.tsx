/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { escapeHtml } from '../utils/escapeHtml';
import React, { useState } from 'react';
import { useDb } from '../db/store';
import { Car } from '../types';
import { printHtmlDocument } from '../utils/printHtml';
import {
  ShieldAlert,
  Search,
  Calendar,
  AlertTriangle,
  Building,
  User,
  CheckCircle2,
  ListFilter,
  Check,
  RefreshCw,
  FlameKindling,
  FileSpreadsheet,
  RotateCcw,
  SlidersHorizontal,
  Printer,
  X
} from 'lucide-react';

export const LicenseDashboardTab: React.FC = () => {
  const db = useDb();

  // Filter States (React state bound to the form inputs)
  const [universalSearch, setUniversalSearch] = useState('');
  const [expiryStatusFilter, setExpiryStatusFilter] = useState<'all' | 'expired' | 'near_expiry' | 'valid'>('all');
  const [ownerCompanyFilter, setOwnerCompanyFilter] = useState('');
  const [officialFilter, setOfficialFilter] = useState('');
  const [carNumberFilter, setCarNumberFilter] = useState('');
  const [chassisFilter, setChassisFilter] = useState('');
  const [motorFilter, setMotorFilter] = useState('');
  const [modelFilter, setModelFilter] = useState('');
  const [brandFilter, setBrandFilter] = useState('');
  const [carTypeFilter, setCarTypeFilter] = useState('');
  const [driverFilter, setDriverFilter] = useState('');
  const [extinguisherFilter, setExtinguisherFilter] = useState<'all' | 'valid' | 'warning' | 'expired'>('all');
  const [insuranceFilter, setInsuranceFilter] = useState('');
  const [trafficOfficeFilter, setTrafficOfficeFilter] = useState('');

  // Applied filter state (This is updated only when the user clicks the "Search" button)
  const [appliedFilters, setAppliedFilters] = useState({
    universalSearch: '',
    expiryStatusFilter: 'all' as 'all' | 'expired' | 'near_expiry' | 'valid',
    ownerCompanyFilter: '',
    officialFilter: '',
    carNumberFilter: '',
    chassisFilter: '',
    motorFilter: '',
    modelFilter: '',
    brandFilter: '',
    carTypeFilter: '',
    driverFilter: '',
    extinguisherFilter: 'all' as 'all' | 'valid' | 'warning' | 'expired',
    insuranceFilter: '',
    trafficOfficeFilter: '',
  });

  // Pre-set supervisor ID for officialFilter and lock it
  React.useEffect(() => {
    if (db.currentUser?.role === 'supervisor' && db.currentUser?.officialId) {
      setOfficialFilter(db.currentUser.officialId);
      setAppliedFilters(prev => ({ ...prev, officialFilter: db.currentUser?.officialId || '' }));
    }
  }, [db.currentUser]);

  // Action: Apply Search/Filters
  const handleSearch = () => {
    setAppliedFilters({
      universalSearch,
      expiryStatusFilter,
      ownerCompanyFilter,
      officialFilter,
      carNumberFilter,
      chassisFilter,
      motorFilter,
      modelFilter,
      brandFilter,
      carTypeFilter,
      driverFilter,
      extinguisherFilter,
      insuranceFilter,
      trafficOfficeFilter,
    });
  };

  // Action: Reset Search/Filters
  const handleResetFilters = () => {
    setUniversalSearch('');
    setExpiryStatusFilter('all');
    setOwnerCompanyFilter('');
    setOfficialFilter('');
    setCarNumberFilter('');
    setChassisFilter('');
    setMotorFilter('');
    setModelFilter('');
    setBrandFilter('');
    setCarTypeFilter('');
    setDriverFilter('');
    setExtinguisherFilter('all');
    setInsuranceFilter('');
    setTrafficOfficeFilter('');

    setAppliedFilters({
      universalSearch: '',
      expiryStatusFilter: 'all',
      ownerCompanyFilter: '',
      officialFilter: '',
      carNumberFilter: '',
      chassisFilter: '',
      motorFilter: '',
      modelFilter: '',
      brandFilter: '',
      carTypeFilter: '',
      driverFilter: '',
      extinguisherFilter: 'all',
      insuranceFilter: '',
      trafficOfficeFilter: '',
    });
  };

  // Editing Date Picker Dialog State
  const [updatingCarId, setUpdatingCarId] = useState<string | null>(null);
  const [newLicEndDate, setNewLicEndDate] = useState('');
  const [newExtStatus, setNewExtStatus] = useState<'valid' | 'expired' | 'warning'>('valid');

  // License Invoice Print State
  const [printInvoiceCarId, setPrintInvoiceCarId] = useState<string | null>(null);
  const [licInvoiceSearch, setLicInvoiceSearch] = useState('');
  const [showLicInvoiceModal, setShowLicInvoiceModal] = useState(false);

  // Real-time toast indicators
  const [showToast, setShowToast] = useState(false);

  const currentDate = new Date();

  // Determine license state for a car
  const getLicenseStatus = (car: Car) => {
    const expDate = new Date(car.license_end_date);
    const diffTime = expDate.getTime() - currentDate.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (expDate < currentDate) {
      return { label: "منتهية الصلاحية ❌", color: "text-rose-600 bg-rose-50 border-rose-200", status: 'expired', days: diffDays };
    } else if (diffDays <= 30) {
      return { label: `تنتهي خلال ${diffDays} يومًا ⚠️`, color: "text-amber-600 bg-amber-50 border-amber-200", status: 'near_expiry', days: diffDays };
    } else {
      return { label: "سارية ومستوفاة ✔", color: "text-emerald-700 bg-emerald-50 border-emerald-200", status: 'valid', days: diffDays };
    }
  };

  const handleApplyUpdateDate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!updatingCarId || !newLicEndDate) return;

    db.updateCar(updatingCarId, {
      license_end_date: newLicEndDate,
      extinguisher_status: newExtStatus
    });

    setUpdatingCarId(null);
    setNewLicEndDate('');
    
    // Trigger real-time visual notice
    setShowToast(true);
    setTimeout(() => {
      setShowToast(false);
    }, 4500);
  };

  const handleOpenUpdateForm = (car: Car) => {
    setUpdatingCarId(car.id);
    setNewLicEndDate(car.license_end_date);
    setNewExtStatus(car.extinguisher_status);
  };

  // Unique metadata from cars DB to feed filters
  const companies = Array.from(new Set(db.cars.map(c => c.owner_company).filter(Boolean))) as string[];
  const models = Array.from(new Set(db.cars.map(c => c.model).filter(Boolean))) as string[];
  const brands = Array.from(new Set(db.cars.map(c => c.brand).filter(Boolean))) as string[];
  const carTypes = Array.from(new Set(db.cars.map(c => c.car_type).filter(Boolean))) as string[];
  const trafficOffices = Array.from(new Set(db.cars.map(c => c.traffic_office).filter(Boolean))) as string[];

  // Helper to extract numeric part of a car plate number for natural sorting
  const getCarSortVal = (carNumberStr: string): number => {
    const digits = carNumberStr.match(/\d+/);
    return digits ? parseInt(digits[0], 10) : Infinity;
  };

  // Filter Cars strictly based on the APPLIED filter values (Runs on "Search" click)
  const filteredCars = db.cars.filter(car => {
    // Enforce role-based limits for supervisors
    if (db.currentUser?.role === 'supervisor' && car.license_official_id !== db.currentUser.officialId) {
      return false;
    }

    // 1. Universal Search (Plate, chassis, owner, licensor)
    const official = db.officials.find(o => o.id === car.license_official_id);
    const officialName = official ? official.name.toLowerCase() : '';
    const search = appliedFilters.universalSearch.toLowerCase();

    if (search) {
      const matchesSearch = 
        car.car_number.toLowerCase().includes(search) ||
        car.chassis_number.toLowerCase().includes(search) ||
        car.owner_company.toLowerCase().includes(search) ||
        officialName.includes(search);

      if (!matchesSearch) return false;
    }

    // 2. Expiry Status filter
    const licInfo = getLicenseStatus(car);
    if (appliedFilters.expiryStatusFilter !== 'all' && licInfo.status !== appliedFilters.expiryStatusFilter) return false;

    // 3. Owner Company
    if (appliedFilters.ownerCompanyFilter && car.owner_company !== appliedFilters.ownerCompanyFilter) return false;

    // 4. Official filter
    if (appliedFilters.officialFilter && car.license_official_id !== appliedFilters.officialFilter) return false;

    // 5. Plate digits/characters
    if (appliedFilters.carNumberFilter && !car.car_number.toLowerCase().includes(appliedFilters.carNumberFilter.toLowerCase())) return false;

    // 6. Chassis
    if (appliedFilters.chassisFilter && !car.chassis_number.toLowerCase().includes(appliedFilters.chassisFilter.toLowerCase())) return false;

    // 7. Motor
    if (appliedFilters.motorFilter && !car.motor_number.toLowerCase().includes(appliedFilters.motorFilter.toLowerCase())) return false;

    // 8. Model (Year)
    if (appliedFilters.modelFilter && car.model !== appliedFilters.modelFilter) return false;

    // 9. Brand
    if (appliedFilters.brandFilter && !(car.brand || '').toLowerCase().includes(appliedFilters.brandFilter.toLowerCase())) return false;

    // 10. Car Type
    if (appliedFilters.carTypeFilter && !(car.car_type || '').toLowerCase().includes(appliedFilters.carTypeFilter.toLowerCase())) return false;

    // 11. Assigned Driver
    if (appliedFilters.driverFilter && car.driver_id !== appliedFilters.driverFilter) return false;

    // 12. Extinguisher status
    if (appliedFilters.extinguisherFilter !== 'all' && car.extinguisher_status !== appliedFilters.extinguisherFilter) return false;

    // 13. Insurance status
    if (appliedFilters.insuranceFilter && !car.insurance_status.toLowerCase().includes(appliedFilters.insuranceFilter.toLowerCase())) return false;

    // 14. Traffic Office (جهة المرور)
    if (appliedFilters.trafficOfficeFilter && !(car.traffic_office || '').toLowerCase().includes(appliedFilters.trafficOfficeFilter.toLowerCase())) return false;

    return true;
  }).sort((a, b) => {
    const numA = getCarSortVal(a.car_number);
    const numB = getCarSortVal(b.car_number);
    if (numA !== numB) {
      return numA - numB;
    }
    return a.car_number.localeCompare(b.car_number, 'ar-EG');
  });

  // Export Filtered/Searched Car License Status to Excel CSV format
  const handleExportExcel = () => {
    const headers = [
      "رقم لوحة السيارة",
      "الماركة",
      "الموديل",
      "نوع السيارة",
      "رقم الشاسيه",
      "رقم الموتور",
      "إدارة/جهة المرور",
      "الشركة المالكة",
      "تاريخ نهاية الترخيص",
      "حالة الترخيص الجارية",
      "مشرف التراخيص",
      "السائق المكلف",
      "حالة طفاية الحريق",
      "موقف بيانات التأمين"
    ].join(',');

    const rows = filteredCars.map(car => {
      const supervisor = db.officials.find(o => o.id === car.license_official_id)?.name || 'غير محدد';
      const driver = db.drivers.find(d => d.id === car.driver_id)?.name || 'غير محدد';
      const licStatus = getLicenseStatus(car).label.replace(/✔|❌|⚠️/g, '').trim();
      const fireExtInLabel = 
        car.extinguisher_status === 'valid' ? 'سليمة ومتطابقة' :
        car.extinguisher_status === 'warning' ? 'تحذير تقارب نهاية صلاحية' : 'منتهية او تالفة';

      const fields = [
        `"${car.car_number.replace(/"/g, '""')}"`,
        `"${(car.brand || '').replace(/"/g, '""')}"`,
        `"${(car.model || '').replace(/"/g, '""')}"`,
        `"${(car.car_type || '').replace(/"/g, '""')}"`,
        `"${car.chassis_number.replace(/"/g, '""')}"`,
        `"${car.motor_number.replace(/"/g, '""')}"`,
        `"${(car.traffic_office || 'غير محدد').replace(/"/g, '""')}"`,
        `"${car.owner_company.replace(/"/g, '""')}"`,
        `"${car.license_end_date}"`,
        `"${licStatus}"`,
        `"${supervisor.replace(/"/g, '""')}"`,
        `"${driver.replace(/"/g, '""')}"`,
        `"${fireExtInLabel}"`,
        `"${car.insurance_status.replace(/"/g, '""')}"`
      ];

      return fields.join(',');
    }).join('\n');

    // Arabic utf-8 BOM marker (\uFEFF) so Microsoft Excel displays non-ascii properly
    const blob = new Blob(['\uFEFF' + headers + '\r\n' + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `تقرير_تراخيص_السيارات_المفلترة_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Handle printing license invoice for a specific car
  const handlePrintLicenseInvoice = (car: Car) => {
    const driverObj = db.drivers.find(d => d.id === car.driver_id);
    const supervisorObj = db.officials.find(o => o.id === car.license_official_id);
    const licStatus = getLicenseStatus(car);

    const html = `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="UTF-8"/>
<title>فاتورة ترخيص - ${escapeHtml(car.car_number)}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;700;900&display=swap');
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Cairo', Arial, sans-serif; direction: rtl; background: #fff; color: #111; font-size: 13px; }
  .page { max-width: 750px; margin: 20px auto; border: 2px solid #1e293b; padding: 24px; }
  .header { text-align: center; border-bottom: 3px double #1e293b; padding-bottom: 12px; margin-bottom: 16px; }
  .header h1 { font-size: 20px; font-weight: 900; }
  .header h2 { font-size: 13px; color: #555; margin-top: 4px; }
  .car-plate { display: inline-block; background: #f1f5f9; border: 2px solid #334155; border-radius: 8px; padding: 6px 20px; font-size: 22px; font-weight: 900; font-family: 'Calibri', monospace; letter-spacing: 2px; margin: 8px 0; }
  .value.font-mono { font-family: 'Calibri', monospace; }
  .status-badge { display: inline-block; padding: 4px 14px; border-radius: 20px; font-size: 11px; font-weight: 900; margin-top: 6px; }
  .status-expired { background: #fee2e2; color: #991b1b; border: 1px solid #fca5a5; }
  .status-near { background: #fef3c7; color: #92400e; border: 1px solid #fcd34d; }
  .status-valid { background: #d1fae5; color: #065f46; border: 1px solid #6ee7b7; }
  table { width: 100%; border-collapse: collapse; margin-top: 16px; }
  th { background: #1e293b; color: #fff; padding: 8px 12px; text-align: right; font-size: 12px; }
  td { padding: 8px 12px; border-bottom: 1px solid #e2e8f0; }
  tr:nth-child(even) td { background: #f8fafc; }
  .label { color: #64748b; font-weight: 700; width: 40%; }
  .value { font-weight: 900; color: #0f172a; }
  .footer { margin-top: 24px; border-top: 1px dashed #94a3b8; padding-top: 12px; text-align: center; color: #94a3b8; font-size: 10px; }
  .section-title { font-size: 12px; font-weight: 900; color: #334155; background: #f1f5f9; padding: 6px 12px; margin-top: 12px; border-right: 4px solid #3b82f6; }
  @media print { body { margin: 0; } .page { border: none; margin: 0; } }
</style>
</head>
<body>
<div class="page">
  <div class="header">
    <h1>🚗 فاتورة ترخيص سيارة — شركة البنا</h1>
    <h2>تاريخ الطباعة: ${new Date().toLocaleDateString('ar-EG')}</h2>
    <div class="car-plate">${escapeHtml(car.car_number)}</div><br/>
    <span class="status-badge ${licStatus.label.includes('منتهي') ? 'status-expired' : licStatus.label.includes('قريب') ? 'status-near' : 'status-valid'}">${licStatus.label}</span>
  </div>

  <div class="section-title">بيانات السيارة الأساسية</div>
  <table>
    <tr><td class="label">رقم اللوحة</td><td class="value">${escapeHtml(car.car_number)}</td></tr>
    <tr><td class="label">الشركة المالكة</td><td class="value">${escapeHtml(car.owner_company || '—')}</td></tr>
    <tr><td class="label">نوع السيارة</td><td class="value">${escapeHtml(car.car_type || '—')}</td></tr>
    <tr><td class="label">الماركة / الموديل</td><td class="value">${escapeHtml(car.brand || '—')} / ${escapeHtml(car.model || '—')}</td></tr>
    <tr><td class="label">رقم الشاسيه</td><td class="value font-mono">${escapeHtml(car.chassis_number || '—')}</td></tr>
    <tr><td class="label">رقم الموتور</td><td class="value font-mono">${escapeHtml(car.motor_number || '—')}</td></tr>
  </table>

  <div class="section-title">بيانات الترخيص والتأمين</div>
  <table>
    <tr><td class="label">تاريخ انتهاء الترخيص</td><td class="value" style="color:${licStatus.label.includes('منتهي') ? '#dc2626' : '#059669'}">${escapeHtml(car.license_end_date || '—')}</td></tr>
    <tr><td class="label">إدارة / جهة المرور</td><td class="value">${escapeHtml(car.traffic_office || '—')}</td></tr>
    <tr><td class="label">موقف التأمين</td><td class="value">${escapeHtml(car.insurance_status || '—')}</td></tr>
    <tr><td class="label">مشرف الترخيص</td><td class="value">${escapeHtml(supervisorObj ? supervisorObj.name : 'غير مكلف')}</td></tr>
    <tr><td class="label">السائق المكلف</td><td class="value">${escapeHtml(driverObj ? driverObj.name : 'غير مكلف')}</td></tr>
    <tr><td class="label">حالة الطفاية</td><td class="value">${car.extinguisher_status === 'valid' ? '✅ سليمة' : car.extinguisher_status === 'warning' ? '⚠️ تحذير' : '❌ منتهية'}</td></tr>
  </table>

  <div class="footer">
    <p>وثيقة رسمية — نظام إدارة أسطول البنا | تم الإصدار بتاريخ ${new Date().toLocaleDateString('ar-EG')} ${new Date().toLocaleTimeString('ar-EG')}</p>
  </div>
</div>
</body>
</html>`;

    printHtmlDocument(html, { title: `فاتورة ترخيص - ${car.car_number}` });
  };

  // Filter cars for license invoice search
  const licInvoiceSearchResults = licInvoiceSearch.trim()
    ? db.cars.filter(c =>
        c.car_number.toLowerCase().includes(licInvoiceSearch.toLowerCase()) ||
        (c.chassis_number && c.chassis_number.toLowerCase().includes(licInvoiceSearch.toLowerCase()))
      )
    : [];

  return (
    <div className="space-y-6" id="license_dashboard_tab" style={{ direction: 'rtl' }}>
      
      {/* Realtime Toast update signal */}
      {showToast && (
        <div className="p-4 rounded-xl border bg-emerald-50 border-emerald-400/20 text-emerald-800 text-xs md:text-sm font-bold flex items-center gap-2 animate-pulse no-print">
          <CheckCircle2 className="w-5 h-5 text-emerald-600" />
          تم تحديث الترخيص والطفايات بالخادم وتعميم اللون الجديد لحظيًا لجميع المستخدمين على الشبكة! ✔
        </div>
      )}

      {/* License Invoice Search Modal */}
      {showLicInvoiceModal && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 no-print">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full border border-slate-200 overflow-hidden text-right">
            <div className="bg-slate-900 px-5 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Printer className="w-5 h-5 text-emerald-400" />
                <h3 className="text-white font-black text-sm">طباعة فاتورة ترخيص — ابحث برقم السيارة</h3>
              </div>
              <button onClick={() => { setShowLicInvoiceModal(false); setLicInvoiceSearch(''); }} className="text-slate-400 hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-slate-600 font-bold mb-2 text-sm">رقم السيارة أو الشاسيه</label>
                <input
                  type="text"
                  autoFocus
                  placeholder="مثال: أ ب ج 1234 أو رقم الشاسيه..."
                  className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-slate-800 font-medium focus:outline-none focus:border-blue-500 text-sm"
                  value={licInvoiceSearch}
                  onChange={(e) => setLicInvoiceSearch(e.target.value)}
                />
              </div>
              {licInvoiceSearch.trim() && (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {licInvoiceSearchResults.length === 0 ? (
                    <p className="text-center text-slate-400 py-4 font-bold text-sm">لا توجد سيارات مطابقة</p>
                  ) : (
                    licInvoiceSearchResults.map(car => {
                      const licStatus = getLicenseStatus(car);
                      return (
                        <div key={car.id} className="flex items-center justify-between p-3 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors">
                          <div>
                            <span className="font-mono font-black text-slate-800 text-sm">{car.car_number}</span>
                            <span className="text-xs text-slate-400 mr-2">{car.owner_company}</span>
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full mr-1 ${licStatus.label.includes('منتهي') ? 'bg-red-100 text-red-700' : licStatus.label.includes('قريب') ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>{licStatus.label}</span>
                          </div>
                          <button
                            onClick={() => { handlePrintLicenseInvoice(car); setShowLicInvoiceModal(false); setLicInvoiceSearch(''); }}
                            className="flex items-center gap-1.5 bg-slate-900 hover:bg-slate-700 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition-colors"
                          >
                            <Printer className="w-3.5 h-3.5" />
                            طباعة
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Expiry Date picker inline dialog modal */}
      {updatingCarId && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 no-print">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full border border-slate-200 overflow-hidden text-right">
            <div className="bg-slate-900 text-white p-4 font-bold text-sm md:text-base flex items-center gap-2">
              <Calendar className="w-5 h-5 text-emerald-400" />
              تحديث تاريخ الترخيص وحالة الطفاية للسيارة
            </div>

            <form onSubmit={handleApplyUpdateDate} className="p-6 space-y-4 text-xs font-sans">
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-150">
                <span className="text-slate-500 font-semibold block text-[10px]">السيارة المستهدفة:</span>
                <span className="font-extrabold text-slate-800 text-xs font-mono">{db.cars.find(c => c.id === updatingCarId)?.car_number}</span>
              </div>

              <div>
                <label className="block text-slate-500 font-bold mb-1">تاريخ انتهاء الترخيص الجديد</label>
                <input
                  type="date"
                  required
                  className="w-full p-2.5 rounded-lg border border-slate-200 focus:outline-none focus:border-emerald-500 font-mono text-slate-800"
                  value={newLicEndDate}
                  onChange={(e) => setNewLicEndDate(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-slate-500 font-bold mb-1">الحالة الفيزيائية لطفاية الحريق</label>
                <select
                  className="w-full p-2.5 rounded-lg border border-slate-200 focus:outline-none focus:border-emerald-500 text-slate-850 bg-white"
                  value={newExtStatus}
                  onChange={(e) => setNewExtStatus(e.target.value as any)}
                >
                  <option value="valid">صاحلة ومطابقة ✔ (سليمة)</option>
                  <option value="warning">تحذير ⚠️ (تقترب من الفحص)</option>
                  <option value="expired">غير صالحة أو منتهية ❌ (تتطلب استبدال)</option>
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="submit"
                  className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2.5 rounded-lg font-bold"
                >
                  تأكيد التحديث لحظيًا (Realtime Sync)
                </button>
                <button
                  onClick={() => setUpdatingCarId(null)}
                  type="button"
                  className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2.5 rounded-lg"
                >
                  إلغاء الأمر
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Advanced Filters Cross card */}
      <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm space-y-4 px-6 no-print">
        <h3 className="font-bold text-slate-900 text-sm md:text-base flex items-center gap-2 border-b border-slate-50 pb-2">
          <SlidersHorizontal className="w-5 h-5 text-emerald-500" />
          شاشة متابعة وتحديث التراخيص السيارات المتقدمة (الفلاتر الشاملة وزر البحث)
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 text-xs font-sans">
          
          {/* Filter 1: Universal search bar */}
          <div>
            <label className="block text-slate-500 font-bold mb-1">البحث الذكي العام الشامل</label>
            <div className="relative">
              <input
                type="text"
                placeholder="ابحث بالاسم، الرقم، الشركه المعنية..."
                className="w-full pl-3 pr-8 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-500 bg-slate-50/50"
                value={universalSearch}
                onChange={(e) => setUniversalSearch(e.target.value)}
              />
              <Search className="w-4 h-4 text-slate-400 absolute left-2.5 top-2.5" />
            </div>
          </div>

          {/* Filter 2: Car Number */}
          <div>
            <label className="block text-slate-500 font-bold mb-1">رقم لوحة السيارة</label>
            <input
              type="text"
              placeholder="مثال: ط ي ع ٢٤٦٨"
              className="w-full p-2 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-500 text-slate-800"
              value={carNumberFilter}
              onChange={(e) => setCarNumberFilter(e.target.value)}
            />
          </div>

          {/* Filter 3: Chassis Number */}
          <div>
            <label className="block text-slate-500 font-bold mb-1">رقم الشاسيه</label>
            <input
              type="text"
              placeholder="ابحث برقم الشاسيه..."
              className="w-full p-2 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-500 text-slate-800"
              value={chassisFilter}
              onChange={(e) => setChassisFilter(e.target.value)}
            />
          </div>

          {/* Filter 4: Motor Number */}
          <div>
            <label className="block text-slate-500 font-bold mb-1">رقم الموتور</label>
            <input
              type="text"
              placeholder="ابحث برقم الموتور..."
              className="w-full p-2 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-500 text-slate-800"
              value={motorFilter}
              onChange={(e) => setMotorFilter(e.target.value)}
            />
          </div>

          {/* Filter 5: Brand */}
          <div>
            <label className="block text-slate-500 font-bold mb-1">ماركة السيارة</label>
            <select
              className="w-full p-2 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-500 text-slate-800 font-semibold bg-white"
              value={brandFilter}
              onChange={(e) => setBrandFilter(e.target.value)}
            >
              <option value="">-- كافة الماركات --</option>
              {brands.map(b => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          </div>

          {/* Filter 6: Model Year */}
          <div>
            <label className="block text-slate-500 font-bold mb-1">موديل السيارة (السنة)</label>
            <select
              className="w-full p-2 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-500 text-slate-800 font-semibold bg-white"
              value={modelFilter}
              onChange={(e) => setModelFilter(e.target.value)}
            >
              <option value="">-- كافة الموديلات --</option>
              {models.map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>

          {/* Filter 7: Car Type */}
          <div>
            <label className="block text-slate-500 font-bold mb-1">نوع السيارة</label>
            <select
              className="w-full p-2 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-500 text-slate-800 font-semibold bg-white"
              value={carTypeFilter}
              onChange={(e) => setCarTypeFilter(e.target.value)}
            >
              <option value="">-- كافة الأنواع --</option>
              {carTypes.map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          {/* Filter 8: Traffic Office (جهة المرور) */}
          <div>
            <label className="block text-slate-500 font-bold mb-1">إدارة / جهة المرور</label>
            <select
              className="w-full p-2 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-500 text-slate-800 font-semibold bg-white"
              value={trafficOfficeFilter}
              onChange={(e) => setTrafficOfficeFilter(e.target.value)}
            >
              <option value="">-- كافة إدارات المرور --</option>
              {trafficOffices.map(to => (
                <option key={to} value={to}>{to}</option>
              ))}
            </select>
          </div>

          {/* Filter 9: Owner Company */}
          <div>
            <label className="block text-slate-500 font-bold mb-1">الشركة المالكة للسيارة</label>
            <select
              className="w-full p-2 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-500 text-slate-800 font-semibold bg-white"
              value={ownerCompanyFilter}
              onChange={(e) => setOwnerCompanyFilter(e.target.value)}
            >
              <option value="">-- كافة فروع الشركات --</option>
              {companies.map(comp => (
                <option key={comp} value={comp}>{comp}</option>
              ))}
            </select>
          </div>

          {/* Filter 10: Responsible License official */}
          <div>
            <label className="block text-slate-500 font-bold mb-1">مشرف التراخيص والعهد</label>
            <select
              disabled={db.currentUser?.role === 'supervisor'}
              className="w-full p-2 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-500 text-slate-800 font-semibold bg-white disabled:opacity-75 disabled:bg-slate-100"
              value={officialFilter}
              onChange={(e) => setOfficialFilter(e.target.value)}
            >
              {db.currentUser?.role !== 'supervisor' && <option value="">-- كافة الموظفين المشرفين --</option>}
              {db.officials.map(o => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
            </select>
          </div>

          {/* Filter 11: Assigned Driver */}
          <div>
            <label className="block text-slate-500 font-bold mb-1">السائق المسؤول</label>
            <select
              className="w-full p-2 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-500 text-slate-800 font-semibold bg-white"
              value={driverFilter}
              onChange={(e) => setDriverFilter(e.target.value)}
            >
              <option value="">-- كافة السائقين والمناديب --</option>
              {db.drivers.map(d => (
                <option key={d.id} value={d.id}>{d.name} ({d.driver_code || 'بدون كود'})</option>
              ))}
            </select>
          </div>

          {/* Filter 12: License Expiry status */}
          <div>
            <label className="block text-slate-500 font-bold mb-1">سريان وصلاحية الترخيص</label>
            <select
              className="w-full p-2 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-500 text-slate-800 font-semibold bg-white"
              value={expiryStatusFilter}
              onChange={(e) => setExpiryStatusFilter(e.target.value as any)}
            >
              <option value="all">-- كافة الحالات --</option>
              <option value="expired">منتهية الترخيص بالفعل ❌</option>
              <option value="near_expiry">على وشك الانتهاء (أقل من 30 يوم) ⚠️</option>
              <option value="valid">سارية الترخيص ✔</option>
            </select>
          </div>

          {/* Filter 13: Extinguisher Status */}
          <div>
            <label className="block text-slate-500 font-bold mb-1">حالة طفاية الحريق</label>
            <select
              className="w-full p-2 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-500 text-slate-800 font-semibold bg-white"
              value={extinguisherFilter}
              onChange={(e) => setExtinguisherFilter(e.target.value as any)}
            >
              <option value="all">-- كافة حالات الطفايات --</option>
              <option value="valid">سليمة ومطابقة ✔</option>
              <option value="warning">تحذير صلاحية ⚠️</option>
              <option value="expired">منتهية أو تالفة ❌</option>
            </select>
          </div>

          {/* Filter 14: Insurance Status */}
          <div>
            <label className="block text-slate-500 font-bold mb-1">بيانات/موقف التأمين</label>
            <input
              type="text"
              placeholder="ابحث بموقف التأمين..."
              className="w-full p-2 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-500 text-slate-800"
              value={insuranceFilter}
              onChange={(e) => setInsuranceFilter(e.target.value)}
            />
          </div>

        </div>

        {/* Action Panel: Search, Reset, Excel Export */}
        <div className="flex flex-wrap items-center gap-3 pt-3 border-t border-slate-100 justify-end">
          
          <button
            onClick={handleSearch}
            type="button"
            className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-5 py-2.5 rounded-lg flex items-center gap-2 cursor-pointer transition-colors shadow-sm text-xs md:text-sm"
          >
            <Search className="w-4 h-4" />
            بحث وتطبيق الفلاتر الشاملة
          </button>

          <button
            onClick={handleResetFilters}
            type="button"
            className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-5 py-2.5 rounded-lg flex items-center gap-2 cursor-pointer transition-colors text-xs md:text-sm"
          >
            <RotateCcw className="w-4 h-4" />
            تصفير الخيارات
          </button>

          <button
            onClick={handleExportExcel}
            type="button"
            className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-5 py-2.5 rounded-lg flex items-center gap-2 cursor-pointer transition-colors shadow-sm text-xs md:text-sm mr-auto"
          >
            <FileSpreadsheet className="w-4 h-4" />
            تصدير كشف إكسيل (Excel Export)
          </button>

          <button
            onClick={() => { setShowLicInvoiceModal(true); setLicInvoiceSearch(''); }}
            type="button"
            className="bg-emerald-700 hover:bg-emerald-600 text-white font-bold px-5 py-2.5 rounded-lg flex items-center gap-2 cursor-pointer transition-colors shadow-sm text-xs md:text-sm"
          >
            <Printer className="w-4 h-4" />
            طباعة فاتورة ترخيص
          </button>

        </div>
      </div>

      {/* Cards List Output Grid in bento-like style */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 text-xs">
        {filteredCars.map(car => {
          const licStatus = getLicenseStatus(car);
          const supervisorObj = db.officials.find(o => o.id === car.license_official_id);
          const driverObj = db.drivers.find(d => d.id === car.driver_id);

          return (
            <div
              key={car.id}
              className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm flex flex-col justify-between space-y-4 hover:shadow-md transition-shadow relative overflow-hidden"
              id={`car_license_card_${car.id}`}
            >
              {/* Card Header */}
              <div className="flex justify-between items-start">
                <div className="space-y-0.5">
                  <span className="font-extrabold text-slate-900 text-sm md:text-base font-mono bg-slate-100 border border-slate-200 px-2.5 py-0.5 rounded select-all justify-center text-center">
                    {car.car_number}
                  </span>
                  <div className="text-[10px] text-slate-400 font-semibold flex items-center gap-1 mt-1">
                    <Building className="w-3 h-3" />
                    {car.owner_company}
                  </div>
                </div>

                <span className={`px-2 py-1 text-[9px] font-black rounded-lg border flex items-center gap-1 ${licStatus.color}`}>
                  {licStatus.label}
                </span>
              </div>

              {/* Data points */}
              <div className="space-y-2 border-t border-b border-slate-50 py-3 text-[11px]">
                
                <div className="flex justify-between">
                  <span className="text-slate-400 font-medium">رقم الشاسيه / الموتور:</span>
                  <span className="font-mono font-bold text-slate-700">{car.chassis_number} / {car.motor_number}</span>
                </div>

                <div className="flex justify-between">
                  <span className="text-slate-400 font-medium">مشرف الترخيص المرتبط:</span>
                  <span className="font-bold text-indigo-700 flex items-center gap-1">
                    <User className="w-3 h-3 text-slate-400" />
                    {supervisorObj ? supervisorObj.name : "غير مكلف"}
                  </span>
                </div>

                <div className="flex justify-between">
                  <span className="text-slate-400 font-medium">السائق المسؤول المكلف:</span>
                  <span className="font-bold text-emerald-700">{driverObj ? driverObj.name : "غير مكلف"}</span>
                </div>

                <div className="flex justify-between bg-slate-50/50 p-1 px-1.5 rounded border border-indigo-100/50">
                  <span className="text-slate-400 font-medium text-indigo-900 font-semibold">إدارة / جهة المرور:</span>
                  <span className="font-bold text-indigo-700 font-sans">{car.traffic_office || "غير محدد"}</span>
                </div>

                <div className="flex justify-between gap-2">
                  <span className="text-slate-400 font-medium shrink-0">الرقم التأميني للسيارة:</span>
                  <span className="font-mono font-bold text-slate-700 text-left break-all">{car.insurance_status || "غير محدد"}</span>
                </div>

                <div className="flex justify-between gap-2">
                  <span className="text-slate-400 font-medium shrink-0">تاريخ انتهاء الترخيص:</span>
                  <span className={`font-mono font-bold ${licStatus.status === 'expired' ? 'text-rose-600' : licStatus.status === 'near_expiry' ? 'text-amber-600' : 'text-slate-700'}`}>{car.license_end_date || "غير محدد"}</span>
                </div>

                <div className="flex justify-between items-center pt-1 border-t border-slate-50/50">
                  <span className="text-slate-400 font-medium flex items-center gap-1">
                    <FlameKindling className="w-3.5 h-3.5 text-rose-500" />
                    حالة عياذة طفاية الحريق:
                  </span>
                  {car.extinguisher_status === 'valid' && <span className="bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full font-bold text-[10px]">سليمة ✔</span>}
                  {car.extinguisher_status === 'warning' && <span className="bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full font-bold text-[10px]">تحذير ⚠️</span>}
                  {car.extinguisher_status === 'expired' && <span className="bg-rose-50 text-rose-700 px-2 py-0.5 rounded-full font-bold text-[10px]">منتهية ❌</span>}
                </div>

              </div>

              {/* Action Buttons */}
              <div className="flex gap-2">
                <button
                  onClick={() => handleOpenUpdateForm(car)}
                  type="button"
                  className="flex-1 bg-slate-900 hover:bg-slate-800 text-white font-bold p-2.5 rounded-xl transition-all text-center flex items-center justify-center gap-1 text-xs"
                >
                  <Calendar className="w-3.5 h-3.5 text-emerald-400" />
                  تحديث الترخيص
                </button>
                <button
                  onClick={() => handlePrintLicenseInvoice(car)}
                  type="button"
                  className="bg-emerald-700 hover:bg-emerald-600 text-white font-bold px-3 py-2.5 rounded-xl transition-all flex items-center justify-center gap-1 text-xs"
                  title="طباعة فاتورة الترخيص"
                >
                  <Printer className="w-3.5 h-3.5" />
                </button>
              </div>

            </div>
          );
        })}

        {filteredCars.length === 0 && (
          <div className="col-span-1 sm:col-span-2 lg:col-span-3 py-16 text-center text-slate-400 text-xs">
            لا توجد أية نتائج مطابقة لبحثك بالتراخيص. يمكنك تعديل خيارات الفلترة المتقاطعة أعلاه.
          </div>
        )}
      </div>

    </div>
  );
};
