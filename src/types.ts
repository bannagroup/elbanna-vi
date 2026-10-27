/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface User {
  username: string;
  role: 'admin' | 'manager' | 'supervisor' | 'movement_supervisor' | 'requests_agent' | 'custom';
  officialId?: string; // ID of official if role is supervisor
  systemUserId?: string; // ID in systemUsers list, if this session came from a general (non-supervisor) account
  name: string;
  allowedScreens: string[]; // الشاشات المسموحة لهذه الجلسة تحديدًا — تُحسب وقت الدخول من المستخدم نفسه، مش من قسم/رتبة ثابتة
}

// حساب مستخدم عام في النظام (غير مرتبط بعهدة مالية) — اسم مستخدم وكلمة مرور وشاشات خاصة به يحددها الأدمن حرًا
export interface SystemUser {
  id: string; // UUID
  username: string; // اسم المستخدم لتسجيل الدخول (فريد، قابل للتعديل بالكامل)
  display_name: string; // الاسم الظاهر بالنظام (مثال: "أحمد - مدير التقارير")
  role_tag: 'admin' | 'manager' | 'movement_supervisor' | 'requests_agent' | 'custom'; // تصنيف داخلي فقط (مايظهرش للأدمن)، لأغراض فلترة بيانات العهدة القديمة فقط
  allowed_screens: string[]; // الشاشات المخصصة لهذا المستخدم تحديدًا — مش موروثة من قسم
  active?: boolean; // الحساب فعّال؟ (الأدمن يقدر يوقفه)
  has_login?: boolean; // اتفعّل له دخول في Supabase Auth؟ (المنقولين من النظام القديم لسه)
  linked_official_id?: string; // لو المستخدم ده عنده صلاحية "فواتير تراخيص"، بيتربط تلقائيًا بحساب عهدة (Official) بنفس المعرّف ده
}

export interface Driver {
  id: string; // UUID
  driver_code: string; // كود السواق
  name: string; // اسم السواق
  national_id: string; // رقم البطاقة
  phone: string; // رقم التليفون
  license_end_date: string; // نهاية ترخيص الرخصة
  balance: number; // الرصيد المالي المستحق (الخصومات)
}

export interface Official {
  id: string; // UUID
  name: string; // اسم المشرف/المسؤول
  cash_custody: number; // عهدة نقدي
  visa_custody: number; // عهدة فيزا
  password?: string; // (قديم — مابيتخزنش تاني؛ الدخول عبر Supabase Auth)
  allowed_screens?: string[]; // شاشات مخصصة لهذا المشرف تحديدًا؛ لو فاضية بيرجع لإعدادات رتبة "مشرف صرف" الافتراضية
}

export interface Car {
  id: string; // UUID
  car_number: string; // رقم السيارة (اللوحة)
  chassis_number: string; // رقم الشاسيه
  motor_number: string; // رقم الموتور
  owner_company: string; // الشركة المالكة
  license_official_id: string; // مسؤول التراخيص (ربط بـ Officials)
  driver_id: string; // السائق (ربط بـ Drivers)
  license_end_date: string; // نهاية الترخيص
  insurance_status: string; // التأمين
  extinguisher_status: 'valid' | 'expired' | 'warning'; // حالة طفاية الحريق
  model?: string; // الموديل
  brand?: string; // ماركة السيارة
  car_type?: string; // نوع السيارة
  garage_location?: string; // مكان جراج/موقف السيارة — نقطة بداية خط السير الافتراضية لو مفيش رحلة سابقة لنفس اليوم
  traffic_office?: string; // جهة المرور
  license_total_cost?: number; // إجمالي مصروف الترخيص المتراكم
}

export interface Violation {
  id: string; // UUID
  violation_date: string; // تاريخ المخالفة
  car_number: string; // رقم السيارة
  driver_id: string; // السائق المستحق عليه المخالفة (ربط بـ Drivers)
  description: string; // وصف المخالفة
  amount: number; // مبلغ المخالفة
}

