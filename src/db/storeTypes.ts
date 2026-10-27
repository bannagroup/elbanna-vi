/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// شكل الـ Context الكامل للمتجر (منقول حرفيًا من store.tsx — تعريف أنواع فقط)

import type { TripAction, TripPayload } from './logic/tripFlow';
import type {
  AppNotification, Driver, Official, Car, Violation, Invoice, InvoiceItem, InvoiceAuditLog, DriverAccountMovement,
  CustodyAccount, CustodyMovement, User, TransportRequest, CostItemType, RoutePriceEntry,
  TransportRequestCost, CarDailyCost, CarMonthlyCost, FuelLog, ServicePlan, SystemUser,
  MaintenanceRequest, MaintenancePartItem, MaintenanceInvoice, MaintenanceInvoiceItem
} from '../types';

export interface DbContextType {
  drivers: Driver[];
  officials: Official[];
  cars: Car[];
  violations: Violation[];
  invoices: Invoice[];
  // مسودات الفواتير: محفوظة في قاعدة البيانات لكن مالهاش أي أثر مالي، ومخفية من الفواتير والتقارير
  invoiceDrafts: Invoice[];
  invoiceDraftItems: InvoiceItem[];
  invoiceItems: InvoiceItem[];
  auditLogs: InvoiceAuditLog[];
  movements: DriverAccountMovement[];
  custodyAccounts: CustodyAccount[];
  custodyMovements: CustodyMovement[];

  // Transport Requests (طلبات النقل)
  transportRequests: TransportRequest[];
  farms: string[];
  addTransportRequest: (data: {
    requester_name: string;
    farm_name: string;
    destinations: string[];
    car_type: string;
    cargo_description: string;
    request_date: string;
  }) => TransportRequest;
  updateTransportRequest: (id: string, updatedFields: Partial<TransportRequest>) => void;
  deleteTransportRequest: (id: string) => void;
  respondTransportRequestWithCar: (requestId: string, carId: string) => { success: boolean; error?: string };
  markTransportRequestDelivered: (requestId: string, executionDate?: string) => void;
  advanceTransportTrip: (requestId: string, action: TripAction, payload?: TripPayload) => { success: boolean; error?: string };

  // قسم الصيانة — مبني فوق قاعدة بيانات السيارات الحالية (car_id = Car.id)
  maintenanceRequests: MaintenanceRequest[];
  maintenanceInvoices: MaintenanceInvoice[];
  addMaintenanceRequest: (data: {
    car_id: string;
    fault_description: string;
    request_date: string;
  }) => MaintenanceRequest;
  updateMaintenanceRequest: (id: string, updatedFields: Partial<MaintenanceRequest> & { _note?: string; _kind?: 'advance' | 'return' }) => void;
  deleteMaintenanceRequest: (id: string) => void;
  addMaintenancePart: (requestId: string, part: { name: string; source: 'company_stock' | 'external_workshop'; quantity: number }) => void;
  deleteMaintenancePart: (requestId: string, partId: string) => void;
  openMaintenanceInvoice: (requestId: string) => MaintenanceInvoice | null;
  updateMaintenanceInvoice: (id: string, updatedFields: Partial<MaintenanceInvoice>) => void;
  addMaintenanceInvoiceItem: (invoiceId: string, item: { description: string; item_type: 'parts' | 'labor'; source?: 'company_stock' | 'external_workshop'; quantity: number; unit_price: number; total: number }) => void;
  deleteMaintenanceInvoiceItem: (invoiceId: string, itemId: string) => void;
  getMaintenanceCostForCarDay: (carId: string, date: string) => number;

  // Real-time status simulation / State settings
  isRealtimeActive: boolean;
  setRealtimeActive: (val: boolean) => void;
  latencyMs: number;