export interface InvoiceItem {
  id: string;
  invoice_id: string;
  car_id: string; // السيارة المستهدفة بالصرف
  description: string; // وصف البند (رسوم فحص، طفاية، تأمين، الخ)
  amount: number; // القيمة المالّية
  payment_method: 'cash' | 'visa'; // طريقة الدفع
  account_id?: string; // الحساب الفرعي المستخدم في الدفع
  sort_order?: number; // ترتيب عرض البند
}

export interface Invoice {
  id: string;
  invoice_number: string; // رقم الفاتورة التسلسلي
  invoice_date: string; // تاريخ الفاتورة
  official_id: string; // المسؤول المنفذ للصرف
  total_amount: number;
  version: number; // رقم النسخة (مثال: نسخة معدلة رقم X)
  is_modified: boolean;
  is_deleted: boolean;
  car_id?: string; // السيارة المستهدفة (لأن الفاتورة لسيارة واحدة فقط)
  license_details?: string; // بيان الترخيص
  license_location?: string; // مكان الترخيص
  car_location?: string; // مكان السيارة
  approval_status?: 'draft' | 'pending' | 'approved' | 'returned'; // مسودة (بدون أي أثر مالي) / قيد موافقة المالية / معتمدة (الفواتير القديمة تعتبر معتمدة)
  approved_by?: string; // اسم من اعتمد الفاتورة
  approved_at?: string; // وقت الاعتماد
  return_reason?: string; // سبب إرجاع المالية للفاتورة
  returned_by?: string;
  returned_at?: string;
}

export interface CustodyAccount {
  id: string;
  official_id: string; // المسؤول المرتبط به الحساب
  name: string; // اسم الحساب الفرعي (مثال: كاش رئيسي، فيزا بنك مصر، فيزا التراخيص)
  type: 'cash' | 'visa' | 'other_visa';
  balance: number; // رصيد الحساب الحالي
}

export interface CustodyMovement {
  id: string;
  official_id: string;
  from_account_id?: string;
  to_account_id?: string;
  date: string;
  description: string;
  amount: number;
  type: 'deposit' | 'withdrawal' | 'transfer' | 'settlement' | 'invoice_charge';
}

export interface InvoiceAuditLog {
  id: string;
  invoice_id: string;
  invoice_number: string;
  timestamp: string; // وقت الحركة
  supervisor_name: string; // اسم المشرف القائم بالتغيير
  operation_type: 'create' | 'edit' | 'delete'; // نوع العملية
  old_value: string; // القيمة القديمة بصيغة نصية
  new_value: string; // القيمة الجديدة بصيغة نصية
}

// بند تكلفة إضافي قابل للإضافة من الإعدادات (زي "دخان السائق" أو أي بند تاني)
export interface CostItemType {
  id: string;
  name: string;
}

// سعر خط سير محدد (من - إلى) لمبلغ الدخان الافتراضي والمسافة — قابلين للتعديل يدويًا لكل طلب لاحقًا
export interface RoutePriceEntry {
  id: string;
  from_location: string; // من
  to_location: string; // إلى
  smoke_amount: number; // مبلغ الدخان الافتراضي لهذا الخط
  distance_km: number; // المسافة الافتراضية لهذا الخط بالكيلومتر
}

// بند تكلفة إضافي مُسجل فعليًا على طلب نقل معين (منسوخ من إعدادات بنود التكلفة وقت التسجيل)
export interface TransportRequestExtraCost {
  item_id: string;
  item_name: string;
  amount: number;
}

// دخان محطة واحدة من محطات خط سير الطلب (من → إلى) — مُقترح من لائحة خطوط السير، وقابل للتعديل.
// من/إلى بتتولد من farm_name + destinations بتاعة الطلب نفسه وقت الحفظ (نسخة ثابتة وقت التسجيل)
export interface TransportRouteLegSmoke {
  from_location: string;
  to_location: string;
  smoke_amount: number;
}

// تكلفة الدخان لطلب نقل معين فقط — المرجع request_id يربطها بـ TransportRequest.
// باقي التكلفة (النولون، كارتات، مخالفات، غسيل كاوتش، صيانة) بقت مربوطة بالسيارة واليوم ككل
// (شوف CarDailyCost) مش بكل طلب لوحده، عشان تدعم حساب ربحية السيارة في اليوم كله.
export interface TransportRequestCost {
  id: string;
  request_id: string;
  legs: TransportRouteLegSmoke[]; // دخان كل محطة في خط سير الطلب بالترتيب
  updated_at: string;
  updated_by?: string;
}

// تموين سولار لسيارة (لترات + سعر + قراءة العدّاد اختيارية)
export interface FuelLog {
  id: string;
  car_id: string;
  date: string; // YYYY-MM-DD
  liters: number;
  price_per_liter: number;
  total_amount: number;
  odometer_km?: number; // قراءة عدّاد السيارة وقت التموين (اختياري)
  driver_id?: string;
  note?: string;
  updated_at: string;
  updated_by?: string;
}

// خطة صيانة وقائية لسيارة (مثلًا: تغيير زيت كل 10,000 كم)
export interface ServicePlan {
  id: string;
  car_id: string;
  name: string;
  interval_km: number;
  last_done_km?: number; // قراءة العدّاد وقت آخر تنفيذ (اختياري)
  last_done_date?: string; // تاريخ آخر تنفيذ
  note?: string;
  updated_at: string;
  updated_by?: string;
}

// تكاليف شهرية لسيارة معينة: مرتب السائق اللي شغال عليها + السولار + الزيت (سجل واحد لكل سيارة+شهر)
export interface CarMonthlyCost {
  id: string;
  car_id: string;
  month: string; // YYYY-MM
  driver_id?: string; // السائق اللي مرتبه محسوب على السيارة في الشهر ده
  salary_amount: number;
  diesel_amount: number;
  oil_amount: number;
  updated_at: string;
  updated_by?: string;
}

// مصاريف وأرباح سيارة معينة في تاريخ تنفيذ معين (يوم كامل) — المسافة الكلية من الجراج للجراج،
// والنولون المحسوب منها، وكل المصاريف اليدوية اللي بترتبط باليوم مش بطلب بعينه
export interface CarDailyCost {
  id: string;
  car_id: string;
  date: string; // تاريخ التنفيذ
  total_distance_km: number; // المسافة الكلية الفعلية من الجراج للجراج (يدوي أو استيراد ملف)
  freight_amount: number; // النولون = المسافة × سعر نوع السيارة، مقترح تلقائيًا وقابل للتعديل
  cards_amount: number; // كارتات (يدوي)
  violations_amount: number; // مخالفات (يدوي)
  tire_wash_amount: number; // غسيل كاوتش (يدوي)
  maintenance_amount: number; // صيانة — محسوبة تلقائيًا من فواتير قسم الصيانة الحقيقية (مش إدخال يدوي)، مخزّنة هنا كلقطة وقت آخر حفظ
  extra_costs: TransportRequestExtraCost[]; // أي بنود إضافية أخرى من الإعدادات
  updated_at: string;
  updated_by?: string;
}