  // Supabase cloud states & triggers
  isCloudConnected: boolean;
  isCloudSyncing: boolean;
  cloudError: string | null;
  setCloudError: (val: string | null) => void;
  testCloudConnection: () => Promise<{ success: boolean; message: string }>;
  uploadLocalDataToCloud: () => Promise<{ success: boolean; message: string }>;
  validateLocalData: () => string[];
  getDataIssuesDetail: () => {
    unknownCarGroups: { car_number: string; items: Violation[] }[];
    orphanedDriverViolations: Violation[];
    duplicateGroups: Violation[][];
  };
  updateViolation: (id: string, updatedFields: Partial<Violation>) => void;
  remapViolationsCarNumber: (oldCarNumber: string, newCarNumber: string) => void;
  downloadCloudDataToLocal: (isManual?: boolean) => Promise<{ success: boolean; message: string }>;

  // Driver Actions
  addDriver: (driver: Omit<Driver, 'id' | 'balance'>) => Driver;
  updateDriver: (id: string, driver: Partial<Driver>) => void;
  deleteDriver: (id: string) => void;

  // Car Actions
  addCar: (car: Omit<Car, 'id'>) => Car;
  updateCar: (id: string, car: Partial<Car>) => void;
  deleteCar: (id: string) => void;

  // Official (Custody) Actions
  addOfficial: (official: Omit<Official, 'id'>) => Official;
  updateCustody: (id: string, cashDelta: number, visaDelta: number) => void;
  updateOfficialPassword: (id: string, newPassword: string) => Promise<{ success: boolean; error?: string }>;
  // تغيير كلمة سر المستخدم الحالي بنفسه (بيتأكد من الحالية الأول)
  changeOwnPassword: (currentPassword: string, newPassword: string) => Promise<{ success: boolean; error?: string }>;
  // تفعيل دخول المستخدمين المنقولين من النظام القديم (أدمن): بيرجّع كلمة سر مؤقتة لكل واحد مرة واحدة
  provisionSystemUsers: () => Promise<{ success: boolean; error?: string; results: Array<{ id: string; username: string; display_name: string; password?: string; error?: string }> }>;
  updateOfficialName: (id: string, newName: string) => void;
  deleteOfficial: (id: string) => void;

  // Custody Accounts Actions
  addCustodyAccount: (account: Omit<CustodyAccount, 'id'>) => CustodyAccount;
  getOfficialName: (id: string) => string;
  addCustodyFunds: (accountId: string, amount: number, description?: string) => { success: boolean; error?: string };
  updateCustodyAccount: (id: string, account: Partial<CustodyAccount>) => void;
  deleteCustodyAccount: (id: string) => void;
  transferCustody: (fromAccountId: string, toAccountId: string, amount: number, description: string) => { success: boolean; error?: string };

  // Violation Actions
  addViolation: (violation: Omit<Violation, 'id'>, forceBypass?: boolean) => { success: boolean; error?: string; duplicateViolation?: Violation };
  deleteViolation: (id: string) => void;

  // Deduction Actions
  applyIndividualDeduction: (driverId: string, amount: number, description: string, date?: string, carId?: string) => void;
  applyGroupDeductionRpc: (amount: number, description: string) => Promise<boolean>;
  deleteMovement: (id: string) => void;
  editMovementAmount: (id: string, newAmount: number, newDescription: string) => void;

  // Invoice & Custody Transactions (Crucial database logic)
  createInvoice: (invoiceData: Omit<Invoice, 'id' | 'invoice_number' | 'version' | 'is_modified' | 'is_deleted'>, items: Omit<InvoiceItem, 'id' | 'invoice_id' | 'car_id'>[]) => { success: boolean; error?: string; invoice?: Invoice };
  approveInvoice: (invoiceId: string) => { success: boolean; error?: string };
  returnInvoice: (invoiceId: string, reason: string) => { success: boolean; error?: string };
  resubmitInvoice: (invoiceId: string) => { success: boolean; error?: string };
  getLicenseCostForCarDay: (carId: string, date: string) => number;
  updateInvoice: (
    invoiceId: string,
    supervisorName: string,
    items: Omit<InvoiceItem, 'id' | 'invoice_id' | 'car_id'>[],
    headerData?: {
      car_id?: string;
      license_details?: string;
      license_location?: string;
      car_location?: string;
      invoice_date?: string;
    }
  ) => { success: boolean; error?: string };
  deleteInvoice: (invoiceId: string, supervisorName: string) => { success: boolean; error?: string };
  saveInvoiceDraft: (
    draftId: string | null,
    data: { invoice_date: string; official_id: string; car_id?: string; license_details?: string; license_location?: string; car_location?: string },
    items: { description: string; amount: number; payment_method: 'cash' | 'visa'; account_id?: string }[]
  ) => { success: boolean; error?: string; draftId?: string };
  deleteInvoiceDraft: (draftId: string) => { success: boolean; error?: string };
  restoreInvoice: (invoiceId: string, supervisorName: string) => { success: boolean; error?: string };
  purgeInvoice: (invoiceId: string, supervisorName: string) => { success: boolean; error?: string };
  saveDraftVouchers: (drafts: any[]) => Promise<void>;
  loadDraftVouchers: () => Promise<any[] | null>;
  importOldInvoice: (data: {
    external_invoice_number: string;
    invoice_date: string;
    car_number: string;
    license_location: string;
    license_details: string;
    items: { description: string; amount: number }[];
    total_amount: number;
  }) => { success: boolean; error?: string; invoice?: Invoice };

  // Reset database helper
  resetToInitial: () => void;

  // Companies Management
  companies: string[];
  hiddenCompanies: string[];
  addCompany: (name: string) => void;
  deleteCompany: (name: string) => void;

  // خريطة صلاحيات الشاشات القابلة للتعديل لكل رتبة
  rolePermissions: Record<string, string[]>;
  updateRolePermissions: (role: string, screenIds: string[]) => void;

  // نظام المستخدمين الموحّد — شاشة واحدة، كل مستخدم بشاشاته الخاصة من غير ارتباط بقسم/رتبة
  systemUsers: SystemUser[];
  addSystemUser: (username: string, password: string, displayName: string, allowedScreens: string[]) => Promise<{ success: boolean; error?: string; user?: SystemUser; cloudSaved: boolean }>;
  updateSystemUser: (id: string, updates: { username?: string; password?: string; display_name?: string; official_name?: string; allowed_screens?: string[]; active?: boolean }) => Promise<{ success: boolean; error?: string; cloudSaved: boolean }>;
  deleteSystemUser: (id: string) => Promise<{ success: boolean; error?: string; cloudSaved: boolean }>;
  // إنشاء حساب عهدة (مشرف صرف) يدويًا لمستخدم موجود — مش تلقائي
  createOfficialForUser: (userId: string, initial?: { cash_custody?: number; visa_custody?: number }) => Promise<{ success: boolean; error?: string; official?: Official; cloudSaved: boolean }>;
  // آخر خطأ في حفظ المستخدمين بالسحابة (null لو تمام)
  systemUsersSyncError: string | null;