export interface TransportRequest {
  id: string; // UUID
  request_number: string; // رقم الطلب بصيغة سنة+شهر وأرقام تسلسلية من 4 خانات، مثال: 2608-0001
  requester_name: string; // اسم الطالب
  farm_name: string; // مكان الطلب (نقطة التحميل/البداية)
  destinations: string[]; // الواجهات بالترتيب بعد نقطة التحميل (وجهة التفريغ، ثم أي وجهة إضافية...)
  car_type: string; // نوع السيارة المطلوبة (جامبو / دبابة / ملاكي)
  cargo_description: string; // وصف الحمولة
  request_date: string; // تاريخ الطلب (تاريخ التسجيل)
  execution_date?: string; // تاريخ التنفيذ الفعلي — يتحدد تلقائيًا عند التعليم كـ"منتهي"، وقابل للتعديل لاحقًا
  status: 'new' | 'in_progress' | 'done'; // جديد (بدون سيارة) / جاري (تم الرد بسيارة) / منتهى (تم التوصيل)
  assigned_car_id?: string; // السيارة التي تم الرد بها على الطلب
  assigned_driver_id?: string; // السائق المرتبط بالسيارة، يُضاف تلقائيًا
  responded_at?: string; // وقت الرد بالسيارة
  delivered_at?: string; // وقت انتهاء التوصيل
  created_by?: string; // اسم المستخدم الذي سجل الطلب
  // ====== رحلة السائق (بتتحدث من تطبيق السائق) ======
  trip_status?: TripStatus; // مرحلة الرحلة الحالية — بتبدأ بـ assigned أول ما يتم الرد بسيارة
  trip_leg?: number; // رقم الوجهة الحالية (يبدأ من 0) داخل destinations
  trip_log?: TripEvent[]; // سجل المراحل بأوقاتها
  finish_odometer?: number; // عداد السيارة عند الانتهاء (كم)
  expected_smoke?: number; // الدخان المتوقع اللي كتبه السائق عند الانتهاء
}

// مراحل رحلة السائق:
//  assigned: تم الرد بسيارة وبانتظار قبول السائق → accepted: قبل وفي الطريق للتحميل
//  → at_pickup: وصل مكان التحميل → loaded: استلم الحمولة وفي الطريق للوجهة
//  → at_destination: وصل الوجهة (لو فيه وجهة تانية يتوجه لها وترجع loaded)
//  → heading_garage: في الطريق للجراج → finished: تم الانتهاء (العداد + الدخان المتوقع)
export type TripStatus = 'assigned' | 'accepted' | 'at_pickup' | 'loaded' | 'at_destination' | 'heading_garage' | 'finished';

export interface TripEvent {
  status: TripStatus;
  at: string; // ISO
  leg?: number; // رقم الوجهة وقت الحدث (للمراحل loaded/at_destination)
  by?: string; // 'office' لو المكتب هو اللي أنهى الرحلة يدويًا
}

export interface DriverAccountMovement {
  id: string;
  driver_id: string;
  car_id?: string; // السيارة المستهدفة بالخصم أو الحركة لتخصيص المخالفات
  date: string; // تاريخ الحركة
  description: string; // تفاصيل الحركة
  amount_change: number; // التغيير في الرصيد (مثال: -200 أو +200)
  new_balance: number; // الرصيد النهائي بعد الحركة
  type: 'deduction' | 'violation' | 'payment' | 'reversal'; // نوع الحركة
}

// ====== قسم الصيانة — مبني فوق قاعدة بيانات السيارات الحالية (car_id = Car.id)، بدون أي تكرار لبياناتها ======

export type MaintenanceRequestStatus =
  | 'new'              // عطل جديد — بانتظار إجراء مدير الصيانة
  | 'parts_requested'  // طلب قطع غيار — عند شاشة قطع الغيار
  | 'parts_purchased'  // تم الشراء — عند مدير الصيانة لتوجيهه للورشة
  | 'in_workshop'      // جاري الصيانة بالورشة
  | 'pending_invoice'  // تم الانتهاء — بانتظار كتابة الفاتورة
  | 'invoice_review'   // الفاتورة اتحفظت — بانتظار اعتماد مدير الصيانة
  | 'invoice_approved' // الفاتورة معتمدة — بانتظار الطباعة والإغلاق
  | 'repaired'         // تم الإصلاح — بانتظار استلام مسجّل الطلب
  | 'receipt_rejected' // رفض الاستلام — عند مدير الصيانة
  | 'closed';          // مغلق

// بند قطعة غيار داخل طلب الصيانة — المصدر بيحدد هل بتتحسب تكلفة عليها وقت الفاتورة (ورشة خارجية) أو لا (مخزن الشركة)
export interface MaintenancePartItem {
  id: string;
  name: string; // اسم القطعة
  source: 'company_stock' | 'external_workshop'; // مخزن الشركة / الورشة الخارجية
  quantity: number;
}