  // إعدادات تكلفة خطوط السير — المرحلة 1 من تطوير نظام طلبات النقل
  defaultGarageLocation: string;
  updateDefaultGarageLocation: (location: string) => void;
  costItemTypes: CostItemType[];
  addCostItemType: (name: string) => void;
  deleteCostItemType: (id: string) => void;
  vehicleFreightRates: Record<string, number>;
  updateVehicleFreightRate: (carType: string, ratePerKm: number) => void;
  deleteVehicleFreightRate: (carType: string) => void;
  routePriceList: RoutePriceEntry[];
  addRoutePrice: (fromLocation: string, toLocation: string, smokeAmount: number, distanceKm?: number) => void;
  updateRoutePrice: (id: string, fromLocation: string, toLocation: string, smokeAmount: number, distanceKm?: number) => void;
  deleteRoutePrice: (id: string) => void;
  // بيانات تكلفة خط سير كل طلب نقل — المرحلة 2
  transportRequestCosts: TransportRequestCost[];
  upsertTransportRequestCost: (requestId: string, data: Omit<TransportRequestCost, 'id' | 'request_id' | 'updated_at' | 'updated_by'>) => TransportRequestCost;
  deleteTransportRequestCost: (requestId: string) => void;
  // مصاريف وأرباح السيارات اليومية (مسافة اليوم الكلية، النولون، كارتات، مخالفات، غسيل كاوتش، صيانة)
  carDailyCosts: CarDailyCost[];
  carMonthlyCosts: CarMonthlyCost[];
  upsertCarMonthlyCost: (carId: string, month: string, data: Omit<CarMonthlyCost, 'id' | 'car_id' | 'month' | 'updated_at' | 'updated_by'>) => CarMonthlyCost;
  deleteCarMonthlyCost: (carId: string, month: string) => void;
  // حفظ جماعي (بزر واحد): كل السجلات بتتحسب مرة واحدة على الحالة الحالية وبتتكتب في عملية واحدة
  upsertCarMonthlyCostsBatch: (entries: { carId: string; month: string; data: Omit<CarMonthlyCost, 'id' | 'car_id' | 'month' | 'updated_at' | 'updated_by'> }[]) => { saved: number; skippedLocked: number };
  restoreFromBackup: (payload: any) => { success: boolean; message: string };
  fuelLogs: FuelLog[];
  upsertFuelLog: (data: Omit<FuelLog, 'id' | 'updated_at' | 'updated_by' | 'total_amount'> & { id?: string; total_amount?: number }) => { success: boolean; error?: string };
  deleteFuelLog: (id: string) => { success: boolean; error?: string };
  servicePlans: ServicePlan[];
  upsertServicePlan: (data: Omit<ServicePlan, 'id' | 'updated_at' | 'updated_by'> & { id?: string }) => { success: boolean; error?: string };
  deleteServicePlan: (id: string) => void;
  markServiceDone: (planId: string, odometer?: number) => void;
  getCarOdometer: (carId: string) => number | null;
  lockedMonths: { month: string; locked_by?: string; locked_at: string }[];
  isMonthLocked: (dateOrMonth: string) => boolean;
  canEditMonth: (dateOrMonth: string) => boolean;
  lockMonth: (month: string) => { success: boolean; error?: string };
  unlockMonth: (month: string) => { success: boolean; error?: string };
  upsertCarDailyCost: (carId: string, date: string, data: Omit<CarDailyCost, 'id' | 'car_id' | 'date' | 'updated_at' | 'updated_by'>) => CarDailyCost;
  upsertCarDailyCostsBatch: (entries: { carId: string; date: string; data: Omit<CarDailyCost, 'id' | 'car_id' | 'date' | 'updated_at' | 'updated_by'> }[]) => { saved: number; skippedLocked: number };
  deleteCarDailyCost: (carId: string, date: string) => void;

  // Local offline backup and restore features
  exportLocalBackup: () => string;
  importLocalBackup: (jsonData: string) => { success: boolean; message: string };
  exportCloudBackup: () => Promise<{ success: boolean; data?: string; message: string }>;

  // Authentication states
  currentUser: User | null;
  // تسجيل دخول موحّد بدون اختيار قسم مقدمًا — اسم مستخدم وكلمة مرور بس، والنظام يتعرف على الحساب تلقائيًا
  loginAuto: (identifier: string, password: string) => Promise<{ success: boolean; error?: string }>;
  hasScreenPermission: (screenId: string) => boolean;
  // الإشعارات المرئية للمستخدم الحالي حسب صلاحياته (الأحدث أولًا)
  notifications: AppNotification[];
  unreadNotificationCount: number;
  markNotificationsRead: (ids: string[]) => void;
  markAllNotificationsRead: () => void;
  // بيعلّم الإشعار كمقروء ويرجّع الشاشة اللي لازم تتفتح (أو null لو المستخدم معندوش صلاحية)
  openNotification: (n: AppNotification) => string | null;
  // طلب تنقل معلّق: الشاشة المستهدفة بتفتح الطلب وتستهلكه بـ consumeNav
  pendingNav: { screen: string; entityType: 'transport' | 'maintenance'; entityId: string; nonce: number } | null;
  consumeNav: (nonce: number) => void;
  logout: () => void;
  // شاشات مخصصة لكل مشرف صرف بعينه (official) — غير مرتبطة بالرتبة المشتركة، تسمح بإضافة
  // أي مستخدم وتحديد شاشاته الخاصة بدل التقييد بقسم ثابت. المفتاح official.id.
  officialCustomScreens: Record<string, string[]>;
  updateOfficialScreens: (officialId: string, screenIds: string[] | null) => void;
}