// سجل مراحل طلب الصيانة: كل نقل أو إرجاع بيتسجل بتاريخه واسم اللي عمله وسبب الإرجاع
export interface MaintenanceStageEntry {
  status: MaintenanceRequestStatus;
  at: string; // ISO
  by?: string;
  kind: 'create' | 'advance' | 'return';
  note?: string;
}

export interface MaintenanceRequest {
  id: string;
  request_number: string; // رقم طلب الصيانة
  car_id: string; // ربط أساسي بالسيارة الموجودة فعليًا في قاعدة بيانات الأسطول — المعرّف الوحيد المعتمد
  fault_description: string; // وصف العطل
  workshop_type: 'company' | 'external'; // صيانة داخل الشركة / ورشة خارجية
  workshop_name?: string; // اسم الورشة الخارجية (لو النوع external)
  request_date: string; // تاريخ تسجيل طلب الصيانة
  maintenance_date?: string; // تاريخ تنفيذ الصيانة الفعلي
  status: MaintenanceRequestStatus;
  parts: MaintenancePartItem[]; // بنود طلب قطع الغيار — جزء من نفس الطلب (بدون تكرار في جدول منفصل)
  work_performed: string; // الأعمال التي تم تنفيذها (وصف حر يتراكم مع تقدم الحالة)
  created_by?: string; // اسم المستخدم اللي سجل الطلب
  invoice_id?: string; // الفاتورة المرتبطة بالطلب لو اتعملت
  stage_history?: MaintenanceStageEntry[]; // سجل المراحل (نقل/إرجاع/سبب)
  odometer?: number; // عداد السيارة وقت العطل (كم) — بيسجله مدير الصيانة
  km_since_last?: number; // المسافة (كم) من آخر عطل لنفس السيارة — بتتحسب وقت تسجيل العداد
  purchase_invoice_image?: string; // صورة فاتورة شراء قطع الغيار (مضغوطة، data URL)
}

// بند في فاتورة الصيانة — قطع غيار (منسوخة تلقائيًا من طلب الصيانة) أو مصنعية (المحاسب بيضيفها يدويًا)
export interface MaintenanceInvoiceItem {
  id: string;
  description: string;
  item_type: 'parts' | 'labor'; // قطع غيار / مصنعية
  source?: 'company_stock' | 'external_workshop'; // لبنود القطع بس — لتمييز المصدر ومنع الحساب المزدوج
  quantity: number;
  unit_price: number;
  total: number;
}

export interface MaintenanceInvoice {
  id: string;
  invoice_number: string;
  maintenance_request_id: string; // ربط بطلب الصيانة
  car_id: string; // ربط مباشر بالسيارة (نفس معرّف طلب الصيانة، لسهولة الاستعلام)
  items: MaintenanceInvoiceItem[]; // قطع الغيار (تلقائي) + المصنعية (يدوي من المحاسب)
  discount: number; // الخصم
  status: 'draft' | 'approved' | 'paid'; // تحت المراجعة / معتمدة / مصروفة
  invoice_date: string;
  created_by?: string;
}


// ====== الإشعارات ======
// إشعار واحد لكل حدث على طلب (نقل أو صيانة). بيظهر لكل مستخدم عنده صلاحية على أي شاشة من target_screens،
// وحالة القراءة لكل مستخدم لوحده (read_by = معرّفات المستخدمين اللي قرأوه).
export type NotificationEntity = 'transport' | 'maintenance';

export interface AppNotification {
  id: string;
  kind: string; // نوع الحدث (مثلاً maintenance_new / transport_created)
  title: string;
  body: string;
  entity_type: NotificationEntity;
  entity_id: string; // معرّف طلب النقل أو الصيانة
  target_screens: string[]; // الشاشات المعنية بالإشعار بالترتيب (أول شاشة متاحة للمستخدم هي اللي بتتفتح)
  created_at: string; // ISO
  created_by?: string;
  read_by: string[];
}
